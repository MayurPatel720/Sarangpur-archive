/**
 * Machines register: the date helpers, create / edit / delete, spare parts, lending (one loan at a
 * time), repairs (open → closed), servicing and the list filters. Needs a seeded MongoDB.
 *
 *   npm run verify:machines
 */
import './load-env';

import type { MutationContext } from '../src/lib/api';
import { connectToDatabase } from '../src/lib/mongo';
import { addMonthsIso, daysUntil, MAX_MACHINE_HISTORY, nextServiceDue } from '../src/lib/machine';
import { Machine } from '../src/models/Machine';
import { applyMachineEvent, createMachine, deleteMachine, updateMachine } from '../src/server/machines/mutations';
import { getMachine, listMachines } from '../src/server/machines/queries';
import { machineListQuerySchema } from '../src/types/machine';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}
async function rejects(label: string, fn: () => Promise<unknown>, status: number) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch (e) {
    check(label, (e as { status?: number }).status === status, (e as Error).message);
  }
}

const ctx: MutationContext = { userId: '000000000000000000000001', userName: 'Verifier', roleKey: 'test', grants: ['machine:manage'] };
const q = (over: Record<string, unknown> = {}) => machineListQuerySchema.parse(over);
const TAG = 'ZZ-VERIFY';

async function main() {
  console.log('date helpers');
  check('adds months', addMonthsIso('2026-01-15', 6) === '2026-07-15');
  check('clamps to month end', addMonthsIso('2026-01-31', 1) === '2026-02-28');
  check('rolls over the year', addMonthsIso('2026-11-10', 3) === '2027-02-10');
  check('next service from last service', nextServiceDue(6, '2026-03-01', '2025-01-01') === '2026-09-01');
  check('next service falls back to date received', nextServiceDue(12, null, '2026-02-10') === '2027-02-10');
  check('no interval means no schedule', nextServiceDue(null, '2026-03-01', null) === null);
  check('days until', daysUntil('2026-10-25', '2026-10-20') === 5 && daysUntil('2026-10-15', '2026-10-20') === -5);

  await connectToDatabase();
  await Machine.deleteMany({ name: new RegExp(`^${TAG}`) });
  let id = '';

  try {
    console.log('create');
    const { machine } = await createMachine(
      { name: `${TAG} recorder`, make: 'Zoom', model: 'H6', condition: 'working', inUse: true, sourceType: 'donated', serviceEveryMonths: 6, acquiredOn: '2026-01-10' },
      ctx,
    );
    id = machine.id;
    check('code is MCH-nnnn', /^MCH-\d{4,}$/.test(machine.code), machine.code);
    check('first history line says it was added', machine.history[0]?.kind === 'created');
    check('next service is derived', machine.nextServiceDue === '2026-07-10', machine.nextServiceDue);
    await rejects('a made-up date is refused', () => createMachine({ name: `${TAG} bad`, acquiredOn: '2026-02-31' }, ctx), 400);

    console.log('edit');
    let r = await updateMachine(id, { condition: 'needs_repair', reason: 'dropped' }, ctx);
    check(
      'condition change is logged with the reason',
      r.machine.history[0]?.text.includes('Needs repair') === true && r.machine.history[0]?.text.includes('dropped') === true,
      r.machine.history[0],
    );
    r = await updateMachine(id, { location: 'Room 9', condition: 'working' }, ctx);
    check('details change is saved', r.machine.location === 'Room 9' && r.machine.condition === 'working');

    console.log('spare parts');
    r = await applyMachineEvent(id, { type: 'part.add', name: 'Battery', qty: 2 }, ctx);
    const partId = r.machine.parts[0]!.id;
    check('part added', r.machine.parts.length === 1 && r.machine.parts[0]!.qty === 2);
    r = await applyMachineEvent(id, { type: 'part.update', partId, qty: 0 }, ctx);
    check('stock updated', r.machine.parts[0]!.qty === 0);
    r = await applyMachineEvent(id, { type: 'part.remove', partId }, ctx);
    check('part removed', r.machine.parts.length === 0);
    await rejects('unknown part is 404', () => applyMachineEvent(id, { type: 'part.remove', partId: '000000000000000000000002' }, ctx), 404);

    console.log('lending');
    await rejects(
      'returning when not lent is refused',
      () => applyMachineEvent(id, { type: 'loan.return', returnedOn: '2026-10-20', conditionIn: 'working' }, ctx),
      400,
    );
    await rejects(
      'expected back before given is refused',
      () => applyMachineEvent(id, { type: 'loan.start', borrower: 'X', issuedOn: '2026-10-20', expectedReturn: '2026-10-01' }, ctx),
      400,
    );
    r = await applyMachineEvent(
      id,
      { type: 'loan.start', borrower: 'Multimedia cell', purpose: 'Event', issuedOn: '2026-10-01', expectedReturn: '2026-10-10' },
      ctx,
    );
    check('lent out', r.machine.loanedTo === 'Multimedia cell' && r.machine.loans[0]?.returnedOn === null);
    await rejects('cannot be lent twice', () => applyMachineEvent(id, { type: 'loan.start', borrower: 'Other', issuedOn: '2026-10-02' }, ctx), 400);
    const out = await listMachines(q({ loan: 'out' }));
    check('lent-out filter finds it', out.rows.some((m) => m.id === id));
    await rejects(
      'returned before it was issued is refused',
      () => applyMachineEvent(id, { type: 'loan.return', returnedOn: '2026-09-01', conditionIn: 'working' }, ctx),
      400,
    );
    r = await applyMachineEvent(id, { type: 'loan.return', returnedOn: '2026-10-12', conditionIn: 'needs_repair', note: 'scratched' }, ctx);
    check('returned, no longer lent', r.machine.loanedTo === null && r.machine.loans[0]?.returnedOn === '2026-10-12');
    check('a worse condition on return updates the machine', r.machine.condition === 'needs_repair');

    console.log('repairs');
    r = await applyMachineEvent(id, { type: 'repair.add', fault: 'No sound left', reportedOn: '2026-10-13' }, ctx);
    check('repair opens', r.machine.openRepairs === 1);
    const repairId = r.machine.repairs[0]!.id;
    r = await applyMachineEvent(
      id,
      { type: 'repair.resolve', repairId, resolvedOn: '2026-10-15', vendor: 'Sound Care', cost: 1500, billRef: 'B-77', condition: 'working' },
      ctx,
    );
    check('repair closes with cost and bill', r.machine.openRepairs === 0 && r.machine.repairs[0]?.cost === 1500 && r.machine.repairs[0]?.billRef === 'B-77');
    check('condition set after repair', r.machine.condition === 'working');
    await rejects(
      'closing twice is refused',
      () => applyMachineEvent(id, { type: 'repair.resolve', repairId, resolvedOn: '2026-10-16', condition: 'working' }, ctx),
      400,
    );
    r = await applyMachineEvent(id, { type: 'repair.add', fault: 'Dead', reportedOn: '2026-10-17' }, ctx);
    check('a working machine becomes "needs repair" when a fault is reported', r.machine.condition === 'needs_repair');

    console.log('servicing');
    r = await applyMachineEvent(id, { type: 'service.log', servicedOn: '2026-10-01' }, ctx);
    check('last service saved and next due moves', r.machine.lastServicedOn === '2026-10-01' && r.machine.nextServiceDue === '2027-04-01', r.machine.nextServiceDue);

    console.log('list');
    const found = await listMachines(q({ q: `${TAG} rec` }));
    check('search finds it', found.total === 1 && found.rows[0]?.id === id);
    const bad = await listMachines(q({ condition: 'needs_repair', q: TAG }));
    check('condition filter', bad.total === 1);
    const due = await listMachines(q({ service: 'due', today: '2027-03-25', q: TAG }));
    check('service-due filter looks 30 days ahead', due.total === 1, due.total);
    const notDue = await listMachines(q({ service: 'due', today: '2026-10-20', q: TAG }));
    check('not due yet is excluded', notDue.total === 0);
    check('counters add up', found.counts.all >= 1 && found.counts.working + found.counts.needsRepair + found.counts.notWorking === found.counts.all);

    console.log('history notes');
    r = await applyMachineEvent(id, { type: 'history.note', text: 'Sent to the lab for a check' }, ctx);
    check('a note is added to the history', r.machine.history[0]?.kind === 'note' && r.machine.history[0]?.text === 'Sent to the lab for a check');
    await rejects('an empty note is refused', async () => applyMachineEvent(id, { type: 'history.note', text: '   ' } as never, ctx), 400);

    console.log('history cap');
    for (let i = 0; i < MAX_MACHINE_HISTORY + 5; i += 1) await applyMachineEvent(id, { type: 'service.log', servicedOn: '2026-10-02' }, ctx);
    const full = await getMachine(id);
    check('history is capped', full.machine.history.length === MAX_MACHINE_HISTORY, full.machine.history.length);

    console.log('delete');
    await deleteMachine(id);
    await rejects('gone after delete', () => getMachine(id), 404);
    await rejects('deleting again is 404', () => deleteMachine(id), 404);
  } finally {
    await Machine.deleteMany({ name: new RegExp(`^${TAG}`) });
  }

  console.log(failures === 0 ? '\nAll machine checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
