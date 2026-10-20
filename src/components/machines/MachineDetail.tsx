'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, machinesApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { MACHINE_SOURCE_LABELS } from '@/lib/machine';
import { date, dateTime, todayIso } from '@/lib/format';
import { useUrlTab } from '@/lib/useUrlTab';
import { useCan } from '@/hooks/useCan';
import { IconChevronLeft } from '@/components/ui/icons';
import { Definition, EmptyValue, ErrorState, Panel, PanelHeader, Skeleton, TabPanel, Tabs } from '@/components/ui/primitives';
import { GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { ConditionBadge, LoanChip, ServiceChip, UsageChip } from '@/components/machines/MachineBadges';
import { MachineDialog } from '@/components/machines/MachineDialog';
import {
  LendDialog,
  PartDialog,
  RepairDialog,
  ResolveDialog,
  ReturnDialog,
  ServiceDialog,
} from '@/components/machines/MachineEventDialogs';
import type { Machine, MachineEventBody, MachinePart, MachineRepair } from '@/types/machine';

const TABS = ['overview', 'parts', 'lending', 'repairs', 'history'] as const;
type TabId = (typeof TABS)[number];

type Dialog =
  | { kind: 'edit' }
  | { kind: 'delete' }
  | { kind: 'part'; part?: MachinePart }
  | { kind: 'lend' }
  | { kind: 'return' }
  | { kind: 'repair' }
  | { kind: 'resolve'; repair: MachineRepair }
  | { kind: 'service' };

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1.5 border-b border-line-row px-4 py-3 last:border-b-0">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 text-balance px-4 py-10 text-center text-[13px] font-medium text-ink-3">{children}</p>;
}

