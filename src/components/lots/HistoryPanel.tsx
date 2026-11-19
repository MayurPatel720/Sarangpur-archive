'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historyApi } from '@/lib/api-client';
import type { LotHistory } from '@/hooks/useLotHistory';
import { dateTime12 } from '@/lib/format';
import type { HistView } from '@/lib/history-view';
import { pathLabel } from '@/lib/item-history';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { Badge, Tabs } from '@/components/ui/primitives';
import { IconX } from '@/components/ui/icons';
import type { HistoryListResponse } from '@/types/history';

type Session = HistoryListResponse['sessions'][number];

const KIND_LABEL: Record<string, string> = {
  edit: 'Edit',
  bulk: 'Bulk edit',
  import: 'Import',
  add_items: 'Added rows',
  discard_clear: 'Discard',
  recode: 'Codes',
  duplicate: 'Duplicate',
  reorder: 'Order',
  media_lines: 'Media lines',
  status: 'Status',
  workflow: 'Workflow',
  undo: 'Undo',
  restore: 'Restore',
};

const when = (a: string, b: string) => {
  const from = dateTime12(a);
  if (a === b) return from;
  const to = new Date(b);
  return `${from} – ${to.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

function SessionCard({
  session,
  selected,
  canEdit,
  history,
  onSelect,
}: {
  session: Session;
  selected: boolean;
  canEdit: boolean;
  history: LotHistory;
  onSelect: () => void;
}) {
  return (
    <li className={`rounded-[8px] border bg-surface ${selected ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-2.5 text-left">
        <span className="flex w-full items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{when(session.from, session.to)}</span>
          {session.undone ? <Badge severity="neutral">Undone</Badge> : null}
        </span>
        <span className="text-[12px] text-ink-3">
          {session.actorName} · {session.sets.length} {session.sets.length === 1 ? 'change' : 'changes'} · {session.itemCount} {session.itemCount === 1 ? 'row' : 'rows'}
        </span>
      </button>
      {selected ? (
        <div className="flex flex-col gap-1.5 border-t border-line-soft px-3 py-2.5">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {session.sets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                <span className={`min-w-0 flex-1 ${s.undone ? 'text-ink-4 line-through' : 'text-ink'}`}>{s.label}</span>
                <Badge severity={s.kind === 'undo' || s.kind === 'restore' ? 'info' : 'neutral'}>{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                {canEdit && !s.undone && s.kind !== 'undo' ? (
                  <button type="button" disabled={history.pending} onClick={() => void history.run({ action: 'undo', changeSetId: s.id })} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-accent hover:underline disabled:opacity-50">
                    Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit && !session.undone ? (
            <GhostButton disabled={history.pending} className="!h-8 w-fit !px-3 !text-[12px]" onClick={() => void history.run({ action: 'undoSession', sessionId: session.id })}>
              Undo whole session
            </GhostButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function FindItem({ lotId }: { lotId: string }) {
  const [code, setCode] = useState('');
  const [asked, setAsked] = useState('');
  const q = useQuery({
    queryKey: ['lots', 'history-item', lotId, asked],
    queryFn: () => historyApi.item(lotId, { code: asked }),
    enabled: asked !== '',
  });
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(code.trim());
        }}
      >
        <div className="min-w-0 flex-1">
          <Field label="Archive code" hint="Who changed this row, and from what.">
            <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. NEG-MUM-0176-R-000" aria-label="Archive code to look up" />
          </Field>
        </div>
        <PrimaryButton type="submit" disabled={!code.trim()}>Show</PrimaryButton>
      </form>
      {q.isLoading ? <p className="m-0 text-[12.5px] text-ink-3">Looking…</p> : null}
      {q.data && q.data.entries.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No recorded changes for that code.</p> : null}
      {q.data && q.data.entries.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {q.data.entries.map((e) => (
            <li key={`${e.seq}-${e.at}`} className="rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-semibold ${e.undone ? 'text-ink-4 line-through' : 'text-ink'}`}>{e.label}</span>
                <span className="text-ink-4">{e.actorName} · {dateTime12(e.at)}</span>
              </div>
              <ul className="m-0 mt-0.5 list-none p-0">
                {e.cells.map((c, i) => (
                  <li key={i} className="text-ink-3">
                    <span className="font-medium text-ink-2">{pathLabel(c.path)}</span>: <span className="text-danger">{c.from}</span> <span aria-hidden>→</span>{' '}
                    <span className="font-medium text-good">{c.to}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Version history as a side panel: the sheet stays on screen. Pick a session or a saved version and the sheet itself
 * switches to how it was then, with the changed cells highlighted (see ItemsGrid).
 */
export function HistoryPanel({
  lotId,
  history,
  canEdit,
  view,
  onView,
  onClose,
}: {
  lotId: string;
  history: LotHistory;
  canEdit: boolean;
  view: HistView | null;
  onView: (v: HistView | null) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'sessions' | 'versions' | 'find'>('sessions');
  const [name, setName] = useState('');
  const data = history.data;

  return (
    <aside aria-label="History" className="fixed bottom-0 right-0 top-[60px] z-[95] flex w-[380px] max-w-[94vw] flex-col border-l border-line bg-surface shadow-panel">
      <div className="flex items-start gap-2 border-b border-line-soft px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[14px] font-semibold text-ink">History</h2>
          <p className="m-0 text-[12px] text-ink-3">Click a session or version to see the sheet as it was. Nothing is ever deleted.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close history" className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface-sunken hover:text-ink">
          <IconX size={14} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
        <Tabs
          ariaLabel="History views"
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={[
            { id: 'sessions', label: `Sessions${data ? ` · ${data.sessions.length}` : ''}` },
            { id: 'versions', label: `Versions${data ? ` · ${data.versions.length}` : ''}` },
            { id: 'find', label: 'Find a row' },
          ]}
        />
        {view ? (
          <GhostButton className="w-fit !h-8 !px-3 !text-[12px]" onClick={() => onView(null)}>
            ← Back to the current sheet
          </GhostButton>
        ) : null}
        {history.list.isLoading ? <p className="m-0 text-[12.5px] text-ink-3">Loading…</p> : null}
        {history.list.isError ? <FormError message="Could not load the history." /> : null}

        {tab === 'sessions' && data ? (
          data.sessions.length === 0 ? (
            <p className="m-0 text-[12.5px] text-ink-3">No changes recorded yet. Edits made from now on appear here.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.sessions.map((s) => {
                const selected = view?.mode === 'session' && view.sessionId === s.id;
                return <SessionCard key={s.id} session={s} selected={selected} canEdit={canEdit} history={history} onSelect={() => onView(selected ? null : { mode: 'session', sessionId: s.id })} />;
              })}
            </ul>
          )
        ) : null}

        {tab === 'versions' && data ? (
          <div className="flex flex-col gap-3">
            {canEdit ? (
              <form
                className="flex items-end gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!name.trim()) return;
                  const res = await history.run({ action: 'saveVersion', name: name.trim() });
                  if (res) setName('');
                }}
              >
                <div className="min-w-0 flex-1">
                  <Field label="Save the sheet as it is now" hint="A named checkpoint you can look at or return to.">
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Before the Mumbai import" aria-label="Version name" />
                  </Field>
                </div>
                <PrimaryButton type="submit" disabled={history.pending || !name.trim()}>Save</PrimaryButton>
              </form>
            ) : null}
            {data.versions.length === 0 ? (
              <p className="m-0 text-[12.5px] text-ink-3">No versions yet. The app also saves one before an Excel import, a big bulk edit, or a restore.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {data.versions.map((v) => {
                  const selected = view?.mode === 'version' && view.versionId === v.id;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onView(selected ? null : { mode: 'version', versionId: v.id })}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded-[8px] border bg-surface px-3 py-2 text-left ${selected ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink">{v.name}</span>
                          <span className="text-[12px] text-ink-3">
                            {dateTime12(v.at)}
                            {v.byName ? ` · ${v.byName}` : ''}
                          </span>
                        </span>
                        {v.auto ? <Badge severity="neutral">Automatic</Badge> : <Badge severity="info">Saved</Badge>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'find' ? <FindItem lotId={lotId} /> : null}
      </div>
    </aside>
  );
}
