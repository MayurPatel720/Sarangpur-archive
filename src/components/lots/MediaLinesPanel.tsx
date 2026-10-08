'use client';

import { useState } from 'react';
import type { LotDetailResponse } from '@/types/lot';
import { useMe } from '@/hooks/useCan';
import { GhostButton } from '@/components/ui/Form';
import { EditMediaLinesDialog } from './EditMediaLinesDialog';
import { useLotAccess } from './LotProjectBar';
import { prettyEnum, num } from '@/lib/format';
import { dataTypeLabel } from '@/lib/domain';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Panel, PanelHeader } from '@/components/ui/primitives';

type DetailLot = LotDetailResponse['lot'];

interface LineRow {
  index: number;
  format: string;
  dataType: string;
  mediaSubtypeLabel: string;
  quantity: number;
  quantityToDigitize: number;
  quantityAlreadyDigitized: number;
  notDigitizedReason: string | null;
  digitized: number | null;
  tagged: number | null;
}

const COLUMNS: Column<LineRow>[] = [
  {
    key: 'line',
    header: 'Line',
    render: (r) => <span className="tnum font-semibold">{r.index + 1}</span>,
  },
  {
    key: 'media',
    header: 'Media',
    render: (r) => (
      <span className="break-words">
        {prettyEnum(r.format)} · {dataTypeLabel(r.dataType)} · {r.mediaSubtypeLabel}
        {r.notDigitizedReason ? (
          <span className="block text-[11px] text-ink-3">
            Excluded: {prettyEnum(r.notDigitizedReason)}
          </span>
        ) : null}
      </span>
    ),
  },
  { key: 'qty', header: 'Qty', render: (r) => <span className="tnum">{num(r.quantity)}</span> },
  {
    key: 'qtd',
    header: 'To digitize',
    render: (r) => <span className="tnum">{num(r.quantityToDigitize)}</span>,
  },
  {
    key: 'qad',
    header: 'Already',
    render: (r) => <span className="tnum">{num(r.quantityAlreadyDigitized)}</span>,
  },
  {
    key: 'digitized',
    header: 'Digitized',
    render: (r) => (
      <span className="tnum">{r.digitized == null ? '—' : `${num(r.digitized)} / ${num(r.quantity)}`}</span>
    ),
  },
  {
    key: 'tagged',
    header: 'Tagged',
    render: (r) => <span className="tnum">{r.tagged == null ? '—' : num(r.tagged)}</span>,
  },
];

/**
 * Per-media-type breakdown (F2): each intake line with its live item counters.
 * Item counts come from the detail payload's `lineStats` (items grouped by
 * `lineIndex`), so this renders with no extra query.
 */
export function MediaLinesPanel({ lot }: { lot: DetailLot }) {
  const me = useMe();
  const access = useLotAccess(lot);
  const [editing, setEditing] = useState(false);
  const canEditQty =
    lot.stage === 'intake' && access.canWork && Boolean(me.data?.grants.includes('lot:edit'));
  const rows: LineRow[] = lot.mediaLines.map((l, i) => {
    const stats = lot.lineStats.find((s) => s.lineIndex === i) ?? null;
    return {
      index: i,
      format: l.format,
      dataType: l.dataType,
      mediaSubtypeLabel: l.mediaSubtypeLabel,
      quantity: l.quantity,
      quantityToDigitize: l.quantityToDigitize,
      quantityAlreadyDigitized: l.quantityAlreadyDigitized,
      notDigitizedReason: l.notDigitizedReason,
      digitized: stats?.digitized ?? null,
      tagged: stats?.tagged ?? null,
    };
  });

  return (
    <Panel>
      <PanelHeader title={`Media lines (${rows.length})`}>
        {canEditQty ? (
          <span className="ml-auto">
            <GhostButton onClick={() => setEditing(true)}>Edit quantities</GhostButton>
          </span>
        ) : null}
      </PanelHeader>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={false}
        emptyMessage="No media lines recorded for this lot yet."
        getRowKey={(r) => String(r.index)}
      />
      {editing ? <EditMediaLinesDialog lot={lot} onClose={() => setEditing(false)} /> : null}
    </Panel>
  );
}
