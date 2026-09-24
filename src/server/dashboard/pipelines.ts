import type { StageGraph } from '@/server/reference/runtime';
import { defaultStageGraph } from '@/server/reference/runtime';

/**
 * Aggregation pipelines for the dashboard, as plain data.
 *
 * They are deliberately kept free of any Mongoose import so that they can be executed
 * three ways: against MongoDB in the route handlers, against an in-memory query engine
 * in `scripts/verify-pipelines.ts`, and pasted straight into mongosh when debugging.
 *
 * Stage membership (in-flight vs terminal, which stage drives which SLA) comes from
 * `DashboardWindow.stages` — injected by the query layer from the admin `stage` list,
 * or `defaultStageGraph()` when the list is missing.
 *
 * MongoDB caveat worth stating plainly: because there are no foreign keys, a lot whose
 * `receiver` points at a deleted user still counts here. `src/server/integrity.ts`
 * checks for that; in Postgres the database would simply not have allowed it.
 */

export type Pipeline = Record<string, unknown>[];

export interface DashboardWindow {
  now: Date;
  /** Start of the current reporting window (now − 30 days by default). */
  windowStart: Date;
  /** Start of the preceding window of equal length, for the delta. */
  previousWindowStart: Date;
  /** Lots in a decision-SLA stage that entered before this are past the SLA. */
  decisionSlaCutoff: Date;
  /** Lots in a scan-SLA stage that entered before this are past the SLA. */
  scanSlaCutoff: Date;
  /** Alert thresholds — from Settings when available, else env/fallback. */
  decisionPendingDays: number;
  scanStuckDays: number;
  /** Stage graph injected from the admin vocabulary (or domain defaults). */
  stages: StageGraph;
  /** Open return statuses (meta.open) injected from the admin `returnStatus` list. */
  returnOpen: string[];
}

/**
 * One round trip that answers every KPI and alert question.
 *
 * $facet runs each sub-pipeline over the same input stream, so the collection is
 * scanned once instead of eleven times. Each sub-pipeline starts with a $match that an
 * index can serve — see the index declarations in models/ArchiveLot.ts.
 */
export function lotFacetPipeline(w: DashboardWindow): Pipeline {
  const stages = w.stages ?? defaultStageGraph();
  const decisionStages = stages.decision.length > 0 ? stages.decision : ['decision'];
  const scanStages = stages.scan.length > 0 ? stages.scan : ['scanning'];
  const mlsTagStages = stages.mlsTag.length > 0 ? stages.mlsTag : ['mls_tag'];
  const returnOpen = w.returnOpen.length > 0 ? w.returnOpen : ['pending', 'in_progress'];

  return [
    {
      $facet: {
        totalLots: [{ $count: 'n' }],

        receivedThisWindow: [
          { $match: { dateReceived: { $gte: w.windowStart, $lte: w.now } } },
          { $count: 'n' },
        ],

        receivedPreviousWindow: [
          { $match: { dateReceived: { $gte: w.previousWindowStart, $lt: w.windowStart } } },
          { $count: 'n' },
        ],

        byStage: [{ $group: { _id: '$stage', n: { $sum: 1 } } }],

        decisionOverdue: [
          { $match: { stage: { $in: decisionStages }, stageEnteredAt: { $lt: w.decisionSlaCutoff } } },
          { $group: { _id: null, n: { $sum: 1 }, oldest: { $min: '$stageEnteredAt' } } },
        ],

        scanOverdue: [
          { $match: { stage: { $in: scanStages }, stageEnteredAt: { $lt: w.scanSlaCutoff } } },
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              itemsOutstanding: {
                $sum: {
                  $subtract: [
                    '$digitization.expectedFileCount',
                    '$digitization.foundFileCount',
                  ],
                },
              },
            },
          },
        ],

        scanProgress: [
          { $match: { stage: { $in: scanStages } } },
          {
            $group: {
              _id: null,
              lots: { $sum: 1 },
              expected: { $sum: '$digitization.expectedFileCount' },
              found: { $sum: '$digitization.foundFileCount' },
            },
          },
        ],

        overridesPending: [
          { $match: { 'decision.overrideStatus': 'requested' } },
          { $count: 'n' },
        ],

        mlsDuplicates: [
          { $match: { 'mls.duplicatesFound': { $gt: 0 } } },
          {
            $group: {
              _id: null,
              lots: { $sum: 1 },
              duplicates: { $sum: '$mls.duplicatesFound' },
            },
          },
        ],

        awaitingMlsTag: [{ $match: { stage: { $in: mlsTagStages } } }, { $count: 'n' }],

        returnsPending: [
          { $match: { 'return.status': { $in: returnOpen } } },
          { $count: 'n' },
        ],

        returnsOverdue: [
          {
            $match: {
              'return.status': { $in: returnOpen },
              'return.dueAt': { $lt: w.now },
            },
          },
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              physicalOriginals: {
                $sum: {
                  $cond: [{ $in: ['$return.format', ['physical', 'both']] }, 1, 0],
                },
              },
            },
          },
        ],

        storage: [
          { $group: { _id: null, bytes: { $sum: '$digitization.masterBytes' } } },
        ],
      },
    },
  ];
}

/**
 * Stage counts plus the two oldest lots in each stage, for the Kanban board.
 *
 * $sort before $group means $push preserves the ordering, so $slice takes the two
 * that have been waiting longest — which is what a queue board should surface.
 *
 * Scale note: $push buffers every matching document per bucket before $slice trims it.
 * With eight buckets over a few thousand active lots that is comfortably inside the
 * 100MB per-stage limit. If the active set ever grows past ~100k, swap the $group for
 * $topN (MongoDB 5.2+), which trims as it goes.
 */
export function pipelineBoardPipeline(w: DashboardWindow): Pipeline {
  const stages = w.stages ?? defaultStageGraph();
  const inFlight = stages.inFlight.length > 0 ? stages.inFlight : ['intake'];
  const terminal = stages.terminal.length > 0 ? stages.terminal : ['storage', 'returned', 'discarded'];
  return [
    {
      // In-flight stages count current occupancy; terminal stages count arrivals inside
      // the reporting window. Both branches are served by the { stage, stageEnteredAt }
      // compound index.
      $match: {
        $or: [
          { stage: { $in: inFlight } },
          { stage: { $in: terminal }, stageEnteredAt: { $gte: w.windowStart } },
        ],
      },
    },
    { $sort: { stageEnteredAt: 1 } },
    {
      $group: {
        _id: '$stage',
        count: { $sum: 1 },
        samples: {
          $push: {
            id: '$_id',
            lotReference: '$lotReference',
            namingCode: '$namingCode',
            stage: '$stage',
            stageEnteredAt: '$stageEnteredAt',
            quantity: '$quantity',
            format: '$format',
            mediaSubtype: '$mediaSubtype',
            overrideStatus: '$decision.overrideStatus',
            duplicatesFound: '$mls.duplicatesFound',
            expectedFileCount: '$digitization.expectedFileCount',
            foundFileCount: '$digitization.foundFileCount',
            taggedCount: '$mls.taggedCount',
            returnMethod: '$return.method',
            discardReason: '$discard.reason',
          },
        },
      },
    },
    { $project: { count: 1, samples: { $slice: ['$samples', 2] } } },
  ];
}

/**
 * Recent activity. A plain indexed sort — no $lookup, because the actor name and lot
 * code are denormalised onto the entry at write time (see models/ActivityLog.ts).
 */
export function recentActivityPipeline(limit: number): Pipeline {
  return [{ $sort: { at: -1 } }, { $limit: limit }];
}
