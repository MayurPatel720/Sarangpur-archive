'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CellClickedEvent, CellKeyDownEvent, ColDef } from 'ag-grid-community';
import { AgGridReact, agGridTheme } from '@/components/ui/AgGridShell';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotDetailResponse } from '@/types/lot';
import type { TriageBulkBody, TriageItem } from '@/types/triage';
import { useReferenceList } from '@/hooks/useReferenceList';
import { useMe } from '@/hooks/useCan';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea } from '@/components/ui/Form';
import { Badge, ErrorState, Meter, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

type DetailLot = LotDetailResponse['lot'];
type Triage = 'keep' | 'drop' | 'undecided';

function YesNo({ value, onChange, label }: { value: '' | 'yes' | 'no'; onChange: (v: 'yes' | 'no') => void; label: string }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value as 'yes' | 'no')}>
        <option value="">Choose…</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </Select>
    </Field>
  );
}

const VerdictCell = memo(function VerdictCell({
  id,
  value,
  onPick,
}: {
  id: string;
  value: Triage;
  onPick: (id: string, selected: boolean | null) => void;
}) {
  return (
    <span className="inline-flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <label className="inline-flex items-center gap-1 min-h-[32px] cursor-pointer text-[12px] text-ink-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-accent)]"
          checked={value === 'keep'}
          onChange={(e) => onPick(id, e.target.checked ? true : null)}
          aria-label="Keep this item"
        />
        Keep
      </label>
      <label className="inline-flex items-center gap-1 min-h-[32px] cursor-pointer text-[12px] text-ink-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-accent)]"
          checked={value === 'drop'}
          onChange={(e) => onPick(id, e.target.checked ? false : null)}
          aria-label="Drop this item"
        />
        Drop
      </label>
    </span>
  );
});

type Group = { lineIndex: number; subtype: string; subtypeLabel: string; items: TriageItem[] };

type Draft = {
  version: number;
  facts: {
    existsInMls: '' | 'yes' | 'no';
    newCopyIsBetter: '' | 'yes' | 'no';
    conditionUsable: '' | 'yes' | 'no';
    conditionIssue: string;
    mlsMatchPaths: string;
    notes: string;
  };
  presets: Record<string, 'keep' | 'drop'>;
  overrides: Record<string, boolean>;
  groupFlags: Record<string, boolean[]>;
  groupReasons: Record<string, string>;
};

const draftKey = (lotId: string) => `triage-draft:${lotId}`;

/** Normalize a stored flag array to the current question count (pad/truncate). */
function flagsOf(length: number, a: boolean[] | undefined): boolean[] {
  return Array.from({ length }, (_, i) => a?.[i] ?? false);
}

