import { z } from 'zod';
import { gridItemSchema } from './items';

/**
 * Master Excel contracts: every item of every lot the caller may see, one row each, with the
 * lot and project it belongs to. Server-side paginated and filtered (AGENTS rule 6).
 */

const text = z.string().trim().max(120).optional();
/** Yes / No / empty (blank) filter for a three-state or flag column. */
const yesNo = z.enum(['yes', 'no', 'blank']).optional();

export const masterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  /** Media format; also bounded by the caller's `format:*` grants. */
  format: text,
  // Lot / project
  lot: text,
  project: text,
  stage: text,
  dataType: text,
  // Details
  code: text,
  senderCode: text,
  /** `dd/mm/yyyy` or a range: items whose date range overlaps it. */
  date: text,
  place: text,
  nameOnTape: text,
  nameOnCase: text,
  physicalSource: text,
  remarks: text,
  duplicateCode: text,
  // Decision
  digital: yesNo,
  redigital: yesNo,
  discard: yesNo,
  decisionRemark: text,
  result: z.enum(['archive', 'discard', 'physical', 'undecided']).optional(),
  // Digitalization & Storage
  captured: yesNo,
  digitalSource: text,
  fileName: text,
  phyStorageLoc: text,
  disposition: z.enum(['return', 'discard', 'blank']).optional(),
  taggedInMls: yesNo,
  storageRemark: text,
  // Logging
  logged: yesNo,
  loggerName: text,
});
export type MasterQuery = z.output<typeof masterQuerySchema>;
export type MasterQueryInput = z.input<typeof masterQuerySchema>;

export const masterRowSchema = gridItemSchema.extend({
  lotId: z.string(),
  lotReference: z.string(),
  lotStage: z.string(),
  /** The lot's project code, '' when the lot is standalone. */
  projectCode: z.string(),
  projectName: z.string(),
  assigneeName: z.string(),
});
export type MasterRow = z.output<typeof masterRowSchema>;

export const masterResponseSchema = z.object({
  rows: z.array(masterRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type MasterResponse = z.output<typeof masterResponseSchema>;
