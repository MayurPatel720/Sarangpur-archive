import type { HydratedDocument } from 'mongoose';
import type { MutationContext } from '@/lib/api';
import { HttpError } from '@/lib/api';
import { connectToDatabase } from '@/lib/mongo';
import {
  MACHINE_CONDITION_LABELS,
  MAX_MACHINE_HISTORY,
  nextServiceDue,
  type MachineHistoryKind,
} from '@/lib/machine';
import { Machine, type MachineDoc } from '@/models/Machine';
import { nextSequence } from '@/server/codes';
import { assertRealDay } from '@/server/tasks/mutations';
import { shapeMachine } from '@/server/machines/queries';
import type {
  Machine as MachineShape,
  MachineCreateBody,
  MachineEventBody,
  MachinePatchBody,
} from '@/types/machine';

/**
 * Machine writes. A machine is one document, so every change is one `save()`; mongoose's
 * version key guards the embedded lists against two people editing at once. Each change adds a
 * line to the machine's own history (who, when, what).
 */

type Doc = HydratedDocument<MachineDoc>;
type Result = { machine: MachineShape };

function assertId(id: string): void {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new HttpError(404, 'Machine not found.');
}

function log(doc: Doc, ctx: MutationContext, kind: MachineHistoryKind, text: string): void {
  doc.history.unshift({ at: new Date(), by: ctx.userName, kind, text } as never);
  if (doc.history.length > MAX_MACHINE_HISTORY) doc.history.splice(MAX_MACHINE_HISTORY);
}

/** Re-derives the denormalised list fields after any change. */
function recompute(doc: Doc): void {
  const open = doc.loans.find((l) => !l.returnedOn);
  doc.loanedTo = open ? open.borrower : null;
  doc.openRepairs = doc.repairs.filter((r) => !r.resolvedOn).length;
  doc.nextServiceDue = nextServiceDue(doc.serviceEveryMonths ?? null, doc.lastServicedOn ?? null, doc.acquiredOn ?? null);
}

const cond = (c: keyof typeof MACHINE_CONDITION_LABELS) => MACHINE_CONDITION_LABELS[c];
const clean = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

async function load(id: string): Promise<Doc> {
  await connectToDatabase();
  assertId(id);
  const doc = await Machine.findById(id);
  if (!doc) throw new HttpError(404, 'Machine not found.');
  return doc;
}

export async function createMachine(body: MachineCreateBody, ctx: MutationContext): Promise<Result> {
  await connectToDatabase();
  if (body.acquiredOn) assertRealDay(body.acquiredOn);
  const seq = await nextSequence('machine');
  const doc = new Machine({
    code: `MCH-${String(seq).padStart(4, '0')}`,
    name: body.name,
    category: clean(body.category),
    make: clean(body.make),
    model: clean(body.model),
    version: clean(body.version),
    serialNo: clean(body.serialNo),
    sourceType: body.sourceType ?? 'purchased',
    sourceName: clean(body.sourceName),
    sourceContact: clean(body.sourceContact),
    acquiredOn: body.acquiredOn ?? null,
    location: clean(body.location),
    condition: body.condition ?? 'working',
    inUse: body.inUse ?? false,
    notes: clean(body.notes),
    serviceEveryMonths: body.serviceEveryMonths ?? null,
  });
  log(doc, ctx, 'created', 'Added to the register');
  recompute(doc);
  await doc.save();
  return { machine: shapeMachine(doc.toObject()) };
}

export async function updateMachine(id: string, body: MachinePatchBody, ctx: MutationContext): Promise<Result> {
  const doc = await load(id);
  const reason = clean(body.reason);
  const why = reason ? ` — ${reason}` : '';

  if (body.condition !== undefined && body.condition !== doc.condition) {
    log(doc, ctx, 'condition', `Condition: ${cond(doc.condition)} → ${cond(body.condition)}${why}`);
    doc.condition = body.condition;
  }
  if (body.inUse !== undefined && body.inUse !== doc.inUse) {
    log(doc, ctx, 'usage', `${body.inUse ? 'Now in use' : 'Not in use any more'}${why}`);
    doc.inUse = body.inUse;
  }

  let edited = false;
  const set = <K extends keyof MachineDoc>(key: K, value: MachineDoc[K]) => {
    if (doc[key] !== value) {
      (doc as unknown as Record<string, unknown>)[key as string] = value;
      edited = true;
    }
  };
  if (body.name !== undefined) set('name', body.name);
  if (body.category !== undefined) set('category', clean(body.category));
  if (body.make !== undefined) set('make', clean(body.make));
  if (body.model !== undefined) set('model', clean(body.model));
  if (body.version !== undefined) set('version', clean(body.version));
  if (body.serialNo !== undefined) set('serialNo', clean(body.serialNo));
  if (body.sourceType !== undefined) set('sourceType', body.sourceType);
  if (body.sourceName !== undefined) set('sourceName', clean(body.sourceName));
  if (body.sourceContact !== undefined) set('sourceContact', clean(body.sourceContact));
  if (body.acquiredOn !== undefined) {
    if (body.acquiredOn) assertRealDay(body.acquiredOn);
    set('acquiredOn', body.acquiredOn);
  }
  if (body.location !== undefined) set('location', clean(body.location));
  if (body.notes !== undefined) set('notes', clean(body.notes));
  if (body.serviceEveryMonths !== undefined) set('serviceEveryMonths', body.serviceEveryMonths);
  if (edited) log(doc, ctx, 'edited', 'Details edited');

  recompute(doc);
  await doc.save();
  return { machine: shapeMachine(doc.toObject()) };
}

