import { z } from 'zod';
import { MACHINE_CONDITIONS, MACHINE_HISTORY_KINDS, MACHINE_SOURCES } from '@/lib/machine';

/**
 * Machines register contracts. Server-paginated list (AGENTS rule 6); the detail returns the
 * whole machine (parts, loans, repairs, history) in one document.
 */

const dayRegex = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(dayRegex, 'Expected a YYYY-MM-DD date.');

export const machineConditionSchema = z.enum(MACHINE_CONDITIONS);
export const machineSourceSchema = z.enum(MACHINE_SOURCES);

export const machineSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  serialNo: z.string().nullable(),
  location: z.string().nullable(),
  condition: machineConditionSchema,
  inUse: z.boolean(),
  loanedTo: z.string().nullable(),
  openRepairs: z.number(),
  nextServiceDue: z.string().nullable(),
});
export type MachineSummary = z.output<typeof machineSummarySchema>;

export const machinePartSchema = z.object({
  id: z.string(),
  name: z.string(),
  partNo: z.string().nullable(),
  qty: z.number(),
  note: z.string().nullable(),
});
export type MachinePart = z.output<typeof machinePartSchema>;

export const machineLoanSchema = z.object({
  id: z.string(),
  borrower: z.string(),
  purpose: z.string().nullable(),
  issuedOn: z.string(),
  expectedReturn: z.string().nullable(),
  returnedOn: z.string().nullable(),
  conditionOut: machineConditionSchema,
  conditionIn: machineConditionSchema.nullable(),
  note: z.string().nullable(),
});
export type MachineLoan = z.output<typeof machineLoanSchema>;

export const machineRepairSchema = z.object({
  id: z.string(),
  fault: z.string(),
  reportedOn: z.string(),
  resolvedOn: z.string().nullable(),
  vendor: z.string().nullable(),
  cost: z.number().nullable(),
  billRef: z.string().nullable(),
  outcome: z.string().nullable(),
});
export type MachineRepair = z.output<typeof machineRepairSchema>;

export const machineHistorySchema = z.object({
  at: z.string(),
  by: z.string(),
  kind: z.enum(MACHINE_HISTORY_KINDS),
  text: z.string(),
});
export type MachineHistory = z.output<typeof machineHistorySchema>;

export const machineSchema = machineSummarySchema.extend({
  version: z.string().nullable(),
  sourceType: machineSourceSchema,
  sourceName: z.string().nullable(),
  sourceContact: z.string().nullable(),
  acquiredOn: z.string().nullable(),
  notes: z.string().nullable(),
  serviceEveryMonths: z.number().nullable(),
  lastServicedOn: z.string().nullable(),
  parts: z.array(machinePartSchema),
  loans: z.array(machineLoanSchema),
  repairs: z.array(machineRepairSchema),
  history: z.array(machineHistorySchema),
  createdAt: z.string(),
});
export type Machine = z.output<typeof machineSchema>;

export const machineResponseSchema = z.object({ machine: machineSchema });
export type MachineResponse = z.output<typeof machineResponseSchema>;

/* ---------------------------------------------------------------------- list */

