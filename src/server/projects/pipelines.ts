/**
 * Project read pipelines — plain data, zero Mongoose imports (AGENTS.md rule 2).
 * Verified without a database through `scripts/verify-pipelines.ts` (mingo).
 *
 * The id arguments are typed `unknown` on purpose: production callers pass
 * ObjectIds (`project._id`, `lot._id`), while the verify script passes the
 * plain-string ids of its fixtures. Equality matching behaves the same either
 * way, so one pipeline definition serves both worlds.
 */

export type Pipeline = Record<string, unknown>[];

/** Member-lot counts grouped by stage: the project's pipeline board. */
export function projectLotStagesPipeline(projectId: unknown): Pipeline {
  return [
    { $match: { projectIds: projectId } },
    { $group: { _id: '$stage', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ];
}

/**
 * Item counters across a set of lots. The caller resolves the member lot ids
 * with a plain indexed find first — a second indexed aggregation, not a
 * $lookup (rule 4). Same counters as the lot-detail rollup in lots/queries.
 */
export function projectItemStatsPipeline(lotIds: unknown[]): Pipeline {
  return [
    { $match: { lot: { $in: lotIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        selected: { $sum: { $cond: ['$selectedForDigitization', 1, 0] } },
        digitized: { $sum: { $cond: ['$digitized', 1, 0] } },
        tagged: { $sum: { $cond: ['$taggedInMls', 1, 0] } },
      },
    },
  ];
}

/** Latest project-trail entries for the detail header (project-side audit). */
export function projectActivityPipeline(projectId: unknown, limit: number): Pipeline {
  return [{ $match: { project: projectId } }, { $sort: { at: -1 } }, { $limit: limit }];
}