export async function deleteMachine(id: string): Promise<{ ok: true }> {
  await connectToDatabase();
  assertId(id);
  const res = await Machine.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw new HttpError(404, 'Machine not found.');
  return { ok: true };
}

export async function applyMachineEvent(id: string, body: MachineEventBody, ctx: MutationContext): Promise<Result> {
  const doc = await load(id);

  switch (body.type) {
    case 'part.add': {
      doc.parts.push({ name: body.name, partNo: clean(body.partNo), qty: body.qty ?? 1, note: clean(body.note) } as never);
      log(doc, ctx, 'part', `Spare part added: ${body.name} × ${body.qty ?? 1}`);
      break;
    }
    case 'part.update': {
      const part = doc.parts.find((p) => String((p as { _id: unknown })._id) === body.partId);
      if (!part) throw new HttpError(404, 'Part not found.');
      const before = part.qty;
      if (body.name !== undefined) part.name = body.name;
      if (body.partNo !== undefined) part.partNo = clean(body.partNo);
      if (body.qty !== undefined) part.qty = body.qty;
      if (body.note !== undefined) part.note = clean(body.note);
      if (body.qty !== undefined && body.qty !== before) log(doc, ctx, 'part', `${part.name}: stock ${before} → ${body.qty}`);
      break;
    }
    case 'part.remove': {
      const part = doc.parts.find((p) => String((p as { _id: unknown })._id) === body.partId);
      if (!part) throw new HttpError(404, 'Part not found.');
      doc.parts.splice(doc.parts.indexOf(part), 1);
      log(doc, ctx, 'part', `Spare part removed: ${part.name}`);
      break;
    }
    case 'loan.start': {
      if (doc.loans.some((l) => !l.returnedOn)) {
        throw new HttpError(400, `Already lent to ${doc.loanedTo}. Mark it returned first.`);
      }
      assertRealDay(body.issuedOn);
      if (body.expectedReturn) {
        assertRealDay(body.expectedReturn);
        if (body.expectedReturn < body.issuedOn) throw new HttpError(400, 'Expected return is before the issue date.');
      }
      doc.loans.push({
        borrower: body.borrower,
        purpose: clean(body.purpose),
        issuedOn: body.issuedOn,
        expectedReturn: body.expectedReturn ?? null,
        returnedOn: null,
        conditionOut: doc.condition,
        conditionIn: null,
        note: clean(body.note),
      } as never);
      log(doc, ctx, 'loan', `Lent to ${body.borrower}${body.purpose ? ` — ${body.purpose}` : ''}`);
      break;
    }
    case 'loan.return': {
      const loan = doc.loans.find((l) => !l.returnedOn);
      if (!loan) throw new HttpError(400, 'This machine is not lent out.');
      assertRealDay(body.returnedOn);
      if (body.returnedOn < loan.issuedOn) throw new HttpError(400, 'Returned before it was issued.');
      loan.returnedOn = body.returnedOn;
      loan.conditionIn = body.conditionIn;
      if (body.note) loan.note = [loan.note, body.note].filter(Boolean).join(' · ');
      log(doc, ctx, 'loan', `Returned by ${loan.borrower} — ${cond(body.conditionIn)}`);
      if (body.conditionIn !== doc.condition) {
        log(doc, ctx, 'condition', `Condition: ${cond(doc.condition)} → ${cond(body.conditionIn)} (on return)`);
        doc.condition = body.conditionIn;
      }
      break;
    }
    case 'repair.add': {
      assertRealDay(body.reportedOn);
      doc.repairs.push({ fault: body.fault, reportedOn: body.reportedOn, vendor: clean(body.vendor) } as never);
      log(doc, ctx, 'repair', `Repair opened: ${body.fault}`);
      if (doc.condition === 'working') {
        log(doc, ctx, 'condition', `Condition: ${cond('working')} → ${cond('needs_repair')} (repair opened)`);
        doc.condition = 'needs_repair';
      }
      break;
    }
    case 'repair.resolve': {
      const repair = doc.repairs.find((r) => String((r as { _id: unknown })._id) === body.repairId);
      if (!repair) throw new HttpError(404, 'Repair not found.');
      if (repair.resolvedOn) throw new HttpError(400, 'That repair is already closed.');
      assertRealDay(body.resolvedOn);
      if (body.resolvedOn < repair.reportedOn) throw new HttpError(400, 'Resolved before it was reported.');
      repair.resolvedOn = body.resolvedOn;
      if (body.vendor !== undefined) repair.vendor = clean(body.vendor);
      repair.cost = body.cost ?? null;
      repair.billRef = clean(body.billRef);
      repair.outcome = clean(body.outcome);
      log(doc, ctx, 'repair', `Repair closed: ${repair.fault}${body.cost ? ` (₹${body.cost})` : ''}`);
      const after = body.condition ?? 'working';
      if (after !== doc.condition) {
        log(doc, ctx, 'condition', `Condition: ${cond(doc.condition)} → ${cond(after)} (after repair)`);
        doc.condition = after;
      }
      break;
    }
    case 'history.note': {
      log(doc, ctx, 'note', body.text);
      break;
    }
    case 'service.log': {
      assertRealDay(body.servicedOn);
      doc.lastServicedOn = body.servicedOn;
      log(doc, ctx, 'service', `Serviced${body.note ? ` — ${body.note}` : ''}`);
      break;
    }
  }

  recompute(doc);
  await doc.save();
  return { machine: shapeMachine(doc.toObject()) };
}