export const machineListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  condition: machineConditionSchema.optional(),
  usage: z.enum(['in_use', 'idle']).optional(),
  loan: z.enum(['out', 'in']).optional(),
  /** `due` = a service is due within the next 30 days or overdue. */
  service: z.enum(['due']).optional(),
  today: z.string().regex(dayRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type MachineListQuery = z.output<typeof machineListQuerySchema>;

export const machineListResponseSchema = z.object({
  rows: z.array(machineSummarySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  /** Whole-register counters (ignore the filters). */
  counts: z.object({
    all: z.number(),
    working: z.number(),
    needsRepair: z.number(),
    notWorking: z.number(),
    onLoan: z.number(),
    serviceDue: z.number(),
  }),
});
export type MachineListResponse = z.output<typeof machineListResponseSchema>;

/* -------------------------------------------------------------------- writes */

const text = (max: number) => z.string().trim().max(max);

export const machineCreateBodySchema = z.object({
  name: text(120).min(1, 'Give the machine a name.'),
  category: text(60).optional(),
  make: text(80).optional(),
  model: text(80).optional(),
  version: text(60).optional(),
  serialNo: text(80).optional(),
  sourceType: machineSourceSchema.default('purchased'),
  sourceName: text(160).optional(),
  sourceContact: text(160).optional(),
  acquiredOn: day.optional(),
  location: text(120).optional(),
  condition: machineConditionSchema.default('working'),
  inUse: z.boolean().default(false),
  notes: text(1000).optional(),
  serviceEveryMonths: z.number().int().min(1).max(120).optional(),
});
export type MachineCreateBody = z.input<typeof machineCreateBodySchema>;

/** Edit details. Condition and usage changes go through the same patch (they are logged in history). */
export const machinePatchBodySchema = z
  .object({
    name: text(120).min(1),
    category: text(60).nullable(),
    make: text(80).nullable(),
    model: text(80).nullable(),
    version: text(60).nullable(),
    serialNo: text(80).nullable(),
    sourceType: machineSourceSchema,
    sourceName: text(160).nullable(),
    sourceContact: text(160).nullable(),
    acquiredOn: day.nullable(),
    location: text(120).nullable(),
    condition: machineConditionSchema,
    inUse: z.boolean(),
    notes: text(1000).nullable(),
    serviceEveryMonths: z.number().int().min(1).max(120).nullable(),
    /** Why the condition or usage changed (goes in the history line). */
    reason: text(300).optional(),
  })
  .partial()
  .refine((b) => Object.keys(b).some((k) => k !== 'reason'), { message: 'Nothing to change.' });
export type MachinePatchBody = z.input<typeof machinePatchBodySchema>;

/** Everything done to a machine's parts, loans, repairs and servicing. */
export const machineEventBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('part.add'),
    name: text(120).min(1, 'Name the part.'),
    partNo: text(60).optional(),
    qty: z.number().int().min(0).max(100000).default(1),
    note: text(300).optional(),
  }),
  z.object({
    type: z.literal('part.update'),
    partId: z.string(),
    name: text(120).min(1).optional(),
    partNo: text(60).nullable().optional(),
    qty: z.number().int().min(0).max(100000).optional(),
    note: text(300).nullable().optional(),
  }),
  z.object({ type: z.literal('part.remove'), partId: z.string() }),
  z.object({
    type: z.literal('loan.start'),
    borrower: text(120).min(1, 'Who is it going to?'),
    purpose: text(300).optional(),
    issuedOn: day,
    expectedReturn: day.optional(),
    note: text(300).optional(),
  }),
  z.object({
    type: z.literal('loan.return'),
    returnedOn: day,
    conditionIn: machineConditionSchema,
    note: text(300).optional(),
  }),
  z.object({
    type: z.literal('repair.add'),
    fault: text(400).min(1, 'Describe the fault.'),
    reportedOn: day,
    vendor: text(120).optional(),
  }),
  z.object({
    type: z.literal('repair.resolve'),
    repairId: z.string(),
    resolvedOn: day,
    vendor: text(120).optional(),
    cost: z.number().min(0).max(100_000_000).optional(),
    billRef: text(120).optional(),
    outcome: text(400).optional(),
    /** Condition after the repair. */
    condition: machineConditionSchema.default('working'),
  }),
  z.object({ type: z.literal('history.note'), text: text(400).min(1, 'Write a note first.') }),
  z.object({ type: z.literal('service.log'), servicedOn: day, note: text(300).optional() }),
]);
export type MachineEventBody = z.input<typeof machineEventBodySchema>;

export const machineDeleteResponseSchema = z.object({ ok: z.literal(true) });