function Chip({ tone, children }: { tone: 'danger' | 'good' | 'plain'; children: ReactNode }) {
  const cls =
    tone === 'danger'
      ? 'border-danger-line bg-danger-bg text-danger'
      : tone === 'good'
        ? 'border-good-line bg-good-bg text-good'
        : 'border-line bg-surface-sunken text-ink-2';
  return <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-[2px] text-[11px] font-semibold tabular-nums whitespace-nowrap ${cls}`}>{children}</span>;
}

/** One machine: details, spare parts, lending, repairs and history, all on one page. */
export function MachineDetail({ machineId }: { machineId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canManage = useCan('machine:manage');
  const { tab, setTab } = useUrlTab(TABS, 'overview');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const detail = useQuery({
    queryKey: queryKeys.machines.detail(machineId),
    queryFn: () => machinesApi.detail(machineId),
  });

  const close = () => {
    setDialog(null);
    setDialogError(null);
  };
  const saved = (m: Machine) => {
    queryClient.setQueryData(queryKeys.machines.detail(machineId), { machine: m });
    void queryClient.invalidateQueries({ queryKey: ['machines', 'list'] });
    close();
  };
  const fail = (fallback: string) => (e: unknown) => setDialogError(e instanceof ApiRequestError ? e.message : fallback);

  const edit = useMutation({
    mutationFn: (body: Parameters<typeof machinesApi.update>[1]) => machinesApi.update(machineId, body),
    onSuccess: (r) => {
      saved(r.machine);
      toast.success('Saved');
    },
    onError: fail('Could not save the machine.'),
  });
  const event = useMutation({
    mutationFn: (body: MachineEventBody) => machinesApi.event(machineId, body),
    onSuccess: (r) => saved(r.machine),
    onError: fail('Could not save that.'),
  });
  const remove = useMutation({
    mutationFn: () => machinesApi.remove(machineId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.machines.all });
      toast.success('Machine deleted');
      router.push('/machines');
    },
    onError: fail('Could not delete the machine.'),
  });

  const back = (
    <Link href="/machines" className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink-3 no-underline hover:text-ink">
      <IconChevronLeft size={14} />
      All machines
    </Link>
  );

  if (detail.isError) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Panel>
          <ErrorState
            message={detail.error instanceof ApiRequestError ? detail.error.message : 'Could not load this machine.'}
            onRetry={() => void detail.refetch()}
          />
        </Panel>
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const m = detail.data.machine;
  const today = todayIso();
  const openRepairs = m.repairs.filter((r) => !r.resolvedOn);
  const currentLoan = m.loans.find((l) => !l.returnedOn) ?? null;
  const pastLoans = m.loans.filter((l) => l.returnedOn);
  const totalCost = m.repairs.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const lateBack = currentLoan?.expectedReturn && currentLoan.expectedReturn < today;
  const submit = (body: MachineEventBody) => event.mutate(body);
  const common = { pending: event.isPending, error: dialogError, onSubmit: submit, onClose: close };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'parts', label: `Spare parts (${m.parts.length})` },
    { id: 'lending', label: m.loanedTo ? 'Lending · out' : 'Lending' },
    { id: 'repairs', label: openRepairs.length ? `Repairs (${openRepairs.length} open)` : 'Repairs' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {back}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="m-0 break-words text-balance text-[20px] font-semibold tracking-[-0.022em] text-ink sm:text-[24px]">{m.name}</h1>
          <p className="m-0 text-[12.5px] text-ink-3">
            <span className="tabular-nums">{m.code}</span>
            {m.category ? ` · ${m.category}` : ''}
            {[m.make, m.model].filter(Boolean).length ? ` · ${[m.make, m.model].filter(Boolean).join(' ')}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <ConditionBadge condition={m.condition} />
            <UsageChip inUse={m.inUse} />
            {m.loanedTo ? <LoanChip to={m.loanedTo} /> : null}
            <ServiceChip due={m.nextServiceDue} today={today} />
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-2">
            <GhostButton onClick={() => setDialog({ kind: 'edit' })}>Edit</GhostButton>
            <GhostButton onClick={() => setDialog({ kind: 'delete' })}>Delete</GhostButton>
          </div>
        ) : null}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="Machine sections" />

      <TabPanel id="overview" active={tab === 'overview'}>
        <Panel>
          <PanelHeader title="Details" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 md:grid-cols-4 md:p-5">
            <Definition label="Category">{m.category ?? <EmptyValue />}</Definition>
            <Definition label="Make">{m.make ?? <EmptyValue />}</Definition>
            <Definition label="Model">{m.model ?? <EmptyValue />}</Definition>
            <Definition label="Version">{m.version ?? <EmptyValue />}</Definition>
            <Definition label="Serial number">{m.serialNo ?? <EmptyValue />}</Definition>
            <Definition label="Location">{m.location ?? <EmptyValue />}</Definition>
            <Definition label="Condition">
              <ConditionBadge condition={m.condition} />
            </Definition>
            <Definition label="Usage">{m.inUse ? 'Currently in use' : 'Not in use'}</Definition>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Where it came from" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 md:grid-cols-4 md:p-5">
            <Definition label="How we got it">{MACHINE_SOURCE_LABELS[m.sourceType]}</Definition>
            <Definition label="Supplier or donor">{m.sourceName ?? <EmptyValue />}</Definition>
            <Definition label="Contact">{m.sourceContact ?? <EmptyValue />}</Definition>
            <Definition label="Date received">{m.acquiredOn ? date(m.acquiredOn) : <EmptyValue />}</Definition>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Servicing">
            {canManage ? (
              <GhostButton className="ml-auto !h-8 !px-3 text-[12px]" onClick={() => setDialog({ kind: 'service' })}>
                Log a service
              </GhostButton>
            ) : null}
          </PanelHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 md:grid-cols-4 md:p-5">
            <Definition label="Service every">{m.serviceEveryMonths ? `${m.serviceEveryMonths} months` : <EmptyValue />}</Definition>
            <Definition label="Last serviced">{m.lastServicedOn ? date(m.lastServicedOn) : <EmptyValue />}</Definition>
            <Definition label="Next due">{m.nextServiceDue ? date(m.nextServiceDue) : <EmptyValue />}</Definition>
          </div>
        </Panel>
        {m.notes ? (
          <Panel>
            <PanelHeader title="Notes" />
            <p className="m-0 whitespace-pre-wrap break-words p-4 text-[13px] leading-relaxed text-ink-2 md:p-5">{m.notes}</p>
          </Panel>
        ) : null}
      </TabPanel>

      <TabPanel id="parts" active={tab === 'parts'}>
        <Panel className="overflow-hidden">
          <PanelHeader title="Spare parts and accessories">
            {canManage ? (
              <GhostButton className="ml-auto !h-8 !px-3 text-[12px]" onClick={() => setDialog({ kind: 'part' })}>
                Add part
              </GhostButton>
            ) : null}
          </PanelHeader>
          {m.parts.length === 0 ? (
            <Empty>No spare parts recorded yet.</Empty>
          ) : (
            m.parts.map((p) => (
              <Row key={p.id}>
                <div className="flex min-w-0 items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-words text-[14px] font-semibold text-ink">{p.name}</span>
                    <span className="break-words text-[12px] text-ink-3">
                      {[p.partNo ? `Part no. ${p.partNo}` : null, p.note].filter(Boolean).join(' · ') || ' '}
                    </span>
                  </div>
                  <Chip tone={p.qty === 0 ? 'danger' : 'plain'}>{p.qty === 0 ? 'Out of stock' : `${p.qty} in stock`}</Chip>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <GhostButton className="!h-8 !px-3 text-[12px]" onClick={() => setDialog({ kind: 'part', part: p })}>
                      Edit
                    </GhostButton>
                    <GhostButton
                      className="!h-8 !px-3 text-[12px]"
                      disabled={event.isPending}
                      onClick={() => event.mutate({ type: 'part.remove', partId: p.id })}
                    >
                      Remove
                    </GhostButton>
                  </div>
                ) : null}
              </Row>
            ))
          )}
        </Panel>
      </TabPanel>

      <TabPanel id="lending" active={tab === 'lending'}>
        <Panel className="overflow-hidden">
          <PanelHeader title="Right now" />
          {currentLoan ? (
            <Row>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">Lent to {currentLoan.borrower}</span>
                {lateBack ? <Chip tone="danger">Overdue back · {date(currentLoan.expectedReturn)}</Chip> : null}
              </div>
              <p className="m-0 text-[12.5px] text-ink-2">
                Since {date(currentLoan.issuedOn)}
                {currentLoan.expectedReturn && !lateBack ? ` · expected back ${date(currentLoan.expectedReturn)}` : ''}
                {currentLoan.purpose ? ` · ${currentLoan.purpose}` : ''}
              </p>
              {canManage ? (
                <div>
                  <PrimaryButton type="button" className="!h-9 text-[12.5px]" onClick={() => setDialog({ kind: 'return' })}>
                    Mark returned
                  </PrimaryButton>
                </div>
              ) : null}
            </Row>
          ) : (
            <Row>
              <p className="m-0 text-[13px] text-ink-2">In our hands — not lent out.</p>
              {canManage ? (
                <div>
                  <PrimaryButton type="button" className="!h-9 text-[12.5px]" onClick={() => setDialog({ kind: 'lend' })}>
                    Lend out
                  </PrimaryButton>
                </div>
              ) : null}
            </Row>
          )}
        </Panel>
        <Panel className="overflow-hidden">
          <PanelHeader title="Past loans" />
          {pastLoans.length === 0 ? (
            <Empty>Nothing lent out before.</Empty>
          ) : (
            pastLoans.map((l) => (
              <Row key={l.id}>
                <span className="text-[14px] font-semibold text-ink">{l.borrower}</span>
                <span className="text-[12.5px] text-ink-2">
                  {date(l.issuedOn)} → {l.returnedOn ? date(l.returnedOn) : ''}
                  {l.purpose ? ` · ${l.purpose}` : ''}
                </span>
                {l.note ? <span className="text-[12px] text-ink-3">{l.note}</span> : null}
              </Row>
            ))
          )}
        </Panel>
      </TabPanel>

      <TabPanel id="repairs" active={tab === 'repairs'}>
        <Panel className="overflow-hidden">
          <PanelHeader title="Repair history">
            {totalCost > 0 ? <span className="text-[12px] tabular-nums text-ink-3">Total spent {rupees(totalCost)}</span> : null}
            {canManage ? (
              <GhostButton className="ml-auto !h-8 !px-3 text-[12px]" onClick={() => setDialog({ kind: 'repair' })}>
                Report a fault
              </GhostButton>
            ) : null}
          </PanelHeader>
          {m.repairs.length === 0 ? (
            <Empty>No repairs so far.</Empty>
          ) : (
            m.repairs.map((r) => (
              <Row key={r.id}>
                <div className="flex min-w-0 items-start gap-2">
                  <span className="min-w-0 flex-1 break-words text-[14px] font-semibold text-ink">{r.fault}</span>
                  <Chip tone={r.resolvedOn ? 'good' : 'danger'}>{r.resolvedOn ? 'Closed' : 'Open'}</Chip>
                </div>
                <span className="text-[12.5px] text-ink-2">
                  Reported {date(r.reportedOn)}
                  {r.resolvedOn ? ` · fixed ${date(r.resolvedOn)}` : ''}
                  {r.vendor ? ` · ${r.vendor}` : ''}
                  {r.cost != null ? ` · ${rupees(r.cost)}` : ''}
                  {r.billRef ? ` · bill ${r.billRef}` : ''}
                </span>
                {r.outcome ? <span className="text-[12px] text-ink-3">{r.outcome}</span> : null}
                {canManage && !r.resolvedOn ? (
                  <div>
                    <GhostButton className="!h-8 !px-3 text-[12px]" onClick={() => setDialog({ kind: 'resolve', repair: r })}>
                      Close repair
                    </GhostButton>
                  </div>
                ) : null}
              </Row>
            ))
          )}
        </Panel>
      </TabPanel>

      <TabPanel id="history" active={tab === 'history'}>
        <Panel className="overflow-hidden">
          <PanelHeader title="What happened, newest first" />
          {canManage ? (
            <form
              className="flex flex-col gap-2 border-b border-line-row p-4 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                const text = note.trim();
                if (!text) return;
                event.mutate({ type: 'history.note', text }, { onSuccess: () => setNote('') });
              }}
            >
              <TextInput
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={400}
                name="note"
                autoComplete="off"
                placeholder="Add a note to the history…"
                aria-label="Add a note to the history"
              />
              <PrimaryButton type="submit" className="shrink-0" disabled={event.isPending || !note.trim()}>
                Add note
              </PrimaryButton>
            </form>
          ) : null}
          {m.history.length === 0 ? (
            <Empty>No history yet.</Empty>
          ) : (
            m.history.map((h, i) => (
              <Row key={`${h.at}-${i}`}>
                <span className="break-words text-[13px] font-medium text-ink">
                  {h.kind === 'note' ? <span className="mr-2 inline-flex rounded-[4px] border border-line bg-surface-sunken px-1.5 py-px align-middle text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Note</span> : null}
                  {h.text}
                </span>
                <span className="text-[11.5px] tabular-nums text-ink-3">
                  {dateTime(h.at)} · {h.by}
                </span>
              </Row>
            ))
          )}
        </Panel>
      </TabPanel>

      {dialog?.kind === 'edit' ? (
        <MachineDialog machine={m} pending={edit.isPending} error={dialogError} onSave={(body) => edit.mutate(body)} onClose={close} />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDialog
          title="Delete this machine?"
          body={`${m.code} · ${m.name} and everything recorded on it (parts, loans, repairs, history) will be removed. This cannot be undone.`}
          confirmLabel="Delete machine"
          pending={remove.isPending}
          error={dialogError}
          onConfirm={() => remove.mutate()}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'part' ? <PartDialog part={dialog.part} {...common} /> : null}
      {dialog?.kind === 'lend' ? <LendDialog machine={m} {...common} /> : null}
      {dialog?.kind === 'return' ? <ReturnDialog machine={m} {...common} /> : null}
      {dialog?.kind === 'repair' ? <RepairDialog machine={m} {...common} /> : null}
      {dialog?.kind === 'resolve' ? <ResolveDialog repair={dialog.repair} {...common} /> : null}
      {dialog?.kind === 'service' ? <ServiceDialog machine={m} {...common} /> : null}
    </div>
  );
}
