import { z } from 'zod';
import {
  DATA_TYPES,
  DECISIONS,
  FORMATS,
  NOT_DIGITIZED_REASONS,
  ORIGIN_SOURCES,
  OVERRIDE_STATUSES,
  RETURN_STATUSES,
  STAGES,
} from '@/lib/domain';

/**
 * Contracts for the intake register (API.md §3).
 *
 * Body mirrors the intake form. Two vocabulary fields are validated against
 * admin-managed reference lists at the API layer, not here:
 * - `mediaSubtype` — `mediaSubtype.<format>` for photo/video/audio; free text
 *   for documents/prasadi (SPEC Q2: those sub-type lists are still blank).
 * - `rights.type` — the `rightsType` list, when provided.
 */

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email('Must be a valid email.').max(160).optional(),
  address: z.string().trim().max(500).optional(),
});
export type LotContactInput = z.input<typeof contactSchema>;

const rightsSchema = z.object({
  type: z.string().trim().min(1).max(60).optional(),
  deedReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const lotCreateBodySchema = z
  .object({
    dateReceived: z.string().datetime({ offset: true }),
    originSource: z.enum(ORIGIN_SOURCES),
    owner: contactSchema,
    pointsOfContact: z.array(contactSchema).max(5).default([]),
    facilitator: contactSchema.nullable().optional(),
    format: z.enum(FORMATS),
    dataType: z.enum(DATA_TYPES),
    mediaSubtype: z.string().trim().min(1, 'Media sub-type is required.').max(120),
    quantity: z.number().int().min(1, 'Quantity must be at least 1.').max(20000),
    quantityToDigitize: z.number().int().min(0).default(0),
    quantityAlreadyDigitized: z.number().int().min(0).default(0),
    notDigitizedReason: z.enum(NOT_DIGITIZED_REASONS).nullable().optional(),
    quantityRemarks: z.string().trim().max(1000).optional(),
    conditionNotes: z.string().trim().max(2000).optional(),
    /** Required (API.md §3) — upload arrives later; for now a URL or file reference. */
    conditionPhotoUrl: z.string().trim().min(1, 'A condition photo is required.').max(500),
    reasonForSending: z.string().trim().max(1000).optional(),
    senderRemarks: z.string().trim().max(2000).optional(),
    rights: rightsSchema.optional(),
  })
  .refine((b) => b.quantityToDigitize <= b.quantity, {
    message: 'Quantity to digitize cannot exceed quantity.',
    path: ['quantityToDigitize'],
  })
  .refine((b) => b.quantityAlreadyDigitized <= b.quantity, {
    message: 'Already-digitized quantity cannot exceed quantity.',
    path: ['quantityAlreadyDigitized'],
  })
  .refine((b) => b.quantityToDigitize + b.quantityAlreadyDigitized <= b.quantity, {
    message: 'Digitize + already-digitized quantities cannot exceed quantity.',
    path: ['quantityToDigitize'],
  });
export type LotCreateBody = z.input<typeof lotCreateBodySchema>;

export const lotCreateResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  itemsCreated: z.number(),
});

/** Query params for GET /api/lots. `sort` allows `-` prefix for desc. */
export const lotListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .enum([
      'dateReceived',
      '-dateReceived',
      'stage',
      '-stage',
      'quantity',
      '-quantity',
      'stageEnteredAt',
      '-stageEnteredAt',
    ])
    .default('-dateReceived'),
  q: z.string().trim().max(120).optional(),
  stage: z.enum(STAGES).optional(),
  decision: z.enum(DECISIONS).optional(),
  format: z.enum(FORMATS).optional(),
  dataType: z.enum(DATA_TYPES).optional(),
  receiver: z.string().trim().max(40).optional(),
  receivedFrom: z.string().datetime({ offset: true }).optional(),
  receivedTo: z.string().datetime({ offset: true }).optional(),
  /** Powers the returns queue (`return.status ∈ {pending, in_progress}`). */
  returnStatus: z.union([z.enum(RETURN_STATUSES), z.array(z.enum(RETURN_STATUSES))]).optional(),
});
export type LotListQuery = z.output<typeof lotListQuerySchema>;

const lotRowSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  namingCode: z.string().nullable(),
  dateReceived: z.string(),
  ownerName: z.string(),
  pointOfContactName: z.string().nullable(),
  format: z.enum(FORMATS),
  mediaSubtype: z.string(),
  quantity: z.number(),
  dataType: z.enum(DATA_TYPES),
  decision: z.enum(DECISIONS),
  stage: z.enum(STAGES),
  receiverName: z.string(),
  returnLabel: z.string(),
  returnSeverity: z.enum(['neutral', 'info', 'good', 'warning', 'critical']),
});

