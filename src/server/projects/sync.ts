import { Types, type HydratedDocument } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { TERMINAL_STAGES } from '@/lib/domain';
import { ArchiveLot, type ArchiveLotDoc } from '@/models/ArchiveLot';
import { Project } from '@/models/Project';
import { withAudit, auditActor } from '@/server/audit';
import { can } from '@/server/permissions';
import { assertActiveReferenceValue } from '@/server/reference';
import { SHARED_KEYS, type ProjectSharedPatch } from '@/types/project';

/**
 * Shared-data sync between a project and its child lots.
 *
 * `Project.shared` holds ONE value per shared intake field (wire shape, see
 * `projectSharedSchema`). Every lot with `syncProjectId === project._id` mirrors it.
 * An edit anywhere — on the project page or on any child lot — goes through here so
 * the project and every sibling end up identical.
 *
 * Per-lot fields (media lines, file path, label flags) are never synced.
 * Each sibling write goes through `withAudit()` (rule 1), so every lot keeps its own
 * activity entry; `skipAccessCheck` is used because the authority was already
 * verified on the originating record.
 */

type Lot = HydratedDocument<ArchiveLotDoc>;

const TEXT_KEYS = [
  'conditionNotes',
  'reasonForSending',
  'senderRemarks',
  'photoDate',
  'photoLocation',
  'photoEvent',
  'peopleInPhoto',
] as const;

/** Keys of a lot PATCH body that are shared (the lot-side vocabulary of SHARED_KEYS). */
export const LOT_PATCH_SHARED_KEYS = [
  'dateReceived',
  'originSource',
  'owner',
  'pointsOfContact',
  'facilitator',
  'conditionNotes',
  'conditionPhotoUrl',
  'reasonForSending',
  'senderRemarks',
  'photoDate',
  'photoLocation',
  'photoEvent',
  'peopleInPhoto',
  'rights',
] as const satisfies readonly (typeof SHARED_KEYS)[number][];

/** Apply a shared patch to one lot's in-memory document. `null` clears. */
export function applySharedToLot(lot: Lot, patch: ProjectSharedPatch): void {
  const p = patch as Record<string, unknown>;
  if ('dateReceived' in p) lot.dateReceived = p.dateReceived ? new Date(p.dateReceived as string) : null;
  if ('originSource' in p) lot.originSource = (p.originSource as string | null) ?? undefined;
  if ('owner' in p) lot.owner = ((p.owner as unknown) ?? undefined) as typeof lot.owner;
  if ('pointsOfContact' in p) {
    lot.pointsOfContact = ((p.pointsOfContact as unknown) ?? []) as typeof lot.pointsOfContact;
  }
  if ('facilitator' in p) lot.facilitator = ((p.facilitator as unknown) ?? null) as typeof lot.facilitator;
  if ('conditionPhotoUrl' in p) {
    lot.conditionPhotoUrl = (p.conditionPhotoUrl as string | null) ?? undefined;
  }
  for (const k of TEXT_KEYS) {
    if (k in p) (lot as unknown as Record<string, unknown>)[k] = p[k] ?? null;
  }
  if ('rights' in p) {
    const r = p.rights as { type?: string; deedReference?: string; notes?: string } | null;
    lot.rights = {
      type: r?.type ?? null,
      deedReference: r?.deedReference ?? null,
      notes: r?.notes ?? null,
    };
  }
  if ('returnRequested' in p) {
    const requested = Boolean(p.returnRequested);
    lot.set('return.requested', requested);
    const status = lot.return?.status;
    if (requested && status === 'not_requested') lot.set('return.status', 'pending');
    if (!requested && status === 'pending') lot.set('return.status', 'not_requested');
  }
  if ('returnFormat' in p) lot.set('return.format', p.returnFormat ?? 'none');
  if ('returnDuration' in p) lot.set('return.durationText', p.returnDuration ?? null);
  if ('returnDueAt' in p) lot.set('return.dueAt', p.returnDueAt ? new Date(p.returnDueAt as string) : null);
}

/** Reject retired/unknown vocabulary in a shared patch (same rules as intake). */
export async function assertSharedVocab(patch: ProjectSharedPatch): Promise<void> {
  await Promise.all([
    patch.originSource ? assertActiveReferenceValue('originSource', patch.originSource) : null,
    patch.returnFormat ? assertActiveReferenceValue('returnFormat', patch.returnFormat) : null,
    patch.rights?.type ? assertActiveReferenceValue('rightsType', patch.rights.type) : null,
  ]);
}

