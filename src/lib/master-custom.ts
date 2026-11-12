/**
 * Custom columns of the Master Excel. They belong to the Master Excel only (never to a lot's own
 * Items sheet) and are shared by everyone. Two kinds:
 *
 *   text   free text — typed in each row (stored on the item under `masterCustom[key]`)
 *   lot    fetched — the value is read live from a detail the lot already has from intake (owner name,
 *          owner phone …); read-only here
 */

export const MASTER_COLUMN_KINDS = ['text', 'lot'] as const;
export type MasterColumnKind = (typeof MASTER_COLUMN_KINDS)[number];

/** The lot details a fetched column can show. */
export const LOT_SOURCES = [
  { id: 'ownerName', label: 'Owner name' },
  { id: 'ownerPhone', label: 'Owner phone' },
  { id: 'ownerEmail', label: 'Owner email' },
  { id: 'ownerAddress', label: 'Owner place' },
  { id: 'originSource', label: 'Origin source' },
  { id: 'dateReceived', label: 'Date received' },
  { id: 'contactName', label: 'Contact 1 name' },
  { id: 'contactPhone', label: 'Contact 1 phone' },
  { id: 'facilitatorName', label: 'Facilitator name' },
  { id: 'facilitatorPhone', label: 'Facilitator phone' },
  { id: 'receiverName', label: 'Receiver name' },
  { id: 'receiverPhone', label: 'Receiver phone' },
] as const;
export type LotSource = (typeof LOT_SOURCES)[number]['id'];
export const LOT_SOURCE_IDS = LOT_SOURCES.map((s) => s.id) as [LotSource, ...LotSource[]];

export interface MasterColumnDef {
  key: string;
  label: string;
  kind: MasterColumnKind;
  /** For kind `lot`: which lot detail it shows. */
  source: LotSource | null;
}

/** Column ids of custom Master columns all start with this, so they never clash with a built-in id. */
export const MASTER_COLUMN_PREFIX = 'mc_';
