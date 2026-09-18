import type { PipelineStage } from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { ActivityLog, ArchiveLot } from '@/models';
import {
  ACTIVITY_SEVERITY,
  BOARD_STAGES,
  IN_FLIGHT_STAGES,
  STAGE_LABELS,
  type ActivityKind,
  type Stage,
} from '@/lib/domain';
import {
  lotFacetPipeline,
  pipelineBoardPipeline,
  recentActivityPipeline,
  type DashboardWindow,
  type Pipeline,
} from './pipelines';
import type {
  ActivityResponse,
  AlertsResponse,
  PipelineResponse,
  Severity,
  SummaryResponse,
} from '@/types/dashboard';

const DAY_MS = 86_400_000;

/**
 * The pipeline builders return plain data so they can also run outside Mongoose (see
 * scripts/verify-pipelines.ts). Mongoose wants its own deeply-typed PipelineStage
 * union, which no hand-written object literal can satisfy, so the cast happens here in
 * exactly one place rather than being sprinkled through the query functions.
 */
const asPipeline = (p: Pipeline): PipelineStage[] => p as unknown as PipelineStage[];

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function buildWindow(now = new Date()): DashboardWindow {
  return {
    now,
    windowStart: new Date(now.getTime() - 30 * DAY_MS),
    previousWindowStart: new Date(now.getTime() - 60 * DAY_MS),
    decisionSlaCutoff: new Date(now.getTime() - envInt('ALERT_DECISION_PENDING_DAYS', 5) * DAY_MS),
    scanSlaCutoff: new Date(now.getTime() - envInt('ALERT_SCAN_STUCK_DAYS', 10) * DAY_MS),
  };
}

/* ------------------------------------------------------------ facet plumbing */

interface CountBucket {
  n?: number;
}
interface StageBucket {
  _id: Stage;
  n: number;
}

export interface LotFacetResult {
  totalLots: CountBucket[];
  receivedThisWindow: CountBucket[];
  receivedPreviousWindow: CountBucket[];
  byStage: StageBucket[];
  decisionOverdue: { n: number; oldest: Date | string }[];
  scanOverdue: { n: number; itemsOutstanding: number }[];
  scanProgress: { lots: number; expected: number; found: number }[];
  overridesPending: CountBucket[];
  mlsDuplicates: { lots: number; duplicates: number }[];
  awaitingMlsTag: CountBucket[];
  returnsPending: CountBucket[];
  returnsOverdue: { n: number; physicalOriginals: number }[];
  storage: { bytes: number }[];
}

/** $facet returns an empty array for a sub-pipeline that matched nothing. */
function first<T>(rows: T[] | undefined): T | undefined {
  return rows && rows.length > 0 ? rows[0] : undefined;
}
function count(rows: CountBucket[] | undefined): number {
  return first(rows)?.n ?? 0;
}

const TB = 1_000_000_000_000;

