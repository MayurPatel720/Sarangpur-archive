import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';
import { MACHINE_CONDITIONS, MACHINE_HISTORY_KINDS, MACHINE_SOURCES } from '@/lib/machine';

/**
 * One machine of the archive (recorder, camera, scanner, computer…), with everything about it
 * in one document: where it came from, its spare parts, who it was lent to, its repairs and a
 * short history. The embedded lists are small (tens of entries), so one read gives the whole
 * detail page and one write keeps them consistent. `loanedTo` / `openRepairs` / `nextServiceDue`
 * are denormalised so the list can filter and show them without opening every machine.
 */
const day = { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ };

const partSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    partNo: { type: String, trim: true, default: null, maxlength: 60 },
    qty: { type: Number, required: true, default: 1, min: 0, max: 100000 },
    note: { type: String, trim: true, default: null, maxlength: 300 },
  },
  { timestamps: false },
);

const loanSchema = new Schema(
  {
    borrower: { type: String, required: true, trim: true, maxlength: 120 },
    purpose: { type: String, trim: true, default: null, maxlength: 300 },
    issuedOn: { ...day, required: true },
    expectedReturn: day,
    returnedOn: day,
    conditionOut: { type: String, enum: MACHINE_CONDITIONS, required: true },
    conditionIn: { type: String, enum: MACHINE_CONDITIONS, default: null },
    note: { type: String, trim: true, default: null, maxlength: 300 },
  },
  { timestamps: false },
);

const repairSchema = new Schema(
  {
    fault: { type: String, required: true, trim: true, maxlength: 400 },
    reportedOn: { ...day, required: true },
    resolvedOn: day,
    vendor: { type: String, trim: true, default: null, maxlength: 120 },
    cost: { type: Number, default: null, min: 0 },
    billRef: { type: String, trim: true, default: null, maxlength: 120 },
    outcome: { type: String, trim: true, default: null, maxlength: 400 },
  },
  { timestamps: false },
);

const historySchema = new Schema(
  {
    at: { type: Date, required: true, default: () => new Date() },
    by: { type: String, required: true, trim: true },
    kind: { type: String, enum: MACHINE_HISTORY_KINDS, required: true },
    text: { type: String, required: true, trim: true, maxlength: 400 },
  },
  { _id: false },
);

const machineSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // MCH-0001
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, trim: true, default: null, maxlength: 60 },
    make: { type: String, trim: true, default: null, maxlength: 80 },
    model: { type: String, trim: true, default: null, maxlength: 80 },
    version: { type: String, trim: true, default: null, maxlength: 60 },
    serialNo: { type: String, trim: true, default: null, maxlength: 80 },

    // Where we got it from
    sourceType: { type: String, enum: MACHINE_SOURCES, required: true, default: 'purchased' },
    sourceName: { type: String, trim: true, default: null, maxlength: 160 },
    sourceContact: { type: String, trim: true, default: null, maxlength: 160 },
    acquiredOn: day,

    location: { type: String, trim: true, default: null, maxlength: 120 },
    condition: { type: String, enum: MACHINE_CONDITIONS, required: true, default: 'working' },
    inUse: { type: Boolean, required: true, default: false },
    notes: { type: String, trim: true, default: null, maxlength: 1000 },

    // Maintenance
    serviceEveryMonths: { type: Number, default: null, min: 1, max: 120 },
    lastServicedOn: day,
    nextServiceDue: day, // denormalised: interval + (last service | acquired)

    parts: { type: [partSchema], default: [] },
    loans: { type: [loanSchema], default: [] },
    repairs: { type: [repairSchema], default: [] },
    history: { type: [historySchema], default: [] }, // newest first, capped

    // Denormalised for the list
    loanedTo: { type: String, default: null },
    openRepairs: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: 'machines' },
);

machineSchema.index({ createdAt: -1 });
machineSchema.index({ condition: 1 });
machineSchema.index({ loanedTo: 1 });
machineSchema.index({ nextServiceDue: 1 });
machineSchema.index({ name: 1 });

export type MachineDoc = InferSchemaType<typeof machineSchema>;

export const Machine: Model<MachineDoc> =
  (models.Machine as Model<MachineDoc>) ?? model<MachineDoc>('Machine', machineSchema);
