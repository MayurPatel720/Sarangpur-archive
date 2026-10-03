import { z } from 'zod';
import { OVERRIDE_STATUSES } from '@/lib/domain';

/**
 * Contracts for the intake register (API.md §3).
 *
 * Vocabulary fields (`originSource`, `format`, `dataType`, `notDigitizedReason`,
 * `returnFormat`, `stage`, `decision`, `discardReason`, …) are plain strings at
 * the wire layer. Writes assert them against admin-managed reference lists in
 * `src/server/reference*` (assertActive / assertActiveReferenceValue). Responses
 * accept any historical string so retired values still serialize.
 *
 * `mediaSubtype` — `mediaSubtype.<format>` for photo/video/audio; free text for
 * documents/prasadi when the format list meta `subtypeListKey` is empty (SPEC Q2).
 *
 * Only fixed code-owned enums stay (`verdict`, `overrideStatus`, disposition
 * `'return'|'discard'`, override outcome).
 */

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email('Must be a valid email.').max(160).optional(),
  address: z.string().trim().max(500).optional(),
});
export type LotContactInput = z.input<typeof contactSchema>;

export const rightsSchema = z.object({
  type: z.string().trim().min(1).max(60).optional(),
  deedReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * One row of the intake media table: a format/data-type/sub-type combination
 * with its quantity. The intake form no longer captures the digitization
 * split, so a shortfall is the normal state here — the reason rule lives on
 * the later per-line selection update, not on intake. The `<=` guards stay so
 * a future caller can still pass an explicit split.
 */
export const mediaLineInputSchema = z
  .object({
    format: z.string().trim().min(1).max(40),
    dataType: z.string().trim().min(1).max(40),
    mediaSubtype: z.string().trim().min(1, 'Media sub-type is required.').max(120),
    quantity: z.number().int().min(1, 'Quantity must be at least 1.').max(20000),
    quantityToDigitize: z.number().int().min(0).default(0),
    quantityAlreadyDigitized: z.number().int().min(0).default(0),
    notDigitizedReason: z.string().trim().min(1).max(80).nullable().optional(),
    quantityRemarks: z.string().trim().max(1000).optional(),
  })
  .refine((l) => l.quantityToDigitize <= l.quantity, {
    message: 'Quantity to digitize cannot exceed quantity.',
    path: ['quantityToDigitize'],
  })
  .refine((l) => l.quantityAlreadyDigitized <= l.quantity, {
    message: 'Already-digitized quantity cannot exceed quantity.',
    path: ['quantityAlreadyDigitized'],
  })
  .refine((l) => l.quantityToDigitize + l.quantityAlreadyDigitized <= l.quantity, {
    message: 'Digitize + already-digitized quantities cannot exceed quantity.',
    path: ['quantityToDigitize'],
  });
export type MediaLineInput = z.input<typeof mediaLineInputSchema>;

/** One stored media line, as returned by the detail endpoint. */
const mediaLineSchema = z.object({
  format: z.string(),
  dataType: z.string(),
  mediaSubtype: z.string(),
  mediaSubtypeLabel: z.string(),
  quantity: z.number(),
  quantityToDigitize: z.number(),
  quantityAlreadyDigitized: z.number(),
  notDigitizedReason: z.string().nullable(),
  quantityRemarks: z.string().nullable(),
});
export type MediaLine = z.output<typeof mediaLineSchema>;

/** Per-line item counters backing the per-media-type progress table. */
const lineStatSchema = z.object({
  lineIndex: z.number(),
  total: z.number(),
  selected: z.number(),
  digitized: z.number(),
  tagged: z.number(),
});
export type LineStat = z.output<typeof lineStatSchema>;

export const lotCreateBodySchema = z
  .object({
    dateReceived: z.string().datetime({ offset: true }),
    originSource: z.string().trim().min(1).max(40),
    owner: contactSchema,
    pointsOfContact: z.array(contactSchema).max(5).default([]),
    facilitator: contactSchema.nullable().optional(),
    /**
     * Expandable media table — one row per format/sub-type. The server derives
     * the legacy top-level fields from these (primary = first line, quantities
     * = across-lines sums) so every existing pipeline keeps working.
     */
    mediaLines: z
      .array(mediaLineInputSchema)
      .min(1, 'Add at least one media line.')
      .max(20, 'No more than 20 media lines per lot.'),
    conditionNotes: z.string().trim().max(2000).optional(),
    /** Optional (API.md §3) — a URL or file reference; the upload itself arrives later. */
    conditionPhotoUrl: z.string().trim().min(1).max(500).optional(),
    reasonForSending: z.string().trim().max(1000).optional(),
    senderRemarks: z.string().trim().max(2000).optional(),
    photoDate: z.string().trim().max(80).optional(),
    photoLocation: z.string().trim().max(200).optional(),
    photoEvent: z.string().trim().max(200).optional(),
    peopleInPhoto: z.string().trim().max(1000).optional(),
    digitalFilePath: z.string().trim().max(500).optional(),
    physicalLabelApplied: z.boolean().optional(),
    containerLabelApplied: z.boolean().optional(),
    /** Brief intake return block — captured when the sender wants material back. */
    returnRequested: z.boolean().optional(),
    returnFormat: z.string().trim().min(1).max(40).optional(),
    returnDuration: z.string().trim().max(200).optional(),
    /** Calendar due date for the return, ISO datetime with offset. */
    returnDueAt: z.string().datetime({ offset: true }).optional(),
    rights: rightsSchema.optional(),
  })
  .refine(
    (b) => b.mediaLines.reduce((sum, l) => sum + l.quantity, 0) <= 20000,
    {
      message: 'Total quantity across media lines cannot exceed 20000.',
      path: ['mediaLines'],
    },
  );
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
  stage: z.string().trim().min(1).max(40).optional(),
  decision: z.string().trim().min(1).max(40).optional(),
  format: z.string().trim().min(1).max(40).optional(),
  dataType: z.string().trim().min(1).max(40).optional(),
  receiver: z.string().trim().max(40).optional(),
  receivedFrom: z.string().datetime({ offset: true }).optional(),
  receivedTo: z.string().datetime({ offset: true }).optional(),
  /** User id — "assigned to me" and per-person filters. */
  assignee: z.string().trim().max(40).optional(),
  /** Restrict to lots that belong to this project. */
  projectId: z.string().trim().max(40).optional(),
  /** Powers the returns queue (`return.status ∈ {pending, in_progress}`). */
  returnStatus: z.union([z.string().trim().min(1).max(40), z.array(z.string().trim().min(1).max(40))]).optional(),
});
export type LotListQuery = z.output<typeof lotListQuerySchema>;

