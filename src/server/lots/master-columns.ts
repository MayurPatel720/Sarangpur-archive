import { randomBytes } from 'node:crypto';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import { isoDayToDmy } from '@/lib/date-range';
import { LOT_SOURCES, MASTER_COLUMN_PREFIX, type LotSource, type MasterColumnDef } from '@/lib/master-custom';
import { LotItem } from '@/models/LotItem';
import { MasterColumn } from '@/models/MasterColumn';
import { can } from '@/server/permissions';
import type { MasterColumnsBody, MasterColumnsResponse } from '@/types/master';

/** Custom columns of the Master Excel, oldest first (the order they were added in). */
export async function listMasterColumns(): Promise<MasterColumnsResponse> {
  await connectToDatabase();
  const docs = await MasterColumn.find().sort({ createdAt: 1 }).lean();
  const columns: MasterColumnDef[] = docs.map((d) => ({
    key: d.key,
    label: d.label,
    kind: d.kind,
    source: (d.source as LotSource | null) ?? null,
  }));
  return { columns };
}

/**
 * Adds a column (anyone who can open the Master Excel) or removes one (admins: `lists:manage`).
 * Removing also wipes what was typed into a free-text column.
 */
export async function updateMasterColumns(body: MasterColumnsBody, ctx: MutationContext): Promise<MasterColumnsResponse> {
  await connectToDatabase();
  if (body.removeKey) {
    if (!can(ctx.grants, 'lists:manage')) throw new HttpError(403, 'Only an admin can remove a Master Excel column.');
    const doc = await MasterColumn.findOneAndDelete({ key: body.removeKey }).lean();
    if (!doc) throw new HttpError(404, 'Column not found.');
    if (doc.kind === 'text') await LotItem.updateMany({ [`masterCustom.${doc.key}`]: { $exists: true } }, { $unset: { [`masterCustom.${doc.key}`]: '' } });
    return listMasterColumns();
  }
  const add = body.add;
  if (!add) throw new HttpError(400, 'Nothing to change.');
  const label = add.label.trim();
  if (add.kind === 'lot' && !add.source) throw new HttpError(400, 'Pick which lot detail this column shows.');
  const clash = await MasterColumn.findOne({ label: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (clash) throw new HttpError(409, `There is already a column called “${clash.label}”.`);
  await MasterColumn.create({
    key: `${MASTER_COLUMN_PREFIX}${randomBytes(4).toString('hex')}`,
    label,
    kind: add.kind,
    source: add.kind === 'lot' ? add.source : null,
    createdBy: ctx.userId,
    createdByName: ctx.userName,
  });
  return listMasterColumns();
}

/** What the lot shows for a fetched column. */
export interface LotDetails {
  owner?: { name?: string | null; phone?: string | null; email?: string | null; address?: string | null } | null;
  pointsOfContact?: { name?: string | null; phone?: string | null }[] | null;
  facilitator?: { name?: string | null; phone?: string | null } | null;
  locationReceiver?: { name?: string | null; phone?: string | null } | null;
  originSource?: string | null;
  dateReceived?: Date | null;
}

export function lotDetailText(lot: LotDetails, source: LotSource): string {
  switch (source) {
    case 'ownerName':
      return lot.owner?.name ?? '';
    case 'ownerPhone':
      return lot.owner?.phone ?? '';
    case 'ownerEmail':
      return lot.owner?.email ?? '';
    case 'ownerAddress':
      return lot.owner?.address ?? '';
    case 'originSource':
      return lot.originSource ?? '';
    case 'dateReceived':
      return lot.dateReceived ? isoDayToDmy(new Date(lot.dateReceived).toISOString().slice(0, 10)) : '';
    case 'contactName':
      return lot.pointsOfContact?.[0]?.name ?? '';
    case 'contactPhone':
      return lot.pointsOfContact?.[0]?.phone ?? '';
    case 'facilitatorName':
      return lot.facilitator?.name ?? '';
    case 'facilitatorPhone':
      return lot.facilitator?.phone ?? '';
    case 'receiverName':
      return lot.locationReceiver?.name ?? '';
    case 'receiverPhone':
      return lot.locationReceiver?.phone ?? '';
  }
}

export const LOT_SOURCE_LABELS = Object.fromEntries(LOT_SOURCES.map((s) => [s.id, s.label])) as Record<LotSource, string>;