/** Merge a patch into the project's shared object (null removes the key). */
export async function mergeProjectShared(
  projectId: Types.ObjectId | string,
  patch: ProjectSharedPatch,
): Promise<void> {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) $unset[`shared.${k}`] = 1;
    else $set[`shared.${k}`] = v;
  }
  const update: Record<string, unknown> = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  if (Object.keys(update).length) await Project.updateOne({ _id: projectId }, update);
}

/** Push a shared patch to every synced lot of a project (optionally excluding one). */
export async function fanOutShared(
  projectId: Types.ObjectId | string,
  patch: ProjectSharedPatch,
  ctx: MutationContext,
  opts: { excludeLotId?: string; detail?: string } = {},
): Promise<number> {
  const filter: Record<string, unknown> = { syncProjectId: projectId };
  if (opts.excludeLotId) filter._id = { $ne: new Types.ObjectId(opts.excludeLotId) };
  // Finished lots are locked unless the actor may edit them (same rule as patchLot).
  if (!can(ctx.grants, 'lot:editTerminal')) filter.stage = { $nin: TERMINAL_STAGES };
  const lots = await ArchiveLot.find(filter).select('_id').lean();
  for (const l of lots) {
    await withAudit({
      lotId: String(l._id),
      actor: auditActor(ctx),
      skipAccessCheck: true,
      kind: 'intake_updated',
      title: 'Shared project details updated',
      detail: opts.detail,
      mutate: async (lot) => {
        applySharedToLot(lot, patch);
        return null;
      },
    });
  }
  return lots.length;
}

const clean = <T extends Record<string, unknown>>(o: T | null | undefined) => {
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '') out[k] = v;
  return out;
};


/** Read the shared values (wire form) off a lot for the given keys. Empty → null. */
export function lotSharedPatch(
  lot: {
    dateReceived?: Date | null;
    originSource?: string | null;
    owner?: unknown;
    pointsOfContact?: unknown[] | null;
    facilitator?: unknown;
    rights?: unknown;
    return?: { requested?: boolean; format?: string; durationText?: string | null; dueAt?: Date | null } | null;
  } & Record<string, unknown>,
  keys: readonly string[],
): ProjectSharedPatch {
  const patch: Record<string, unknown> = {};
  for (const k of keys) {
    switch (k) {
      case 'dateReceived':
        patch.dateReceived = lot.dateReceived ? new Date(lot.dateReceived).toISOString() : null;
        break;
      case 'originSource':
        patch.originSource = lot.originSource ?? null;
        break;
      case 'owner':
        patch.owner = clean(lot.owner as Record<string, unknown> | null);
        break;
      case 'pointsOfContact':
        patch.pointsOfContact = (lot.pointsOfContact ?? []).map((c) => clean(c as Record<string, unknown>));
        break;
      case 'facilitator':
        patch.facilitator = clean(lot.facilitator as Record<string, unknown> | null);
        break;
      case 'rights': {
        const r = clean(lot.rights as Record<string, unknown> | null);
        patch.rights = r && Object.keys(r).length ? r : null;
        break;
      }
      case 'returnRequested':
        patch.returnRequested = lot.return?.requested ? true : null;
        break;
      case 'returnFormat':
        patch.returnFormat = lot.return?.format && lot.return.format !== 'none' ? lot.return.format : null;
        break;
      case 'returnDuration':
        patch.returnDuration = lot.return?.durationText ?? null;
        break;
      case 'returnDueAt':
        patch.returnDueAt = lot.return?.dueAt ? new Date(lot.return.dueAt).toISOString() : null;
        break;
      default:
        patch[k] = (lot[k] as string | null | undefined) ?? null;
    }
  }
  return patch as ProjectSharedPatch;
}

/**
 * After a child lot's own edit: read back the shared keys it changed and push them to
 * the project and every sibling. Keys are the lot-side names in `LOT_PATCH_SHARED_KEYS`.
 */
export async function propagateFromLot(
  lotId: string,
  keys: readonly string[],
  ctx: MutationContext,
): Promise<void> {
  const lot = await ArchiveLot.findById(lotId).lean();
  if (!lot?.syncProjectId || keys.length === 0) return;
  const project = await Project.findById(lot.syncProjectId).select('code').lean();
  if (!project) return;
  const patch = lotSharedPatch(lot, keys);
  await mergeProjectShared(lot.syncProjectId, patch as ProjectSharedPatch);
  await fanOutShared(lot.syncProjectId, patch as ProjectSharedPatch, ctx, {
    excludeLotId: lotId,
    detail: `Changed on ${lot.lotReference} · project ${project.code}`,
  });
}

/** Project's current shared values as a patch (used when attaching a lot: project wins). */
export function sharedAsPatch(shared: unknown): ProjectSharedPatch {
  return (shared ?? {}) as ProjectSharedPatch;
}