export const lotRowSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  namingCode: z.string().nullable(),
  /** Null while a project child lot is still waiting for its intake details. */
  dateReceived: z.string().nullable(),
  ownerName: z.string(),
  assigneeName: z.string().nullable(),
  pointOfContactName: z.string().nullable(),
  format: z.string(),
  mediaSubtype: z.string(),
  quantity: z.number(),
  dataType: z.string(),
  decision: z.string(),
  stage: z.string(),
  receiverName: z.string(),
  returnLabel: z.string(),
  returnSeverity: z.enum(['neutral', 'info', 'good', 'warning', 'critical']),
});
export type LotRow = z.output<typeof lotRowSchema>;

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
  dateReceived: z.string().nullable(),
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
  format: z.string(),
  dataType: z.string(),
  mediaSubtype: z.string(),
  mediaSubtypeLabel: z.string(),
  quantity: z.number(),
  quantityToDigitize: z.number(),
  quantityAlreadyDigitized: z.number(),
  quantityRemarks: z.string().nullable(),
  /** Per-media-type breakdown + per-line item counters (F2). */
  mediaLines: z.array(mediaLineSchema),
  lineStats: z.array(lineStatSchema),
  conditionNotes: z.string().nullable(),
  conditionPhotoUrl: z.string().nullable(),
  reasonForSending: z.string().nullable(),
  senderRemarks: z.string().nullable(),
  photoDate: z.string().nullable(),
  photoLocation: z.string().nullable(),
  photoEvent: z.string().nullable(),
  peopleInPhoto: z.string().nullable(),
  digitalFilePath: z.string().nullable(),
  physicalLabelApplied: z.boolean(),
  containerLabelApplied: z.boolean(),
  rights: z.object({
    type: z.string().nullable(),
    typeLabel: z.string().nullable(),
    deedReference: z.string().nullable(),
    notes: z.string().nullable(),
  }),
  stage: z.string(),
  stageEnteredAt: z.string(),
  stageEnteredByName: z.string().nullable(),
  decision: z.string(),
  decisionDetail: z.object({
    status: z.string(),
    verdict: z.enum(['archive', 'return_or_discard']).nullable(),
    decidedByName: z.string().nullable(),
    decidedAt: z.string().nullable(),
    existsInMls: z.boolean().nullable(),
    newCopyIsBetter: z.boolean().nullable(),
    conditionUsable: z.boolean().nullable(),
    conditionIssue: z.string().nullable(),
    mlsMatchPaths: z.array(z.string()),
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
    scannedByName: z.string().nullable(),
    scanDate: z.string().nullable(),
    folderPath: z.string().nullable(),
    expectedFileCount: z.number(),
    foundFileCount: z.number(),
    lastReconciledAt: z.string().nullable(),
    mlsRecordId: z.string().nullable(),
    mlsTaggedCount: z.number(),
    mlsTagsApplied: z.string().nullable(),
    mlsDataListAttached: z.boolean(),
    mlsDuplicatesFound: z.number(),
    mlsDuplicateAction: z.string().nullable(),
    returnStatus: z.string(),
    returnFormat: z.string(),
    returnRequested: z.boolean(),
    returnDuration: z.string().nullable(),
    returnDueAt: z.string().nullable(),
    returnedAt: z.string().nullable(),
    returnHandledByName: z.string().nullable(),
    returnMethod: z.string().nullable(),
    discardReason: z.string().nullable(),
    discardedByName: z.string().nullable(),
    discardedAt: z.string().nullable(),
    discardNotes: z.string().nullable(),
  }),
  attachmentCount: z.number(),
  /** Project this lot's shared intake data is synced with, if any. */
  syncProject: z.object({ id: z.string(), code: z.string(), name: z.string(), siblingCount: z.number() }).nullable(),
  assignee: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** Required intake fields still empty — the Intake→Decision gate. */
  intakeMissing: z.array(z.string()),
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
    dateReceived: z.string().datetime({ offset: true }).optional(),
    originSource: z.string().trim().min(1).max(40).optional(),
    format: z.string().trim().min(1).max(40).optional(),
    dataType: z.string().trim().min(1).max(40).optional(),
    notDigitizedReason: z.string().trim().min(1).max(40).nullable().optional(),
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
    photoDate: z.string().trim().max(80).nullable().optional(),
    photoLocation: z.string().trim().max(200).nullable().optional(),
    photoEvent: z.string().trim().max(200).nullable().optional(),
    peopleInPhoto: z.string().trim().max(1000).nullable().optional(),
    digitalFilePath: z.string().trim().max(500).nullable().optional(),
    physicalLabelApplied: z.boolean().optional(),
    containerLabelApplied: z.boolean().optional(),
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
    /** One answer per active `significance` question, in list order. */
    significanceFlags: z.array(z.boolean()).min(1).max(24),
    notes: z.string().trim().max(2000).optional(),
    disposition: z.enum(['return', 'discard']).optional(),
    /** Required when disposition is discard (brief §3.08). */
    discardReason: z.string().trim().min(1).max(40).optional(),
    discardNotes: z.string().trim().max(2000).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.existsInMls && newCopyIsBetterMissing(b)) {
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
    if (b.disposition === 'discard' && !b.discardReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a discard reason.',
        path: ['discardReason'],
      });
    }
  });

function newCopyIsBetterMissing(b: { newCopyIsBetter?: boolean }): boolean {
  return b.newCopyIsBetter === undefined;
}
export type DecisionBody = z.input<typeof decisionBodySchema>;

export const decisionResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  namingCode: z.string().nullable(),
  verdict: z.enum(['archive', 'return_or_discard']),
  decision: z.string(),
  stage: z.string(),
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
  stage: z.string(),
  version: z.number(),
});
export type SubmitResponse = z.output<typeof submitResponseSchema>;

/** PUT /api/lots/[lotId]/media-lines — replace the media table while the lot is in Intake. */
export const lotMediaLinesBodySchema = z
  .object({
    version: z.number().int().min(0),
    mediaLines: z.array(mediaLineInputSchema).min(1).max(20),
  })
  .refine((b) => b.mediaLines.reduce((sum, l) => sum + l.quantity, 0) <= 20000, {
    message: 'Total quantity across media lines cannot exceed 20000.',
    path: ['mediaLines'],
  });
export type LotMediaLinesBody = z.input<typeof lotMediaLinesBodySchema>;
export const lotMediaLinesResponseSchema = z.object({
  id: z.string(),
  lotReference: z.string(),
  quantity: z.number(),
  version: z.number(),
});
