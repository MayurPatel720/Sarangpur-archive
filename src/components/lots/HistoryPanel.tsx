'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { historyApi } from '@/lib/api-client';
import type { LotHistory } from '@/hooks/useLotHistory';
import { dateTime12 } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, GhostButton, PrimaryButton, TextInput } from '@/components/ui/Form';
import { Badge, Tabs } from '@/components/ui/primitives';
import type { HistoryChange, HistoryListResponse } from '@/types/history';

type Session = HistoryListResponse['sessions'][number];
type Target = { seq?: number; versionId?: string; title: string };

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

/** The old → new cells of a list of rows. */
function Cells({ changes, truncated }: { changes: HistoryChange[]; truncated?: boolean }) {
  if (changes.length === 0) return <p className="m-0 text-[12px] text-ink-3">No cells to show.</p>;
  return (
    <div className="flex flex-col gap-1">
      <ul className="m-0 flex max-h-[260px] list-none flex-col gap-1 overflow-y-auto p-0">
        {changes.map((c) => (
          <li key={c.itemId} className="rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-1.5 text-[12px]">
            <span className="font-mono font-semibold text-ink">{c.code ?? 'Row'}</span>
            <ul className="m-0 mt-0.5 list-none p-0">
              {c.cells.map((cell, i) => (
                <li key={i} className="text-ink-3">
                  <span className="font-medium text-ink-2">{cell.path}</span>: {cell.from} <span aria-hidden>→</span> <span className="text-ink">{cell.to}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {truncated ? <p className="m-0 text-[11.5px] text-ink-4">Showing the first rows only.</p> : null}
    </div>
  );
}

function ChangeCells({ lotId, changeSetId }: { lotId: string; changeSetId: string }) {
  const q = useQuery({ queryKey: ['lots', 'history-change', lotId, changeSetId], queryFn: () => historyApi.change(lotId, changeSetId) });
  if (q.isLoading) return <p className="m-0 text-[12px] text-ink-3">Loading…</p>;
  if (q.isError || !q.data) return <p className="m-0 text-[12px] text-danger">Could not load the cells.</p>;
  return <Cells changes={q.data.changes} truncated={q.data.truncated} />;
}

/** What restoring a version (or a point in history) would change; the same view serves as "Compare". */
function RestorePreview({
  lotId,
  target,
  history,
  canEdit,
  onBack,
  onDone,
}: {
  lotId: string;
  target: Target;
  history: LotHistory;
  canEdit: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const q = useQuery({
    queryKey: ['lots', 'history-preview', lotId, target.seq ?? null, target.versionId ?? null],
    queryFn: () => historyApi.preview(lotId, { seq: target.seq, versionId: target.versionId }),
  });
  const p = q.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <GhostButton onClick={onBack}>← Back</GhostButton>
        <h3 className="m-0 text-[14px] font-semibold text-ink">{target.title}</h3>
      </div>
      {q.isLoading ? <p className="m-0 text-[12.5px] text-ink-3">Comparing…</p> : null}
      {q.isError ? <FormError message="Could not compare with that point." /> : null}
      {p ? (
        <>
          <p className="m-0 text-[13px] text-ink-2">
            {p.itemCount === 0 ? (
              <>Nothing to change — the sheet already matches this point.</>
            ) : (
              <>
                Restoring changes <b>{p.itemCount}</b> {p.itemCount === 1 ? 'row' : 'rows'} (<b>{p.cellCount}</b> {p.cellCount === 1 ? 'cell' : 'cells'}). It is saved as a new change, so you can undo it.
              </>
            )}
          </p>
          {p.reopensDecision ? (
            <p role="note" className="m-0 rounded-[6px] border border-info-line bg-info-bg px-3 py-2 text-[12.5px] text-info">
              This also reopens the lot&apos;s decision and moves it back to an earlier stage.
            </p>
          ) : null}
          <Cells changes={p.changes} truncated={p.truncated} />
          {canEdit ? (
            <div className="flex justify-end">
              <PrimaryButton
                disabled={history.pending || p.itemCount === 0}
                onClick={async () => {
                  const res = await history.run({ action: 'restore', seq: target.versionId ? undefined : target.seq, versionId: target.versionId });
                  if (res) onDone();
                }}
              >
                {history.pending ? 'Restoring…' : 'Restore the sheet to this point'}
              </PrimaryButton>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SessionCard({
  lotId,
  session,
  canEdit,
  history,
  onPreview,
}: {
  lotId: string;
  session: Session;
  canEdit: boolean;
  history: LotHistory;
  onPreview: (t: Target) => void;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const oldest = session.sets[session.sets.length - 1]!;
  return (
    <li className="rounded-[8px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent p-0 text-left">
          <span className="text-[13px] font-semibold text-ink">
            <span aria-hidden className="mr-1.5 text-ink-3">{open ? '▾' : '▸'}</span>
            {when(session.from, session.to)}
          </span>
          <span className="text-[12px] text-ink-3">
            {session.actorName} · {session.sets.length} {session.sets.length === 1 ? 'change' : 'changes'} · {session.itemCount} {session.itemCount === 1 ? 'row' : 'rows'}
          </span>
        </button>
        {session.undone ? <Badge severity="neutral">Undone</Badge> : null}
        {canEdit && !session.undone ? (
          <GhostButton disabled={history.pending} className="!h-8 !px-3 !text-[12px]" onClick={() => void history.run({ action: 'undoSession', sessionId: session.id })}>
            Undo session
          </GhostButton>
        ) : null}
        <GhostButton className="!h-8 !px-3 !text-[12px]" onClick={() => onPreview({ seq: oldest.seq - 1, title: `Before ${when(session.from, session.to)}` })}>
          Sheet before this
        </GhostButton>
      </div>
      {open ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-line-soft p-2.5">
          {session.sets.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5 rounded-[6px] bg-surface-sunken px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`min-w-0 flex-1 text-[12.5px] ${s.undone ? 'text-ink-4 line-through' : 'text-ink'}`}>{s.label}</span>
                <Badge severity={s.kind === 'undo' || s.kind === 'restore' ? 'info' : 'neutral'}>{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                <span className="text-[11.5px] text-ink-4">{dateTime12(s.at)}</span>
                <button type="button" onClick={() => setShown(shown === s.id ? null : s.id)} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-accent hover:underline">
                  {shown === s.id ? 'Hide cells' : 'Cells'}
                </button>
                {canEdit && !s.undone && s.kind !== 'undo' ? (
                  <button type="button" disabled={history.pending} onClick={() => void history.run({ action: 'undo', changeSetId: s.id })} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-accent hover:underline disabled:opacity-50">
                    Undo this
                  </button>
                ) : null}
              </div>
              {shown === s.id ? <ChangeCells lotId={lotId} changeSetId={s.id} /> : null}
            </li>
          ))}
        </ul>
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
        <ul className="m-0 flex max-h-[360px] list-none flex-col gap-1.5 overflow-y-auto p-0">
          {q.data.entries.map((e) => (
            <li key={`${e.seq}-${e.at}`} className="rounded-[6px] border border-line-soft bg-surface-sunken px-2.5 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-semibold ${e.undone ? 'text-ink-4 line-through' : 'text-ink'}`}>{e.label}</span>
                <span className="text-ink-4">{e.actorName} · {dateTime12(e.at)}</span>
              </div>
              <ul className="m-0 mt-0.5 list-none p-0">
                {e.cells.map((c, i) => (
                  <li key={i} className="text-ink-3">
                    <span className="font-medium text-ink-2">{c.path}</span>: {c.from} <span aria-hidden>→</span> <span className="text-ink">{c.to}</span>
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

/** The lot's version history: sessions, saved versions, restore (with a preview), and per-row history. */
export function HistoryPanel({ lotId, history, canEdit, onClose }: { lotId: string; history: LotHistory; canEdit: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'sessions' | 'versions' | 'find'>('sessions');
  const [preview, setPreview] = useState<Target | null>(null);
  const [name, setName] = useState('');
  const data = history.data;

  return (
    <Dialog wide title="History" subtitle="Every change to this sheet, newest first. Nothing here is deleted — restoring is saved as a new change." onClose={onClose}>
      {preview ? (
        <RestorePreview lotId={lotId} target={preview} history={history} canEdit={canEdit} onBack={() => setPreview(null)} onDone={() => setPreview(null)} />
      ) : (
        <div className="flex flex-col gap-3">
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
          {history.list.isLoading ? <p className="m-0 text-[12.5px] text-ink-3">Loading…</p> : null}
          {history.list.isError ? <FormError message="Could not load the history." /> : null}

          {tab === 'sessions' && data ? (
            data.sessions.length === 0 ? (
              <p className="m-0 text-[12.5px] text-ink-3">No changes recorded yet. Edits made from now on appear here.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {data.sessions.map((s) => (
                  <SessionCard key={s.id} lotId={lotId} session={s} canEdit={canEdit} history={history} onPreview={setPreview} />
                ))}
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
                    <Field label="Save the sheet as it is now" hint="A named checkpoint you can compare with or return to.">
                      <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Before the Mumbai import" aria-label="Version name" />
                    </Field>
                  </div>
                  <PrimaryButton type="submit" disabled={history.pending || !name.trim()}>Save version</PrimaryButton>
                </form>
              ) : null}
              {data.versions.length === 0 ? (
                <p className="m-0 text-[12.5px] text-ink-3">No versions yet. The app also saves one before an Excel import, a big bulk edit, or a restore.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {data.versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line bg-surface px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink">{v.name}</span>
                        <span className="text-[12px] text-ink-3">
                          {dateTime12(v.at)}
                          {v.byName ? ` · ${v.byName}` : ''}
                        </span>
                      </span>
                      {v.auto ? <Badge severity="neutral">Automatic</Badge> : <Badge severity="info">Saved</Badge>}
                      <GhostButton className="!h-8 !px-3 !text-[12px]" onClick={() => setPreview({ versionId: v.id, seq: v.seq, title: `Compare with “${v.name}”` })}>
                        {canEdit ? 'Compare / Restore' : 'Compare'}
                      </GhostButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'find' ? <FindItem lotId={lotId} /> : null}
        </div>
      )}
    </Dialog>
  );
}