export const lotListResponseSchema = z.object({
  rows: z.array(lotRowSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type LotListResponse = z.output<typeof lotListResponseSchema>;

const lotDetailSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  namingCode: z.string().nullable(),
  originSource: z.string().nullable(),
  dateReceived: z.string(),
  receiver: z.object({ id: z.string(), name: z.string() }),
  owner: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
  }),
  pointsOfContact: z.array(
    z.object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      address: z.string().nullable(),
    }),
  ),
  facilitator: z
    .object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      address: z.string().nullable(),
    })
    .nullable(),
  format: z.enum(FORMATS),
  dataType: z.enum(DATA_TYPES),
  mediaSubtype: z.string(),
  mediaSubtypeLabel: z.string(),
  quantity: z.number(),
  quantityToDigitize: z.number(),
  quantityAlreadyDigitized: z.number(),
  quantityRemarks: z.string().nullable(),
  conditionNotes: z.string().nullable(),
  conditionPhotoUrl: z.string().nullable(),
  reasonForSending: z.string().nullable(),
  senderRemarks: z.string().nullable(),
  rights: z.object({
    type: z.string().nullable(),
    typeLabel: z.string().nullable(),
    deedReference: z.string().nullable(),
    notes: z.string().nullable(),
  }),
  stage: z.enum(STAGES),
  stageEnteredAt: z.string(),
  decision: z.enum(DECISIONS),
  decisionDetail: z.object({
    status: z.enum(DECISIONS),
    verdict: z.enum(['archive', 'return_or_discard']).nullable(),
    decidedByName: z.string().nullable(),
    decidedAt: z.string().nullable(),
    existsInMls: z.boolean().nullable(),
    conditionUsable: z.boolean().nullable(),
    significanceFlags: z.array(z.boolean()).nullable(),
    notes: z.string().nullable(),
    overrideStatus: z.enum(OVERRIDE_STATUSES),
    overrideRequestedByName: z.string().nullable(),
    overrideApprovedByName: z.string().nullable(),
  }),
  itemCounts: z.object({
    total: z.number(),
    selected: z.number(),
    digitized: z.number(),
    tagged: z.number(),
    duplicates: z.number(),
  }),
  /**
   * Live operations state for the working sections on the detail screen
   * (scan / MLS / return / discard). Plain values; labels resolve client-side
   * from domain.ts so no Tier-1 union grows here.
   */
  ops: z.object({
    scanStatus: z.string(),
    folderPath: z.string().nullable(),
    expectedFileCount: z.number(),
    foundFileCount: z.number(),
    lastReconciledAt: z.string().nullable(),
    mlsRecordId: z.string().nullable(),
    mlsTaggedCount: z.number(),
    mlsDataListAttached: z.boolean(),
    mlsDuplicatesFound: z.number(),
    mlsDuplicateAction: z.string().nullable(),
    returnStatus: z.string(),
    returnFormat: z.string(),
    discardReason: z.string().nullable(),
  }),
  attachmentCount: z.number(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const lotDetailResponseSchema = z.object({ lot: lotDetailSchema });
export type LotDetailResponse = z.output<typeof lotDetailResponseSchema>;

/** PATCH /api/lots/[lotId] — partial intake-field update + optimistic-concurrency version. */
export const lotPatchBodySchema = z
  .object({
    version: z.number().int().min(0),
    originSource: z.enum(ORIGIN_SOURCES).optional(),
    owner: contactSchema.optional(),
    pointsOfContact: z.array(contactSchema).max(5).optional(),
    facilitator: contactSchema.nullable().optional(),
    mediaSubtype: z.string().trim().min(1).max(120).optional(),
    quantityToDigitize: z.number().int().min(0).optional(),
    quantityRemarks: z.string().trim().max(1000).nullable().optional(),
    conditionNotes: z.string().trim().max(2000).nullable().optional(),
    conditionPhotoUrl: z.string().trim().min(1).max(500).optional(),
    reasonForSending: z.string().trim().max(1000).nullable().optional(),
    senderRemarks: z.string().trim().max(2000).nullable().optional(),
    rights: rightsSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 1, { message: 'Nothing to change.' });
export type LotPatchBody = z.input<typeof lotPatchBodySchema>;

export const lotPatchResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  version: z.number(),
});

/**
 * POST /api/lots/[lotId]/decision (API.md §4). The verdict is computed on the
 * server — `disposition` picks return vs discard when the verdict is
 * return_or_discard; when the verdict is archive a disposition contradicts it
 * and needs an approved override (else 400).
 */
export const decisionBodySchema = z
  .object({
    existsInMls: z.boolean(),
    /** Required when existsInMls — is this copy better than the MLS one? */
    newCopyIsBetter: z.boolean().optional(),
    mlsMatchPaths: z.array(z.string().trim().max(500)).max(50).default([]),
    conditionUsable: z.boolean(),
    /** Required when !conditionUsable — stored on the audit entry. */
    conditionIssue: z.string().trim().max(2000).optional(),
    significanceFlags: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
    notes: z.string().trim().max(2000).optional(),
    disposition: z.enum(['return', 'discard']).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.existsInMls && b.newCopyIsBetter === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'State whether this copy is better — the lot already exists in MLS.',
        path: ['newCopyIsBetter'],
      });
    }
    if (!b.conditionUsable && !b.conditionIssue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Describe the condition issue — condition was marked unusable.',
        path: ['conditionIssue'],
      });
    }
  });
export type DecisionBody = z.input<typeof decisionBodySchema>;

export const decisionResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  namingCode: z.string().nullable(),
  verdict: z.enum(['archive', 'return_or_discard']),
  decision: z.enum(DECISIONS),
  stage: z.enum(STAGES),
  version: z.number(),
});
export type DecisionResponse = z.output<typeof decisionResponseSchema>;

/** POST /api/lots/[lotId]/override — justification lives on the audit entry. */
export const overrideRequestBodySchema = z.object({
  justification: z.string().trim().min(1, 'A justification is required.').max(2000),
});
export type OverrideRequestBody = z.input<typeof overrideRequestBodySchema>;

/** PATCH /api/lots/[lotId]/override (lead_reviewer, admin). */
export const overrideDecideBodySchema = z.object({
  outcome: z.enum(['approved', 'rejected']),
});
export type OverrideDecideBody = z.input<typeof overrideDecideBodySchema>;

export const overrideResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  overrideStatus: z.enum(OVERRIDE_STATUSES),
  version: z.number(),
});
export type OverrideResponse = z.output<typeof overrideResponseSchema>;

/** POST /api/lots/[lotId]/submit — intake → decision. Empty body. */
export const submitResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  stage: z.enum(STAGES),
  version: z.number(),
});
export type SubmitResponse = z.output<typeof submitResponseSchema>;