export function DecisionTriage({
  lot,
  onChanged,
  revisit,
}: {
  lot: DetailLot;
  onChanged: () => void;
  revisit: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canDecide = me.data ? me.data.grants.includes('decision:record') : false;
  const [error, setError] = useState<string | null>(null);

  const triage = useQuery({
    queryKey: queryKeys.lots.triage(lot.id),
    queryFn: () => lotsApi.triageItems(lot.id),
    enabled: !!me.data && canDecide,
  });

  // Lot facts (same questions the checklist asked, compact).
  const [existsInMls, setExistsInMls] = useState<'' | 'yes' | 'no'>('');
  const [newCopyIsBetter, setNewCopyIsBetter] = useState<'' | 'yes' | 'no'>('');
  const [conditionUsable, setConditionUsable] = useState<'' | 'yes' | 'no'>('');
  const [conditionIssue, setConditionIssue] = useState('');
  const [mlsMatchPaths, setMlsMatchPaths] = useState('');
  const [notes, setNotes] = useState('');

  // Per-group triage state, keyed by lineIndex.
  const [presets, setPresets] = useState<Record<string, 'keep' | 'drop'>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [groupFlags, setGroupFlags] = useState<Record<string, boolean[]>>({});
  const [groupReasons, setGroupReasons] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [undecidedOnly, setUndecidedOnly] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const [disposition, setDisposition] = useState<'' | 'return' | 'discard'>('');
  const [discardReason, setDiscardReason] = useState('');
  const [discardNotes, setDiscardNotes] = useState('');
  const [needsDisposition, setNeedsDisposition] = useState(false);
  const [pendingDropGroup, setPendingDropGroup] = useState<Group | null>(null);

  const dropReasons = useReferenceList('notDigitizedReason');
  const discardReasons = useReferenceList('discardReason');
  // Significance questions are admin vocabulary — labels editable, questions
  // addable, in /admin/lists with zero code changes.
  const sigQuestions = useReferenceList('significance');
  const questions = sigQuestions.data?.items ?? [];

  const groups: Group[] = useMemo(() => {
    const items = triage.data?.items ?? [];
    const byLine = new Map<number, TriageItem[]>();
    for (const it of items) {
      const list = byLine.get(it.lineIndex) ?? [];
      list.push(it);
      byLine.set(it.lineIndex, list);
    }
    return [...byLine.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lineIndex, list]) => ({
        lineIndex,
        subtype: list[0]?.subtype ?? 'unspecified',
        subtypeLabel: list[0]?.subtypeLabel ?? 'Unspecified',
        items: list,
      }));
  }, [triage.data]);

  // Restore an autosaved draft when the fetch lands (version-guarded). Waits
  // for the significance list too so restored flags normalize to the current
  // question count.
  useEffect(() => {
    if (draftLoaded || !triage.data || !sigQuestions.data) return;
    setDraftLoaded(true);
    const questionCount = sigQuestions.data.items.length;
    try {
      const raw = localStorage.getItem(draftKey(lot.id));
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (d.version !== triage.data.version) {
        localStorage.removeItem(draftKey(lot.id));
        return;
      }
      setExistsInMls(d.facts.existsInMls);
      setNewCopyIsBetter(d.facts.newCopyIsBetter);
      setConditionUsable(d.facts.conditionUsable);
      setConditionIssue(d.facts.conditionIssue);
      setMlsMatchPaths(d.facts.mlsMatchPaths);
      setNotes(d.facts.notes);
      setPresets(d.presets);
      setOverrides(d.overrides);
      const normalized: Record<string, boolean[]> = {};
      for (const [k, v] of Object.entries(d.groupFlags ?? {})) {
        normalized[k] = flagsOf(questionCount, v);
      }
      setGroupFlags(normalized);
      setGroupReasons(d.groupReasons);
      toast.info('Draft restored', 'Your unsent triage picks are back.');
    } catch {
      /* corrupt draft — start fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triage.data, sigQuestions.data, draftLoaded, lot.id]);

  // Autosave every change (nothing reaches the server until Record).
  useEffect(() => {
    if (!draftLoaded || !triage.data) return;
    const d: Draft = {
      version: triage.data.version,
      facts: { existsInMls, newCopyIsBetter, conditionUsable, conditionIssue, mlsMatchPaths, notes },
      presets,
      overrides,
      groupFlags,
      groupReasons,
    };
    try {
      localStorage.setItem(draftKey(lot.id), JSON.stringify(d));
    } catch {
      /* storage full/blocked — triage still works, just no resume */
    }
  }, [draftLoaded, triage.data, lot.id, existsInMls, newCopyIsBetter, conditionUsable, conditionIssue, mlsMatchPaths, notes, presets, overrides, groupFlags, groupReasons]);

  const effective = (it: TriageItem): boolean => {
    const o = overrides[it.id];
    if (o !== undefined) return o;
    const p = presets[String(it.lineIndex)];
    if (p) return p === 'keep';
    return it.selectedForDigitization;
  };
  const decided = (it: TriageItem): boolean =>
    overrides[it.id] !== undefined || presets[String(it.lineIndex)] !== undefined;

  const totals = useMemo(() => {
    const items = triage.data?.items ?? [];
    let decidedCount = 0;
    let keepCount = 0;
    for (const it of items) {
      if (decided(it)) decidedCount += 1;
      if (decided(it) && effective(it)) keepCount += 1;
    }
    return { total: items.length, decidedCount, keepCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triage.data, presets, overrides]);

  const groupStats = (g: Group) => {
    let keep = 0;
    let drop = 0;
    let undecided = 0;
    for (const it of g.items) {
      if (!decided(it)) undecided += 1;
      else if (effective(it)) keep += 1;
      else drop += 1;
    }
    return { keep, drop, undecided };
  };

  const setItem = (id: string, selected: boolean | null) =>
    setOverrides((prev) => {
      // Unchecking a box clears the per-row exception (back to undecided).
      if (selected === null) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: selected };
    });

  const saveMut = useMutation({
    mutationFn: (body: TriageBulkBody) => lotsApi.recordTriage(lot.id, body),
    onSuccess: () => {
      setError(null);
      try {
        localStorage.removeItem(draftKey(lot.id));
      } catch {
        /* already gone */
      }
      toast.success('Decision recorded', 'Triage picks are saved to the audit trail.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.triage(lot.id) });
      onChanged();
    },
    onError: (e) => {
      const message = e instanceof ApiRequestError ? e.message : 'Could not record the decision.';
      if (e instanceof ApiRequestError && e.status === 400 && /return_or_discard/.test(message)) {
        setNeedsDisposition(true);
        setError('The answers point away from the archive — choose return or discard below.');
      } else {
        setError(message);
      }
    },
  });

  const record = () => {
    setError(null);
    if (!existsInMls) return setError('State whether this lot already exists in MLS.');
    if (existsInMls === 'yes' && !newCopyIsBetter) {
      return setError('State whether this copy is better — the lot already exists in MLS.');
    }
    if (!conditionUsable) return setError('State whether the condition is usable.');
    if (conditionUsable === 'no' && !conditionIssue.trim()) {
      return setError('Describe the condition issue — condition was marked unusable.');
    }
    if (totals.total === 0) return setError('There are no items to triage on this lot.');
    if (totals.decidedCount < totals.total) {
      return setError(
        `${totals.total - totals.decidedCount} of ${totals.total} items are still undecided — use the group presets, then clear the remainder.`,
      );
    }
    for (const g of groups) {
      const dropped = g.items.some((it) => !effective(it));
      if (dropped && !groupReasons[String(g.lineIndex)]) {
        return setError(`Choose a drop reason for the ${g.subtypeLabel} group.`);
      }
    }
    if (needsDisposition && !disposition) return setError('Choose return or discard.');
    if (disposition === 'discard' && !discardReason) return setError('Choose a discard reason.');
    const paths = mlsMatchPaths
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const body: TriageBulkBody = {
      existsInMls: existsInMls === 'yes',
      ...(existsInMls === 'yes' ? { newCopyIsBetter: newCopyIsBetter === 'yes' } : {}),
      ...(existsInMls === 'yes' && paths.length ? { mlsMatchPaths: paths } : {}),
      conditionUsable: conditionUsable === 'yes',
      ...(conditionUsable === 'no' ? { conditionIssue: conditionIssue.trim() } : {}),
      groupFlags: groups
        .map((g) => ({
          lineIndex: g.lineIndex,
          flags: flagsOf(questions.length, groupFlags[String(g.lineIndex)]),
        }))
        .filter((g) => g.flags.some(Boolean)),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(needsDisposition && disposition ? { disposition } : {}),
      ...(disposition === 'discard'
        ? {
            discardReason: discardReason as NonNullable<TriageBulkBody['discardReason']>,
            ...(discardNotes.trim() ? { discardNotes: discardNotes.trim() } : {}),
          }
        : {}),
      items: (triage.data?.items ?? []).map((it) => ({
        id: it.id,
        selected: effective(it),
        reason: effective(it) ? null : (groupReasons[String(it.lineIndex)] ?? null),
      })),
    };
    saveMut.mutate(body);
  };

  const reset = () => {
    setPresets({});
    setOverrides({});
    setGroupFlags({});
    setGroupReasons({});
    setDisposition('');
    setDiscardReason('');
    setDiscardNotes('');
    setNeedsDisposition(false);
    setError(null);
    try {
      localStorage.removeItem(draftKey(lot.id));
    } catch {
      /* already gone */
    }
  };

  if (!canDecide && !me.isLoading) {
    return <p className="m-0 text-[13px] text-ink-3">You don&apos;t have permission to record decisions.</p>;
  }

  if (triage.isLoading || me.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  if (triage.isError) {
    return (
      <ErrorState
        message="Couldn't load items for triage."
        hint="Check your connection and try again."
        onRetry={() => triage.refetch()}
      />
    );
  }

  const percent = totals.total === 0 ? 0 : Math.round((totals.decidedCount / totals.total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <h3 className="m-0 text-[13px] font-semibold text-ink">
        {revisit ? 'Re-record decision (approved override)' : 'Record decision — triage'}
      </h3>

      {/* Lot facts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <YesNo label="Already exists in MLS?" value={existsInMls} onChange={setExistsInMls} />
        {existsInMls === 'yes' ? (
          <YesNo label="This copy is better?" value={newCopyIsBetter} onChange={setNewCopyIsBetter} />
        ) : null}
        <YesNo label="Condition usable?" value={conditionUsable} onChange={setConditionUsable} />
      </div>
      {conditionUsable === 'no' ? (
        <Field label="Condition issue" hint="Describe what's wrong — e.g. blurry, moldy, torn, faded or distorted.">
          <Textarea value={conditionIssue} onChange={(e) => setConditionIssue(e.target.value)} />
        </Field>
      ) : null}
      {existsInMls === 'yes' ? (
        <Field label="Matching MLS file paths" hint="One path per line — where this lot already exists in MLS.">
          <Textarea
            value={mlsMatchPaths}
            onChange={(e) => setMlsMatchPaths(e.target.value)}
            rows={2}
            placeholder={'e.g.\n/photos/2019/patotsav/\n/negatives/box-12/'}
          />
        </Field>
      ) : null}

      {/* Subtype groups */}
      {groups.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-3">
          This lot has no items to triage — items are created at intake, so this lot
          predates that or was seeded without items.
        </p>
      ) : null}
      {groups.map((g) => (
        <TriageGroup
          key={g.lineIndex}
          group={g}
          open={expanded[String(g.lineIndex)] ?? true}
          onToggle={() =>
            setExpanded((prev) => ({ ...prev, [String(g.lineIndex)]: !(prev[String(g.lineIndex)] ?? true) }))
          }
          preset={presets[String(g.lineIndex)]}
          onKeepAll={() => {
            setPresets((prev) => ({ ...prev, [String(g.lineIndex)]: 'keep' }));
            // Keep-all clears per-row exceptions; the preset now rules the group.
            setOverrides((prev) => {
              const next = { ...prev };
              for (const it of g.items) delete next[it.id];
              return next;
            });
          }}
          onDropAll={() => setPendingDropGroup(g)}
          flags={flagsOf(questions.length, groupFlags[String(g.lineIndex)])}
          onFlag={(i, v) =>
            setGroupFlags((prev) => {
              const next = flagsOf(questions.length, prev[String(g.lineIndex)]);
              next[i] = v;
              return { ...prev, [String(g.lineIndex)]: next };
            })
          }
          questions={questions}
          questionsLoading={sigQuestions.isLoading}
          reason={groupReasons[String(g.lineIndex)] ?? ''}
          reasons={dropReasons.data?.items ?? []}
          onReason={(v) => setGroupReasons((prev) => ({ ...prev, [String(g.lineIndex)]: v }))}
          stats={groupStats(g)}
          undecidedOnly={undecidedOnly}
          verdictOf={(it) => (!decided(it) ? 'undecided' : effective(it) ? 'keep' : 'drop')}
          onPick={setItem}
        />
      ))}

      <Field label="Decision notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {/* Sticky review strip */}
      <div className="sticky bottom-0 z-10 -mx-1 px-1 py-2 bg-surface/95 backdrop-blur border-t border-line-soft">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
            <span aria-live="polite">
              <strong className="text-ink">{totals.decidedCount}/{totals.total}</strong> decided
              {' · '}{totals.keepCount} keep
            </span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer min-h-[32px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent)]"
                checked={undecidedOnly}
                onChange={(e) => setUndecidedOnly(e.target.checked)}
              />
              Undecided only
            </label>
          </div>
          <Meter percent={percent} severity={percent === 100 ? 'good' : 'info'} />
          {needsDisposition ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Disposition — the answers point away from the archive">
                <Select value={disposition} onChange={(e) => setDisposition(e.target.value as '' | 'return' | 'discard')}>
                  <option value="">Choose…</option>
                  <option value="return">Return to sender</option>
                  <option value="discard">Discard</option>
                </Select>
              </Field>
              {disposition === 'discard' ? (
                <>
                  <Field label="Discard reason">
                    <Select value={discardReason} onChange={(e) => setDiscardReason(e.target.value)}>
                      <option value="">Choose…</option>
                      {(discardReasons.data?.items ?? []).map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Discard notes" hint="Optional detail for the audit entry.">
                    <Textarea value={discardNotes} onChange={(e) => setDiscardNotes(e.target.value)} />
                  </Field>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton disabled={saveMut.isPending} onClick={record}>
              {saveMut.isPending ? 'Recording…' : 'Record decision'}
            </PrimaryButton>
            <GhostButton onClick={reset}>Reset picks</GhostButton>
            <span className="text-[12px] text-ink-3">Nothing saves until Record — bulk picks are undoable.</span>
          </div>
        </div>
      </div>

      {pendingDropGroup ? (
        <ConfirmDialog
          title={`Drop all ${pendingDropGroup.items.length} ${pendingDropGroup.subtypeLabel} items?`}
          body="Every item in this group will be marked Drop. You can still undo this — nothing saves until you press Record."
          confirmLabel="Drop all"
          tone="danger"
          onConfirm={() => {
            const g = pendingDropGroup;
            setPresets((prev) => ({ ...prev, [String(g.lineIndex)]: 'drop' }));
            setOverrides((prev) => {
              const next = { ...prev };
              for (const it of g.items) delete next[it.id];
              return next;
            });
            setPendingDropGroup(null);
          }}
          onClose={() => setPendingDropGroup(null)}
        >
          <Field label="Drop reason (required for every dropped item)">
            <Select
              value={groupReasons[String(pendingDropGroup.lineIndex)] ?? ''}
              onChange={(e) =>
                setGroupReasons((prev) => ({ ...prev, [String(pendingDropGroup.lineIndex)]: e.target.value }))
              }
            >
              <option value="">Choose…</option>
              {(dropReasons.data?.items ?? []).map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function TriageGroup({
  group,
  open,
  onToggle,
  preset,
  onKeepAll,
  onDropAll,
  flags,
  onFlag,
  questions,
  questionsLoading,
  reason,
  reasons,
  onReason,
  stats,
  undecidedOnly,
  verdictOf,
  onPick,
}: {
  group: Group;
  open: boolean;
  onToggle: () => void;
  preset: 'keep' | 'drop' | undefined;
  onKeepAll: () => void;
  onDropAll: () => void;
  flags: boolean[];
  onFlag: (i: number, v: boolean) => void;
  questions: { value: string; label: string }[];
  questionsLoading: boolean;
  reason: string;
  reasons: { value: string; label: string }[];
  onReason: (v: string) => void;
  stats: { keep: number; drop: number; undecided: number };
  undecidedOnly: boolean;
  verdictOf: (it: TriageItem) => Triage;
  onPick: (id: string, selected: boolean | null) => void;
}) {
  const rows = useMemo(() => {
    const list = group.items.map((it) => ({ ...it, triage: verdictOf(it) }));
    return undecidedOnly ? list.filter((r) => r.triage === 'undecided') : list;
  }, [group.items, undecidedOnly, verdictOf]);

  const columns = useMemo<ColDef[]>(
    () => [
      { field: 'code', headerName: 'Code', minWidth: 150, flex: 1 },
      { field: 'groupNo', headerName: 'Grp', width: 70 },
      { field: 'itemNo', headerName: '#', width: 70 },
      {
        field: 'digitized',
        headerName: 'Dig',
        width: 70,
        valueFormatter: (p) => (p.value ? 'Yes' : 'No'),
      },
      {
        field: 'taggedInMls',
        headerName: 'Tag',
        width: 70,
        valueFormatter: (p) => (p.value ? 'Yes' : 'No'),
      },
      {
        field: 'triage',
        headerName: 'Keep / Drop',
        width: 180,
        cellRenderer: (p: {
          value: Triage;
          data: TriageItem;
          context: { onPick: (id: string, selected: boolean | null) => void };
        }) => <VerdictCell id={p.data.id} value={p.value} onPick={p.context.onPick} />,
      },
    ],
    [],
  );

  const onCellKeyDown = (e: CellKeyDownEvent) => {
    const ev = e.event as KeyboardEvent | null;
    if (!ev || (ev.key !== 'y' && ev.key !== 'Y' && ev.key !== 'n' && ev.key !== 'N')) return;
    const row = e.node.data as (TriageItem & { triage: Triage }) | undefined;
    if (!row) return;
    ev.preventDefault();
    onPick(row.id, ev.key === 'y' || ev.key === 'Y');
    // Short-circuit: deciding a row jumps straight to the next one.
    const next = (e.node.rowIndex ?? 0) + 1;
    if (next < (rows.length ?? 0)) {
      e.api.ensureIndexVisible(next);
      e.api.setFocusedCell(next, 'triage');
    }
  };

  const onCellClicked = (e: CellClickedEvent) => {
    if (e.colDef.field !== 'triage') return;
    // Tickbox clicks handle themselves; only bare-cell clicks cycle here.
    const target = e.event?.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.closest('label'))) return;
    const row = e.data as (TriageItem & { triage: Triage }) | undefined;
    if (!row) return;
    // Mouse path: clicking the verdict cycles keep → drop → keep.
    onPick(row.id, row.triage !== 'keep');
  };

  return (
    <section className="border border-line rounded-[8px] overflow-hidden" aria-label={`${group.subtypeLabel} group`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 bg-surface-sunken border-0 cursor-pointer text-left"
      >
        <span className="text-[13px] font-semibold text-ink">
          {group.subtypeLabel} · {group.items.length} items
        </span>
        <span className="text-[12px] text-ink-3">
          {stats.keep} keep · {stats.drop} drop · {stats.undecided} undecided
        </span>
        {preset ? (
          <Badge severity={preset === 'keep' ? 'good' : 'critical'}>
            {preset === 'keep' ? 'All keep' : 'All drop'}
          </Badge>
        ) : null}
        <span className="ml-auto text-[12px] text-ink-3">{open ? 'Collapse' : 'Expand'}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <GhostButton onClick={onKeepAll}>All keep</GhostButton>
            <GhostButton onClick={onDropAll}>All drop…</GhostButton>
            {(stats.drop > 0 || preset === 'drop') ? (
              <div className="min-w-[220px] flex-1">
                <Field label="Drop reason for this group">
                  <Select value={reason} onChange={(e) => onReason(e.target.value)}>
                    <option value="">Choose…</option>
                    {reasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}
          </div>

          <fieldset className="m-0 p-0 border-0 min-w-0">
            <legend className="px-0 mb-1.5 text-[12px] text-ink-3">
              Significance for this subtype (any one counts toward archive)
            </legend>
            {questionsLoading ? (
              <p className="m-0 text-[12.5px] text-ink-3">Loading significance questions…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {questions.map((q, i) => (
                  <label key={q.value} className="flex items-start gap-2 min-h-[32px] text-[12.5px] text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-0.5 accent-[var(--color-accent)]"
                      checked={flags[i] ?? false}
                      onChange={(e) => onFlag(i, e.target.checked)}
                    />
                    <span>{q.label}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div style={{ height: 320, width: '100%' }}>
            <AgGridReact
              theme={agGridTheme}
              rowData={rows}
              columnDefs={columns}
              context={{ onPick }}
              getRowId={(p) => p.data.id}
              onCellKeyDown={onCellKeyDown}
              onCellClicked={onCellClicked}
              rowSelection="single"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
