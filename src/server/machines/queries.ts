import { SERVICE_SOON_DAYS } from '@/lib/machine';
import { connectToDatabase } from '@/lib/mongo';
import { HttpError } from '@/lib/api';
import { Machine, type MachineDoc } from '@/models/Machine';
import type { Machine as MachineShape, MachineListQuery, MachineListResponse, MachineSummary } from '@/types/machine';

/** Plain-data shapes and reads for the machines register. */

type Lean = MachineDoc & { _id: unknown; createdAt?: Date };

export function shapeSummary(d: Lean): MachineSummary {
  return {
    id: String(d._id),
    code: d.code,
    name: d.name,
    category: d.category ?? null,
    make: d.make ?? null,
    model: d.model ?? null,
    serialNo: d.serialNo ?? null,
    location: d.location ?? null,
    condition: d.condition,
    inUse: d.inUse,
    loanedTo: d.loanedTo ?? null,
    openRepairs: d.openRepairs,
    nextServiceDue: d.nextServiceDue ?? null,
  };
}

export function shapeMachine(d: Lean): MachineShape {
  return {
    ...shapeSummary(d),
    version: d.version ?? null,
    sourceType: d.sourceType,
    sourceName: d.sourceName ?? null,
    sourceContact: d.sourceContact ?? null,
    acquiredOn: d.acquiredOn ?? null,
    notes: d.notes ?? null,
    serviceEveryMonths: d.serviceEveryMonths ?? null,
    lastServicedOn: d.lastServicedOn ?? null,
    parts: d.parts.map((p) => ({
      id: String((p as { _id: unknown })._id),
      name: p.name,
      partNo: p.partNo ?? null,
      qty: p.qty,
      note: p.note ?? null,
    })),
    loans: d.loans
      .map((l) => ({
        id: String((l as { _id: unknown })._id),
        borrower: l.borrower,
        purpose: l.purpose ?? null,
        issuedOn: l.issuedOn,
        expectedReturn: l.expectedReturn ?? null,
        returnedOn: l.returnedOn ?? null,
        conditionOut: l.conditionOut,
        conditionIn: l.conditionIn ?? null,
        note: l.note ?? null,
      }))
      .reverse(),
    repairs: d.repairs
      .map((r) => ({
        id: String((r as { _id: unknown })._id),
        fault: r.fault,
        reportedOn: r.reportedOn,
        resolvedOn: r.resolvedOn ?? null,
        vendor: r.vendor ?? null,
        cost: r.cost ?? null,
        billRef: r.billRef ?? null,
        outcome: r.outcome ?? null,
      }))
      .reverse(),
    history: d.history.map((h) => ({ at: new Date(h.at).toISOString(), by: h.by, kind: h.kind, text: h.text })),
    createdAt: (d.createdAt ?? new Date(0)).toISOString(),
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listMachines(query: MachineListQuery): Promise<MachineListResponse> {
  await connectToDatabase();
  const today = query.today ?? new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.parse(today) + SERVICE_SOON_DAYS * 86_400_000).toISOString().slice(0, 10);
  const dueFilter = { nextServiceDue: { $ne: null, $lte: soon } };

  const filter: Record<string, unknown> = {};
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { make: rx }, { model: rx }, { serialNo: rx }, { location: rx }, { category: rx }];
  }
  if (query.condition) filter.condition = query.condition;
  if (query.usage) filter.inUse = query.usage === 'in_use';
  if (query.loan) filter.loanedTo = query.loan === 'out' ? { $ne: null } : null;
  if (query.service === 'due') Object.assign(filter, dueFilter);

  const [docs, total, all, working, needsRepair, notWorking, onLoan, serviceDue] = await Promise.all([
    Machine.find(filter)
      .sort({ name: 1, code: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    Machine.countDocuments(filter),
    Machine.countDocuments({}),
    Machine.countDocuments({ condition: 'working' }),
    Machine.countDocuments({ condition: 'needs_repair' }),
    Machine.countDocuments({ condition: 'not_working' }),
    Machine.countDocuments({ loanedTo: { $ne: null } }),
    Machine.countDocuments(dueFilter),
  ]);

  return {
    rows: docs.map((d) => shapeSummary(d as Lean)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    counts: { all, working, needsRepair, notWorking, onLoan, serviceDue },
  };
}

export async function getMachine(id: string): Promise<{ machine: MachineShape }> {
  await connectToDatabase();
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new HttpError(404, 'Machine not found.');
  const doc = await Machine.findById(id).lean();
  if (!doc) throw new HttpError(404, 'Machine not found.');
  return { machine: shapeMachine(doc as Lean) };
}