function round(value: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function daysSince(value: Date | string, now: Date): number {
  const then = value instanceof Date ? value : new Date(value);
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

/* ------------------------------------------------------------------ summary */

export function shapeSummary(
  facet: LotFacetResult,
  window: DashboardWindow,
): SummaryResponse {
  const byStage = new Map<Stage, number>(facet.byStage.map((b) => [b._id, b.n]));
  const stageCount = (s: Stage) => byStage.get(s) ?? 0;

  const received = count(facet.receivedThisWindow);
  const receivedPrev = count(facet.receivedPreviousWindow);
  const delta = received - receivedPrev;

  const decisionOverdue = first(facet.decisionOverdue);
  const scan = first(facet.scanProgress);
  const duplicates = first(facet.mlsDuplicates);
  const returnsOverdue = first(facet.returnsOverdue);
  const returnsPending = count(facet.returnsPending);
  const storageBytes = first(facet.storage)?.bytes ?? 0;

  const scanExpected = scan?.expected ?? 0;
  const scanFound = scan?.found ?? 0;
  const scanPercent = scanExpected > 0 ? Math.round((scanFound / scanExpected) * 100) : 0;

  const decisionSlaDays = envInt('ALERT_DECISION_PENDING_DAYS', 5);
  const capacityTb = envInt('ARCHIVE_STORAGE_CAPACITY_TB', 96);
  const usedTb = round(storageBytes / TB, 1);

  const activeLotCount = IN_FLIGHT_STAGES.reduce((sum, s) => sum + stageCount(s), 0);

  return {
    generatedAt: window.now.toISOString(),
    activeLotCount,
    totalLotCount: count(facet.totalLots),
    storage: {
      usedTb,
      capacityTb,
      percent: capacityTb > 0 ? Math.round((usedTb / capacityTb) * 100) : 0,
    },
    kpis: [
      {
        key: 'received',
        label: 'Lots received',
        value: received,
        note:
          delta === 0
            ? 'Unchanged vs previous 30 days'
            : `${delta > 0 ? '+' : ''}${delta} vs previous 30 days`,
        noteSeverity: delta > 0 ? 'good' : delta < 0 ? 'warning' : 'neutral',
      },
      {
        key: 'awaiting_decision',
        label: 'Awaiting decision',
        value: stageCount('decision'),
        note: decisionOverdue
          ? `${decisionOverdue.n} past the ${decisionSlaDays}-day threshold`
          : 'All within the review threshold',
        noteSeverity: decisionOverdue ? 'critical' : 'neutral',
      },
      {
        key: 'in_digitization',
        label: 'In digitization',
        value: stageCount('scanning'),
        note: `${scanExpected.toLocaleString('en-IN')} items · ${scanPercent}% scanned`,
        noteSeverity: 'neutral',
      },
      {
        key: 'awaiting_mls_tag',
        label: 'Awaiting MLS tag',
        value: count(facet.awaitingMlsTag),
        note: duplicates
          ? `${duplicates.duplicates} duplicate${duplicates.duplicates === 1 ? '' : 's'} flagged for review`
          : 'No duplicates flagged',
        noteSeverity: duplicates ? 'warning' : 'neutral',
      },
      {
        key: 'returns_overdue',
        label: 'Returns overdue',
        value: returnsOverdue?.n ?? 0,
        note: `of ${returnsPending} return${returnsPending === 1 ? '' : 's'} pending`,
        noteSeverity: (returnsOverdue?.n ?? 0) > 0 ? 'critical' : 'neutral',
      },
    ],
  };
}

export async function getSummary(now = new Date()): Promise<SummaryResponse> {
  await connectToDatabase();
  const window = buildWindow(now);
  const [facet] = await ArchiveLot.aggregate<LotFacetResult>(asPipeline(lotFacetPipeline(window)));
  if (!facet) throw new Error('Summary aggregation returned no facet document');
  return shapeSummary(facet, window);
}

/* ------------------------------------------------------------------- alerts */

export function shapeAlerts(facet: LotFacetResult, window: DashboardWindow): AlertsResponse {
  const decisionOverdue = first(facet.decisionOverdue);
  const scanOverdue = first(facet.scanOverdue);
  const overrides = count(facet.overridesPending);
  const returnsOverdue = first(facet.returnsOverdue);
  const duplicates = first(facet.mlsDuplicates);

  const decisionDays = envInt('ALERT_DECISION_PENDING_DAYS', 5);
  const scanDays = envInt('ALERT_SCAN_STUCK_DAYS', 10);

  const candidates: AlertsResponse['alerts'] = [
    {
      key: 'decision_overdue',
      title: `Decision pending beyond ${decisionDays} days`,
      detail: decisionOverdue
        ? `Receiver / in-charge notified · oldest is day ${daysSince(decisionOverdue.oldest, window.now)}`
        : 'Receiver / in-charge notified',
      count: decisionOverdue?.n ?? 0,
      severity: 'critical',
      href: '/decision',
    },
    {
      key: 'scan_stuck',
      title: `Stuck in digitize queue beyond ${scanDays} days`,
      detail: scanOverdue
        ? `Scan team notified · ${scanOverdue.itemsOutstanding.toLocaleString('en-IN')} items affected`
        : 'Scan team notified',
      count: scanOverdue?.n ?? 0,
      severity: 'warning',
      href: '/digitize',
    },
    {
      key: 'override_pending',
      title: 'Override requests awaiting approval',
      detail: 'Pending with Lead Pujya Sant / Admin',
      count: overrides,
      severity: 'info',
      href: '/decision?filter=override',
    },
    {
      key: 'return_overdue',
      title: 'Return past agreed duration',
      detail: returnsOverdue
        ? `Return handler notified · ${returnsOverdue.physicalOriginals} ${returnsOverdue.physicalOriginals === 1 ? 'is a physical original' : 'are physical originals'}`
        : 'Return handler notified',
      count: returnsOverdue?.n ?? 0,
      severity: 'critical',
      href: '/returns',
    },
    {
      key: 'mls_duplicate',
      title: 'MLS duplicate found',
      detail: 'Flagged for Lead review before retain / remove / merge',
      count: duplicates?.duplicates ?? 0,
      severity: 'info',
      href: '/mls',
    },
  ];

  // An alert with a count of zero is noise, not information.
  const alerts = candidates.filter((a) => a.count > 0);

  return {
    totalOpen: alerts.reduce((sum, a) => sum + a.count, 0),
    alerts,
  };
}

export async function getAlerts(now = new Date()): Promise<AlertsResponse> {
  await connectToDatabase();
  const window = buildWindow(now);
  const [facet] = await ArchiveLot.aggregate<LotFacetResult>(asPipeline(lotFacetPipeline(window)));
  if (!facet) throw new Error('Alerts aggregation returned no facet document');
  return shapeAlerts(facet, window);
}

/* ----------------------------------------------------------------- pipeline */

export interface BoardBucket {
  _id: Stage;
  count: number;
  samples: {
    id: unknown;
    lotReference: string;
    namingCode?: string | null;
    stage: Stage;
    stageEnteredAt: Date | string;
    quantity: number;
    format: string;
    mediaSubtype: string;
    overrideStatus?: string | null;
    duplicatesFound?: number | null;
    expectedFileCount?: number | null;
    foundFileCount?: number | null;
    taggedCount?: number | null;
    returnMethod?: string | null;
    discardReason?: string | null;
  }[];
}

const STAGE_ACCENT: Record<Stage, Severity> = {
  intake: 'neutral',
  decision: 'warning',
  metadata: 'neutral',
  scanning: 'info',
  mls_tag: 'neutral',
  storage: 'neutral',
  returned: 'neutral',
  discarded: 'neutral',
};

/** One short line per card, chosen by what is actually interesting at that stage. */
function sampleNote(
  s: BoardBucket['samples'][number],
  now: Date,
): { note: string; severity: Severity; progressPercent: number | null } {
  const waiting = daysSince(s.stageEnteredAt, now);

  switch (s.stage) {
    case 'scanning': {
      const expected = s.expectedFileCount ?? 0;
      const found = s.foundFileCount ?? 0;
      return {
        note: `${found} / ${expected} files`,
        severity: expected > 0 && found >= expected ? 'good' : 'neutral',
        progressPercent: expected > 0 ? Math.round((found / expected) * 100) : 0,
      };
    }
    case 'decision':
      if (s.overrideStatus === 'requested') {
        return { note: 'Override requested', severity: 'critical', progressPercent: null };
      }
      return {
        note: waiting === 0 ? 'Entered today' : `Day ${waiting} in stage`,
        severity: 'neutral',
        progressPercent: null,
      };
    case 'mls_tag':
      if ((s.duplicatesFound ?? 0) > 0) {
        return { note: 'Duplicate found', severity: 'critical', progressPercent: null };
      }
      return {
        note: `Tags ${s.taggedCount ?? 0} / ${s.quantity}`,
        severity: 'neutral',
        progressPercent: null,
      };
    case 'intake':
      return {
        note: `${s.quantity} ${s.mediaSubtype.toLowerCase()} · ${waiting === 0 ? 'today' : `${waiting}d ago`}`,
        severity: 'neutral',
        progressPercent: null,
      };
    default:
      return {
        note: waiting === 0 ? 'Entered today' : `Day ${waiting} in stage`,
        severity: 'neutral',
        progressPercent: null,
      };
  }
}

export function shapeBoard(buckets: BoardBucket[], now: Date): PipelineResponse {
  const byStage = new Map(buckets.map((b) => [b._id, b]));

  const stages = BOARD_STAGES.map((stage) => {
    const bucket = byStage.get(stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: bucket?.count ?? 0,
      accent: STAGE_ACCENT[stage],
      samples: (bucket?.samples ?? []).map((s) => {
        const { note, severity, progressPercent } = sampleNote(s, now);
        return {
          id: String(s.id),
          code: s.namingCode ?? s.lotReference,
          note,
          noteSeverity: severity,
          progressPercent,
        };
      }),
    };
  });

  return {
    // Only the in-flight stages count as 'active' — a lot in storage is finished.
    totalActive: stages
      .filter((s) => IN_FLIGHT_STAGES.includes(s.stage))
      .reduce((sum, s) => sum + s.count, 0),
    stages,
  };
}

export async function getPipelineBoard(now = new Date()): Promise<PipelineResponse> {
  await connectToDatabase();
  const buckets = await ArchiveLot.aggregate<BoardBucket>(
    asPipeline(pipelineBoardPipeline(buildWindow(now))),
  );
  return shapeBoard(buckets, now);
}

/* ----------------------------------------------------------------- activity */

export interface ActivityRow {
  _id: unknown;
  kind: ActivityKind;
  title: string;
  detail?: string | null;
  lotCode: string;
  actorName: string;
  at: Date | string;
}

export function shapeActivity(rows: ActivityRow[]): ActivityResponse {
  return {
    entries: rows.map((r) => ({
      id: String(r._id),
      kind: r.kind,
      title: r.title,
      detail: r.detail ?? '',
      lotCode: r.lotCode,
      actorName: r.actorName,
      at: (r.at instanceof Date ? r.at : new Date(r.at)).toISOString(),
      severity: ACTIVITY_SEVERITY[r.kind] ?? 'neutral',
    })),
  };
}

export async function getRecentActivity(limit = 8): Promise<ActivityResponse> {
  await connectToDatabase();
  const rows = await ActivityLog.aggregate<ActivityRow>(asPipeline(recentActivityPipeline(limit)));
  return shapeActivity(rows);
}
