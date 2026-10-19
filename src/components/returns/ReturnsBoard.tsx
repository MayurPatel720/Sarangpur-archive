'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { returnsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { FORMAT_LABELS, type Format } from '@/lib/domain';
import { date, dateTime, todayIso } from '@/lib/format';
import { useMe } from '@/hooks/useCan';
import { Badge, ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { TextInput } from '@/components/ui/Form';
import { Pagination, totalPagesOf } from '@/components/ui/Pagination';
import { ReturnDialog } from '@/components/returns/ReturnDialog';
import type { ReturnCard, ReturnedRow, ReturnsSummary } from '@/types/returns';

/**
 * The Returns screen. "To return" is a board of cards — one per lot — each saying what is
 * going back (the whole lot, or just some items), how overdue it is, who asked for it
 * and how to reach them, with one button to record the handover. "Returned" is the
 * history: who received what, when, and how, so any return can be traced later.
 */

const REQUESTED: Record<string, string> = { physical: 'Physical original', digital: 'Digital copy', both: 'Original + digital copy' };

function Tile({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className="bg-surface border border-line rounded-[8px] px-3.5 py-3 min-w-0">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</div>
      <div className={`mt-0.5 text-[24px] font-semibold tabular-nums leading-tight ${tone === 'danger' && value > 0 ? 'text-danger' : tone === 'warning' && value > 0 ? 'text-warn' : 'text-ink'}`}>
        {value}
      </div>
      {note ? <div className="text-[11.5px] text-ink-3 truncate">{note}</div> : null}
    </div>
  );
}

function DueBadge({ card }: { card: ReturnCard }) {
  if (card.daysToDue === null) return <Badge severity="neutral">No due date</Badge>;
  if (card.overdue) {
    const d = Math.abs(card.daysToDue);
    return <Badge severity="critical">Overdue · {d} {d === 1 ? 'day' : 'days'}</Badge>;
  }
  if (card.daysToDue === 0) return <Badge severity="warning">Due today</Badge>;
  if (card.daysToDue <= 7) return <Badge severity="warning">Due in {card.daysToDue} {card.daysToDue === 1 ? 'day' : 'days'}</Badge>;
  return <Badge severity="neutral">Due {date(card.dueAt)}</Badge>;
}

function ReturnCardView({ card, canRecord, onRecord }: { card: ReturnCard; canRecord: boolean; onRecord: () => void }) {
  const first = card.contacts[0];
  const blocked = !card.wholeLot && card.waitingCount >= card.itemCount;
  return (
    <article className="bg-surface border border-line rounded-[8px] p-3.5 md:p-4 flex flex-col gap-3 min-w-0">
      <header className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <Link href={`/register/${card.lotId}?tab=items`} className="font-mono text-[14px] font-semibold text-ink no-underline hover:underline">
            {card.lotReference}
          </Link>
          {card.namingCode ? <span className="ml-2 text-[11.5px] text-ink-3">{card.namingCode}</span> : null}
          <div className="text-[12.5px] text-ink-2 truncate">
            {card.ownerName || 'Owner not recorded'} · {FORMAT_LABELS[card.format as Format] ?? card.format}
          </div>
        </div>
        <DueBadge card={card} />
      </header>

      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] font-semibold text-ink">
          {card.wholeLot ? `Whole lot · ${card.itemCount} items` : `${card.items.length} of this lot's items`}
        </div>
        {!card.wholeLot ? (
          <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
            {card.items.slice(0, 4).map((it) => (
              <li
                key={it.id}
                title={it.name ?? it.code}
                className={`font-mono text-[11.5px] px-1.5 py-0.5 rounded-[4px] border ${it.waiting ? 'border-warn-line bg-warn-bg text-warn' : 'border-line bg-surface-sunken text-ink-2'}`}
              >
                {it.code}
              </li>
            ))}
            {card.items.length > 4 ? <li className="text-[11.5px] text-ink-3 self-center">+{card.items.length - 4} more</li> : null}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
          {card.requestedFormat ? <span>Asked for: {REQUESTED[card.requestedFormat] ?? card.requestedFormat}</span> : null}
          {card.durationText ? <span>{card.durationText}</span> : null}
          {card.dueAt ? <span>Due {date(card.dueAt)}</span> : null}
          {card.assigneeName ? <span>Lot owner in archive: {card.assigneeName}</span> : null}
        </div>
        {card.waitingCount > 0 ? (
          <p className="m-0 text-[12px] text-warn">
            {card.waitingCount} {card.waitingCount === 1 ? 'item needs' : 'items need'} digitalizing before the originals can go back.
          </p>
        ) : null}
      </div>

      {first ? (
        <div className="rounded-[6px] bg-surface-sunken border border-line-soft px-3 py-2 text-[12.5px] min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{first.role}</div>
          <div className="font-semibold text-ink truncate">{first.name}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-2">
            {first.phone ? (
              <a href={`tel:${first.phone.replace(/[^0-9+]/g, '')}`} className="text-accent no-underline hover:underline">
                {first.phone}
              </a>
            ) : null}
            {first.email ? (
              <a href={`mailto:${first.email}`} className="text-accent no-underline hover:underline truncate">
                {first.email}
              </a>
            ) : null}
            {first.address ? <span className="truncate">{first.address}</span> : null}
            {!first.phone && !first.email && !first.address ? <span className="text-ink-3">No contact details on the lot.</span> : null}
          </div>
        </div>
      ) : null}

      {canRecord ? (
        <button
          type="button"
          onClick={onRecord}
          disabled={blocked}
          className="h-10 px-4 bg-accent border border-accent rounded-[6px] text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {blocked ? 'Digitalize first' : 'Record return'}
        </button>
      ) : null}
    </article>
  );
}

function ReturnedRowView({ row }: { row: ReturnedRow }) {
  const r = row.recipient;
  return (
    <li className="grid grid-cols-1 md:grid-cols-[130px_minmax(0,1fr)_minmax(0,1.3fr)_170px] gap-x-4 gap-y-1.5 px-3.5 md:px-4 py-3 border-b border-line-row last:border-b-0 min-w-0">
      <div className="text-[12.5px] text-ink-2">
        <div className="font-semibold text-ink">{row.returnedAt ? date(row.returnedAt) : '—'}</div>
        {row.byName ? <div className="text-[11.5px] text-ink-3">by {row.byName}</div> : null}
      </div>
      <div className="min-w-0">
        <Link href={`/register/${row.lotId}`} className="font-mono text-[13px] font-semibold text-ink no-underline hover:underline">
          {row.lotReference}
        </Link>
        <div className="text-[12px] text-ink-3 truncate">{row.ownerName || '—'}</div>
        <div className="text-[12px] text-ink-2">
          {row.scope === 'lot' ? 'Whole lot' : `${row.count} ${row.count === 1 ? 'item' : 'items'}`}
          {row.itemCodes.length > 0 ? <span className="font-mono text-[11px] text-ink-3"> · {row.itemCodes.slice(0, 3).join(', ')}{row.count > 3 ? '…' : ''}</span> : null}
        </div>
      </div>
      <div className="min-w-0 text-[12.5px]">
        {r ? (
          <>
            <div className="font-semibold text-ink truncate">{r.name}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink-2">
              {r.phone ? (
                <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="text-accent no-underline hover:underline">
                  {r.phone}
                </a>
              ) : null}
              {r.email ? (
                <a href={`mailto:${r.email}`} className="text-accent no-underline hover:underline truncate">
                  {r.email}
                </a>
              ) : null}
            </div>
            {r.place ? <div className="text-ink-3 truncate">{r.place}</div> : null}
          </>
        ) : (
          <span className="text-ink-4">Receiver not recorded</span>
        )}
      </div>
      <div className="text-[12.5px] text-ink-2 min-w-0">
        {row.method ?? '—'}
        {row.trackingReference ? <div className="text-[11.5px] text-ink-3 truncate">Ref: {row.trackingReference}</div> : null}
        {row.notes ? <div className="text-[11.5px] text-ink-3 line-clamp-2">{row.notes}</div> : null}
      </div>
    </li>
  );
}

export function ReturnsBoard() {
  const me = useMe();
  const canView = me.data?.grants.includes('returns:view') ?? false;
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [recording, setRecording] = useState<ReturnCard | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const params: Record<string, string> = { tab, page: String(page), pageSize: String(pageSize), today: todayIso(), ...(q ? { q } : {}) };
  const list = useQuery({
    queryKey: queryKeys.returns.list(JSON.stringify(params)),
    queryFn: () => returnsApi.list(params),
    enabled: canView,
    placeholderData: (prev) => prev,
  });

  if (me.isLoading) return <Skeleton className="h-40" />;
  if (!canView) {
    return (
      <Panel>
        <ErrorState message="You don't have access to returns." hint="Ask an admin for the returns:view permission." />
      </Panel>
    );
  }

  const data = list.data;
  const s: ReturnsSummary | undefined = data?.summary;
  const chip = (active: boolean) =>
    `min-h-[38px] px-3.5 rounded-[6px] border text-[13px] font-semibold cursor-pointer ${active ? 'bg-accent-soft border-accent text-accent' : 'bg-surface border-line text-ink-2'}`;

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">Returns</h1>
        <p className="m-0 text-[12.5px] text-ink-3">Hand material back, and keep a record of who received it.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
        <Tile label="Lots to return" value={s?.lotsToReturn ?? 0} note={s ? `${s.itemsToReturn} items` : undefined} />
        <Tile label="Overdue" value={s?.overdue ?? 0} tone="danger" note="past the agreed date" />
        <Tile label="Due within 7 days" value={s?.dueSoon ?? 0} tone="warning" />
        <Tile label="Returned · 30 days" value={s?.returnedLast30Days ?? 0} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div role="group" aria-label="Show" className="flex gap-1.5">
          <button type="button" aria-pressed={tab === 'todo'} onClick={() => { setTab('todo'); setPage(1); }} className={chip(tab === 'todo')}>
            To return{s ? ` (${s.lotsToReturn})` : ''}
          </button>
          <button type="button" aria-pressed={tab === 'done'} onClick={() => { setTab('done'); setPage(1); }} className={chip(tab === 'done')}>
            Returned
          </button>
        </div>
        <div className="sm:ml-auto sm:w-[320px]">
          <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'todo' ? 'Search lot, owner, item code…' : 'Search lot, receiver, place, tracking…'} aria-label="Search returns" />
        </div>
      </div>

      {list.isError ? (
        <ErrorState message="Couldn't load returns." onRetry={() => void list.refetch()} />
      ) : !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : tab === 'todo' ? (
        data.cards.length === 0 ? (
          <Panel>
            <p className="m-0 p-8 text-center text-[13px] text-ink-3">{q ? 'Nothing matches that search.' : 'Nothing waiting to be returned.'}</p>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.cards.map((c) => (
              <ReturnCardView key={c.key} card={c} canRecord={data.can.record} onRecord={() => setRecording(c)} />
            ))}
          </div>
        )
      ) : data.returned.length === 0 ? (
        <Panel>
          <p className="m-0 p-8 text-center text-[13px] text-ink-3">{q ? 'Nothing matches that search.' : 'No returns recorded yet.'}</p>
        </Panel>
      ) : (
        <Panel>
          <div className="hidden md:grid grid-cols-[130px_minmax(0,1fr)_minmax(0,1.3fr)_170px] gap-x-4 px-4 py-2 border-b border-line-soft text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            <span>Returned</span>
            <span>Lot</span>
            <span>Received by</span>
            <span>How</span>
          </div>
          <ul className="m-0 p-0 list-none">
            {data.returned.map((r) => (
              <ReturnedRowView key={r.key} row={r} />
            ))}
          </ul>
        </Panel>
      )}

      {data && data.total > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPagesOf(data.total, pageSize)}
          total={data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          label={tab === 'todo' ? 'lots' : 'returns'}
        />
      ) : null}

      {recording ? <ReturnDialog card={recording} onClose={() => setRecording(null)} /> : null}
    </div>
  );
}
