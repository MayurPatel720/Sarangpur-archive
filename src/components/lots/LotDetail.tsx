'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotContactInput, LotDetailResponse, LotPatchBody } from '@/types/lot';
import { STAGE_LABELS } from '@/lib/domain';
import { useReferenceList } from '@/hooks/useReferenceList';
import { date, dateTime12, num, prettyEnum, severityMark } from '@/lib/format';
import type { Severity } from '@/types/dashboard';
import { Field, FormError, GhostButton, PrimaryButton, Textarea, TextInput } from '@/components/ui/Form';
import {
  Badge,
  Definition,
  EmptyValue,
  ErrorState,
  Meter,
  Panel,
  PanelHeader,
  Skeleton,
  TabPanel,
  Tabs,
} from '@/components/ui/primitives';
import { IconChevronLeft } from '@/components/ui/icons';
import { EditableTable } from '@/components/ui/EditableTable';
import { RefSelect } from '@/components/ui/RefSelect';
import { FormSection, StepBlocks } from '@/components/ui/FormSection';
import { useMe } from '@/hooks/useCan';
import { useUrlTab } from '@/lib/useUrlTab';
import {
  EMPTY_CONTACT,
  RightsTypeField,
  SubtypeField,
  makeContactColumns,
  type ContactRow,
} from './lot-form-fields';
import { DecisionSection } from './DecisionSection';
import { ScanSection } from './ScanSection';
import { MlsSection } from './MlsSection';
import { ReturnSection } from './ReturnSection';
import { DiscardSection } from './DiscardSection';
import { FilePathSection } from './FilePathSection';
import { MediaLinesPanel } from './MediaLinesPanel';
import { ItemsPanel } from './ItemsPanel';
import { ActivityPanel } from './ActivityPanel';

type LotDetail = LotDetailResponse['lot'];

/** Deep-linkable tabs; `?tab=` survives refresh. Legacy `?tab=intake` falls back to overview. */
const TAB_IDS = ['overview', 'workflow', 'record', 'items', 'activity'] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  workflow: 'Workflow',
  record: 'Full record',
  items: 'Items',
  activity: 'Activity',
};

/** Sticky in-page jumps for the five workflow sections (the hand-sketch rail). */
const WORKFLOW_JUMPS = [
  { id: 'wf-decision', label: 'Decision' },
  { id: 'wf-scan', label: 'Scan' },
  { id: 'wf-tag', label: 'Tag' },
  { id: 'wf-return', label: 'Return' },
  { id: 'wf-discard', label: 'Discard' },
] as const;
const MAIN_PATH = ['intake', 'decision', 'metadata', 'scanning', 'mls_tag', 'storage'] as const;

const STAGE_SEVERITY: Record<string, Severity> = {
  intake: 'info',
  decision: 'warning',
  metadata: 'info',
  scanning: 'info',
  mls_tag: 'info',
  storage: 'good',
  returned: 'neutral',
  discarded: 'critical',
};

const DECISION_SEVERITY: Record<string, Severity> = {
  pending: 'warning',
  archive: 'good',
  return: 'info',
  discard: 'critical',
};

const SCAN_SEVERITY: Record<string, Severity> = {
  pending: 'neutral',
  in_progress: 'info',
  scanned: 'good',
  cannot_scan: 'warning',
};

const RETURN_SEVERITY: Record<string, Severity> = {
  not_requested: 'neutral',
  pending: 'warning',
  in_progress: 'info',
  returned: 'good',
};

function contactToInput(c: { name: string; phone: string | null; email: string | null; address: string | null }): LotContactInput {
  return {
    name: c.name,
    ...(c.phone ? { phone: c.phone } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.address ? { address: c.address } : {}),
  };
}

function cleanContact(c: LotContactInput): LotContactInput {
  const out: LotContactInput = { name: c.name.trim() };
  if (c.phone?.trim()) out.phone = c.phone.trim();
  if (c.email?.trim()) out.email = c.email.trim();
  if (c.address?.trim()) out.address = c.address.trim();
  return out;
}

const sameContact = (a: LotContactInput, b: LotContactInput) =>
  JSON.stringify(cleanContact(a)) === JSON.stringify(cleanContact(b));

const dash = <EmptyValue />;

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

function initials(name: string): string {
  const bits = name.trim().split(/\s+/).slice(0, 2);
  return bits.map((b) => b.charAt(0).toUpperCase()).join('') || '·';
}

/**
 * Full-record group: a labelled block separated from the previous group by a
 * heavy rule (thicker + stronger token + a full spacing tier above it).
 */
function GroupBlock({ first, children }: { first?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col ${first ? '' : 'border-t-2 border-line mt-5 pt-4'}`}>
      {children}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-4 pb-1">
      {children}
    </span>
  );
}

/**
 * One ruled row of the record: fields share a single continuous hairline
 * underneath (low-contrast token, so data stays primary). The row container —
 * not each cell — owns the rule, so lines stay level even when values wrap to
 * different heights. No verticals, no zebra: a ruled list, not a table.
 */
function RecordRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3 py-3 border-b border-line-soft last:border-b-0 last:pb-1">
      {children}
    </div>
  );
}

function YesNoChip({ value }: { value: boolean | null }) {
  if (value === null) return dash;
  return <Badge severity={value ? 'good' : 'neutral'}>{value ? 'Yes' : 'No'}</Badge>;
}

/* ------------------------------------------------------------ journey panel */

function JourneyPanel({ lot, stageLabel }: { lot: LotDetail; stageLabel: string }) {
  return (
    <Panel>
      <PanelHeader title="Journey" />
      <div className="px-4 md:px-5 py-4">
        <Timeline events={journeyEvents(lot, stageLabel)} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ hero */

function Stepper({ stage }: { stage: string }) {
  const terminal = stage === 'returned' || stage === 'discarded';
  const currentIdx = MAIN_PATH.indexOf(stage as (typeof MAIN_PATH)[number]);
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1" aria-label="Lot journey">
      {MAIN_PATH.map((s, i) => {
        const done = terminal || (currentIdx >= 0 && i < currentIdx);
        const current = !terminal && i === currentIdx;
        const upcoming = !done && !current;
        return (
          <span key={s} className="flex items-center min-w-0">
            {i > 0 ? <span aria-hidden className={`w-5 md:w-8 h-px mx-1.5 flex-shrink-0 ${done || current ? 'bg-accent' : 'bg-line-soft'}`} /> : null}
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  done ? 'bg-good-mark' : current ? 'bg-accent-bright ring-4 ring-accent-soft' : 'bg-neutral-mark opacity-50'
                }`}
              />
              <span
                className={`text-[12px] ${current ? 'font-semibold text-ink' : done ? 'font-medium text-ink-2' : 'font-medium text-ink-4'} ${upcoming ? '' : ''}`}
              >
                {STAGE_LABELS[s as keyof typeof STAGE_LABELS] ?? s}
              </span>
            </span>
          </span>
        );
      })}
      {terminal ? (
        <span className="flex items-center">
          <span aria-hidden className="w-5 md:w-8 h-px mx-1.5 flex-shrink-0 bg-accent" />
          <Badge severity={STAGE_SEVERITY[stage] ?? 'neutral'}>
            {STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage}
          </Badge>
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- material */

function MaterialSection({ lot }: { lot: LotDetail }) {
  const contentBits = [lot.photoEvent, lot.photoLocation, lot.photoDate].filter(Boolean);
  const hasContent = contentBits.length > 0 || lot.peopleInPhoto || lot.reasonForSending || lot.senderRemarks;
  return (
      <Panel>
        <PanelHeader title="About this material" />
        <div className="px-4 md:px-5 py-4 flex flex-col gap-3.5">
          {lot.reasonForSending ? (
            <p className="m-0 font-display text-[17px] md:text-[19px] leading-relaxed text-ink">
              {lot.reasonForSending}
            </p>
          ) : null}
          {contentBits.length > 0 ? (
            <p className="m-0 text-[14px] leading-relaxed text-ink-2">
              {contentBits.join(' · ')}
            </p>
          ) : null}
          {lot.peopleInPhoto ? (
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-ink-3">People pictured</span>
              <span className="text-[13.5px] leading-relaxed text-ink">{lot.peopleInPhoto}</span>
            </div>
          ) : null}
          {lot.senderRemarks ? (
            <div className="flex flex-col gap-1 border-l-2 border-line-strong pl-3">
              <span className="text-[12px] font-medium text-ink-3">Sender remarks</span>
              <span className="text-[13.5px] leading-relaxed text-ink">{lot.senderRemarks}</span>
            </div>
          ) : null}
          {!hasContent ? (
            <p className="m-0 text-[13px] text-ink-4">Content not yet described — add it from Edit.</p>
          ) : null}
        </div>
      </Panel>
  );
}

/* -------------------------------------------------------------- condition */

function ConditionPhoto({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const servable = url.startsWith('/uploads/') || /^https?:\/\//i.test(url);
  const looksImage = /(\.jpe?g|\.png|\.webp|\.gif)(\?|#|$)/i.test(url);
  if (!servable || !looksImage || failed) {
    return <span className="font-mono text-[12px] text-ink-2 break-all">{url}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group block w-fit max-w-full"
      aria-label="Open condition photo in a new tab"
    >
      <img
        src={url}
        alt="Condition photo"
        loading="lazy"
        onError={() => setFailed(true)}
        className="block max-h-60 w-auto max-w-full rounded-[6px] border border-line-soft object-cover transition-shadow group-hover:shadow-lift"
      />
      <span className="block mt-1.5 font-mono text-[11px] text-ink-4 break-all">{url}</span>
    </a>
  );
}

function ConditionSection({ lot }: { lot: LotDetail }) {
  return (
      <Panel>
        <PanelHeader title="Condition" />
        <div className="px-4 md:px-5 py-4 grid grid-cols-1 md:grid-cols-5 gap-x-6 gap-y-4">
          <div className="md:col-span-3 flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">Condition notes</span>
            {lot.conditionNotes ? (
              <span className="text-[13.5px] leading-relaxed text-ink">{lot.conditionNotes}</span>
            ) : (
              dash
            )}
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">Condition photo</span>
            {lot.conditionPhotoUrl ? <ConditionPhoto url={lot.conditionPhotoUrl} /> : dash}
          </div>
          {lot.digitalFilePath ? (
            <div className="col-span-full flex flex-col gap-1">
              <span className="text-[12px] font-medium text-ink-3">Digital file path</span>
              <span className="font-mono text-[12px] text-ink-2 break-all">{lot.digitalFilePath}</span>
            </div>
          ) : null}
          <div className="col-span-full flex items-center gap-2 flex-wrap pt-1">
            <Badge severity={lot.physicalLabelApplied ? 'good' : 'neutral'}>
              Physical label {lot.physicalLabelApplied ? 'applied' : 'not applied'}
            </Badge>
            <Badge severity={lot.containerLabelApplied ? 'good' : 'neutral'}>
              Container label {lot.containerLabelApplied ? 'applied' : 'not applied'}
            </Badge>
          </div>
        </div>
      </Panel>
  );
}

/* --------------------------------------------------------------- progress */

function StatBlock({ label, value, sub, meter, meterSeverity }: { label: string; value: string; sub?: string; meter?: number; meterSeverity?: Severity }) {
  return (
    <div className="bg-surface-subtle border border-line-soft rounded-[6px] px-3.5 py-3 flex flex-col gap-1.5 min-w-0">
      <span className="tnum text-[20px] font-semibold tracking-[-0.01em] text-ink leading-none">{value}</span>
      <span className="text-[12px] font-medium text-ink-3">{label}</span>
      {meter !== undefined ? <Meter percent={meter} severity={meterSeverity ?? 'info'} /> : null}
      {sub ? <span className="font-mono text-[11px] text-ink-4 truncate" title={sub}>{sub}</span> : null}
    </div>
  );
}

function QuietRow({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[13px] text-ink-4">{children}</p>;
}

function ProgressSection({ lot }: { lot: LotDetail }) {
  const t = lot.itemCounts;
  const ops = lot.ops;
  const scanActive = ops.scanStatus !== 'pending' || ops.folderPath || ops.scanDate;
  const mlsActive = ops.mlsRecordId || ops.mlsTaggedCount > 0 || ops.mlsDuplicatesFound > 0;
  const returnActive = ops.returnStatus !== 'not_requested' || ops.returnRequested;
  return (
      <Panel>
        <PanelHeader title="Digitization progress" />
        <div className="px-4 md:px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatBlock label="Items selected" value={`${num(t.selected)} / ${num(t.total)}`} meter={pct(t.selected, t.total)} />
            <StatBlock label="Items digitized" value={`${num(t.digitized)} / ${num(t.selected)}`} meter={pct(t.digitized, t.selected)} />
            <StatBlock label="Tagged in MLS" value={`${num(t.tagged)} / ${num(t.digitized)}`} meter={pct(t.tagged, t.digitized)} meterSeverity="good" />
            <StatBlock
              label="Duplicates"
              value={num(t.duplicates)}
              sub={t.duplicates > 0 ? 'needs review' : undefined}
              meter={t.duplicates > 0 ? 100 : 0}
              meterSeverity={t.duplicates > 0 ? 'critical' : 'info'}
            />
          </div>
          <p className="m-0 text-[13px] text-ink-2">
            {num(lot.quantity)} in the lot · {num(lot.quantityToDigitize)} to digitize · {num(lot.quantityAlreadyDigitized)} already digitized
            {lot.quantityRemarks ? ` — ${lot.quantityRemarks}` : ''}
          </p>
          <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3.5">
            {scanActive ? (
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                <Badge severity={SCAN_SEVERITY[ops.scanStatus] ?? 'neutral'}>{prettyEnum(ops.scanStatus)}</Badge>
                <span className="text-ink-2">
                  Scan · {num(ops.foundFileCount)} of {num(ops.expectedFileCount)} files
                  {ops.scannedByName ? ` · by ${ops.scannedByName}` : ''}
                  {ops.scanDate ? ` · ${dateTime12(ops.scanDate)}` : ''}
                </span>
                {ops.folderPath ? <span className="font-mono text-[11.5px] text-ink-4 break-all">{ops.folderPath}</span> : null}
              </div>
            ) : (
              <QuietRow>Scan not yet started.</QuietRow>
            )}
            {mlsActive ? (
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                <Badge severity="info">MLS</Badge>
                <span className="text-ink-2">
                  {ops.mlsRecordId ? <span className="font-mono">{ops.mlsRecordId}</span> : 'No record yet'}
                  {' · '}{num(ops.mlsTaggedCount)} tagged
                  {ops.mlsDuplicatesFound > 0 ? ` · ${num(ops.mlsDuplicatesFound)} duplicates` : ''}
                </span>
              </div>
            ) : (
              <QuietRow>Nothing tagged in MLS yet.</QuietRow>
            )}
            {returnActive ? (
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                <Badge severity={RETURN_SEVERITY[ops.returnStatus] ?? 'neutral'}>{prettyEnum(ops.returnStatus)}</Badge>
                <span className="text-ink-2">
                  Return{ops.returnFormat && ops.returnFormat !== 'none' ? ` · ${prettyEnum(ops.returnFormat)}` : ''}
                  {ops.returnDueAt ? ` · due ${date(ops.returnDueAt)}` : ''}
                  {ops.returnHandledByName ? ` · ${ops.returnHandledByName}` : ''}
                  {ops.returnDuration ? ` · kept ${ops.returnDuration}` : ''}
                </span>
              </div>
            ) : (
              <QuietRow>No return requested.</QuietRow>
            )}
            {ops.discardReason ? (
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                <Badge severity="critical">Discarded</Badge>
                <span className="text-ink-2">
                  {prettyEnum(ops.discardReason)}
                  {ops.discardedByName ? ` · by ${ops.discardedByName}` : ''}
                  {ops.discardedAt ? ` · ${date(ops.discardedAt)}` : ''}
                  {ops.discardNotes ? ` — ${ops.discardNotes}` : ''}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>
  );
}

/* ---------------------------------------------------------------- journey */

type JourneyEvent = { at: string; time: number; label: string; detail?: string; severity: Severity };

function journeyEvents(lot: LotDetail, stageLabel: string): JourneyEvent[] {
  const dd = lot.decisionDetail;
  const ops = lot.ops;
  const sortable = (at: string | null, label: string, detail: string | undefined, severity: Severity): JourneyEvent | null => {
    if (!at) return null;
    const time = Date.parse(at);
    return { at, time: Number.isNaN(time) ? Number.POSITIVE_INFINITY : time, label, detail, severity };
  };
  const events: (JourneyEvent | null)[] = [
    sortable(lot.dateReceived, `Received by ${lot.receiver.name}`, lot.originSource ? `Origin ${lot.originSource}` : undefined, 'neutral'),
    sortable(lot.stageEnteredAt, `Entered ${stageLabel}`, `Moved by ${lot.stageEnteredByName ?? 'Unknown'}`, 'info'),
    dd.status !== 'pending' && dd.decidedAt
      ? sortable(dd.decidedAt, `Decision recorded — ${dd.verdict ? prettyEnum(dd.verdict) : prettyEnum(dd.status)}`, `by ${dd.decidedByName ?? 'Unknown'}`, 'good')
      : null,
    dd.overrideStatus === 'requested'
      ? sortable(dd.decidedAt ?? lot.stageEnteredAt, 'Override requested', `by ${dd.overrideRequestedByName ?? 'Unknown'}`, 'warning')
      : null,
    dd.overrideStatus === 'approved'
      ? sortable(dd.decidedAt ?? lot.stageEnteredAt, 'Override approved', `by ${dd.overrideApprovedByName ?? 'Unknown'}`, 'good')
      : null,
    dd.overrideStatus === 'rejected'
      ? sortable(dd.decidedAt ?? lot.stageEnteredAt, 'Override rejected', `by ${dd.overrideApprovedByName ?? 'Unknown'}`, 'neutral')
      : null,
    sortable(ops.scanDate, `Scan recorded by ${ops.scannedByName ?? 'Unknown'}`, undefined, 'good'),
    sortable(ops.returnedAt, `Returned — ${ops.returnHandledByName ?? 'Unknown'}`, ops.returnMethod ? prettyEnum(ops.returnMethod) : undefined, 'info'),
    sortable(ops.discardedAt, `Discarded — ${ops.discardedByName ?? 'Unknown'}`, ops.discardReason ? prettyEnum(ops.discardReason) : undefined, 'critical'),
  ];
  return events.filter((e): e is JourneyEvent => e !== null).sort((a, b) => a.time - b.time);
}

function Timeline({ events }: { events: JourneyEvent[] }) {
  if (events.length === 0) return <QuietRow>No journey events yet.</QuietRow>;
  return (
    <ol className="relative flex flex-col m-0 p-0 list-none">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative pl-7 pb-5 last:pb-0 min-w-0">
          {i < events.length - 1 ? (
            <span aria-hidden className="absolute left-[7px] top-5 bottom-0 w-px bg-line-soft" />
          ) : null}
          <span aria-hidden className={`absolute left-[3px] top-[5px] w-2 h-2 rounded-full ${severityMark[e.severity]}`} />
          <span className="block text-[11px] text-ink-3">{dateTime12(e.at)}</span>
          <span className="block mt-0.5 text-[13.5px] font-medium text-ink">{e.label}</span>
          {e.detail ? <span className="block text-[12px] text-ink-2">{e.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------------- people */

type Contact = { name: string; phone: string | null; email: string | null; address: string | null };

function ContactCard({ role, contact }: { role: string; contact: Contact }) {
  return (
    <div className="bg-surface-subtle border border-line-soft rounded-[6px] px-3.5 py-3 flex gap-3 min-w-0">
      <span
        aria-hidden
        className="w-9 h-9 flex-shrink-0 rounded-full bg-strong-bg text-on-strong flex items-center justify-center text-[13px] font-semibold"
      >
        {initials(contact.name)}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">{role}</span>
        <span className="text-[13.5px] font-semibold text-ink break-words">{contact.name}</span>
        {contact.phone ? (
          <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="text-[12.5px] text-ink-2 no-underline hover:underline break-words">
            {contact.phone}
          </a>
        ) : null}
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="text-[12.5px] text-ink-2 no-underline hover:underline break-all">
            {contact.email}
          </a>
        ) : null}
        {contact.address ? <span className="text-[12.5px] text-ink-2 break-words">{contact.address}</span> : null}
      </span>
    </div>
  );
}

function PeopleSection({ lot }: { lot: LotDetail }) {
  return (
      <Panel>
        <PanelHeader title="People" />
        <div className="px-4 md:px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ContactCard role="Owner" contact={lot.owner} />
          {lot.pointsOfContact.map((p, i) => (
            <ContactCard key={`${p.name}-${i}`} role={`Contact ${i + 1}`} contact={p} />
          ))}
          {lot.facilitator ? <ContactCard role="Facilitator" contact={lot.facilitator} /> : null}
          <ContactCard role="Received by" contact={{ name: lot.receiver.name, phone: null, email: null, address: null }} />
        </div>
      </Panel>
  );
}

/* ------------------------------------------------------------ full record */

function FullRecordSection({ lot, originLabel }: { lot: LotDetail; originLabel: string | null }) {
  return (
      <Panel>
        <PanelHeader title="Full record" />
        <div className="px-4 md:px-5 py-4 flex flex-col">
          <GroupBlock first>
            <GroupLabel>Receipt</GroupLabel>
            <RecordRow>
              <Definition label="Date received">{date(lot.dateReceived)}</Definition>
              <Definition label="Origin">{originLabel ?? dash}</Definition>
              <Definition label="Received by">{lot.receiver.name}</Definition>
              <Definition label="Stage since">{dateTime12(lot.stageEnteredAt)}</Definition>
            </RecordRow>
          </GroupBlock>

          <GroupBlock>
            <GroupLabel>Media</GroupLabel>
            <RecordRow>
              <Definition label="Format"><span className="capitalize">{lot.format}</span></Definition>
              <Definition label="Data type"><span className="capitalize">{lot.dataType}</span></Definition>
              <Definition label="Sub-type">{lot.mediaSubtypeLabel}</Definition>
              <Definition label="Quantity">{num(lot.quantity)}</Definition>
            </RecordRow>
            <RecordRow>
              <Definition label="To digitize">{num(lot.quantityToDigitize)}</Definition>
              <Definition label="Already digitized">{num(lot.quantityAlreadyDigitized)}</Definition>
              <Definition label="Items (total / selected)">
                {num(lot.itemCounts.total)} / {num(lot.itemCounts.selected)}
              </Definition>
              <Definition label="Digitized / tagged">
                {num(lot.itemCounts.digitized)} / {num(lot.itemCounts.tagged)}
              </Definition>
            </RecordRow>
            {lot.quantityRemarks ? (
              <RecordRow>
                <Definition label="Quantity remarks" className="col-span-2 md:col-span-4">
                  {lot.quantityRemarks}
                </Definition>
              </RecordRow>
            ) : null}
          </GroupBlock>

          <GroupBlock>
            <GroupLabel>Photo content</GroupLabel>
            <RecordRow>
              <Definition label="Photo date">{lot.photoDate ?? dash}</Definition>
              <Definition label="Photo location">{lot.photoLocation ?? dash}</Definition>
              <Definition label="Photo event">{lot.photoEvent ?? dash}</Definition>
            </RecordRow>
            <RecordRow>
              <Definition label="People in photo" className="col-span-2 md:col-span-4">{lot.peopleInPhoto ?? dash}</Definition>
            </RecordRow>
          </GroupBlock>

          <GroupBlock>
            <GroupLabel>Rights</GroupLabel>
            <RecordRow>
              <Definition label="Rights type">{lot.rights.typeLabel ?? dash}</Definition>
              <Definition label="Deed reference">{lot.rights.deedReference ?? dash}</Definition>
            </RecordRow>
            <RecordRow>
              <Definition label="Rights notes" className="col-span-2 md:col-span-4">
                {lot.rights.notes ?? dash}
              </Definition>
            </RecordRow>
          </GroupBlock>

          <GroupBlock>
            <GroupLabel>Decision detail</GroupLabel>
            <RecordRow>
              <Definition label="Status"><span className="capitalize">{lot.decisionDetail.status}</span></Definition>
              <Definition label="Verdict">{lot.decisionDetail.verdict ? prettyEnum(lot.decisionDetail.verdict) : dash}</Definition>
              <Definition label="Decided by">{lot.decisionDetail.decidedByName ?? dash}</Definition>
              <Definition label="Decided at">{lot.decisionDetail.decidedAt ? dateTime12(lot.decisionDetail.decidedAt) : dash}</Definition>
            </RecordRow>
            <RecordRow>
              <Definition label="Exists in MLS"><YesNoChip value={lot.decisionDetail.existsInMls} /></Definition>
              <Definition label="This copy better"><YesNoChip value={lot.decisionDetail.newCopyIsBetter} /></Definition>
              <Definition label="Condition usable"><YesNoChip value={lot.decisionDetail.conditionUsable} /></Definition>
              <Definition label="Condition issue">{lot.decisionDetail.conditionIssue ?? dash}</Definition>
            </RecordRow>
            {lot.decisionDetail.significanceFlags ? (
              <RecordRow>
                <Definition label="Significance" className="col-span-2 md:col-span-4">
                  {lot.decisionDetail.significanceFlags.map((f, i) => (
                    <span key={i} className="mr-1.5">Q{i + 1}: {f ? 'yes' : 'no'}</span>
                  ))}
                </Definition>
              </RecordRow>
            ) : null}
            {lot.decisionDetail.notes ? (
              <RecordRow>
                <Definition label="Decision notes" className="col-span-2 md:col-span-4">
                  {lot.decisionDetail.notes}
                </Definition>
              </RecordRow>
            ) : null}
          </GroupBlock>
        </div>
      </Panel>
  );
}

/* ----------------------------------------------------------------- skeleton */

function LotDetailSkeleton() {
  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <header className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-2/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-6 w-full" />
      </header>
      <div className="flex gap-0.5 border-b border-line-soft">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-20" />
      </div>
      {[0, 1, 2].map((i) => (
        <Panel key={i}>
          <PanelHeader title="Loading" />
          <div className="p-3 md:p-4 flex flex-col gap-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export function LotDetail({ lotId }: { lotId: string }) {
  return (
    <Suspense fallback={<LotDetailSkeleton />}>
      <LotDetailInner lotId={lotId} />
    </Suspense>
  );
}

function LotDetailInner({ lotId }: { lotId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const { tab, setTab } = useUrlTab(TAB_IDS, 'overview');
  const originList = useReferenceList('originSource');
  const stageList = useReferenceList('stage');
  const canEdit = me.data ? me.data.grants.includes('lot:edit') : false;
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state (initialised when entering edit mode)
  const [originSource, setOriginSource] = useState('');
  const [owner, setOwner] = useState<ContactRow>({ ...EMPTY_CONTACT, id: 'owner' });
  const [pocs, setPocs] = useState<ContactRow[]>([]);
  /** `null` = no facilitator; `id` is always `'fac'` (single row). */
  const [facilitator, setFacilitator] = useState<ContactRow | null>(null);
  const editRowN = useRef(0);
  const newEditRowId = () => `e${editRowN.current++}`;
  const [mediaSubtype, setMediaSubtype] = useState('');
  const [quantityToDigitize, setQuantityToDigitize] = useState('');
  const [quantityRemarks, setQuantityRemarks] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [conditionPhotoUrl, setConditionPhotoUrl] = useState('');
  const [reasonForSending, setReasonForSending] = useState('');
  const [senderRemarks, setSenderRemarks] = useState('');
  const [rightsType, setRightsType] = useState('');
  const [deedReference, setDeedReference] = useState('');
  const [rightsNotes, setRightsNotes] = useState('');

  const detail = useQuery({
    queryKey: queryKeys.lots.detail(lotId),
    queryFn: () => lotsApi.detail(lotId),
  });

  const patch = useMutation({
    mutationFn: (body: LotPatchBody) => lotsApi.patch(lotId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lots.detail(lotId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      setEditing(false);
      setFormError(null);
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.status === 409) {
        setFormError('Someone else changed this lot. Latest version loaded — review and save again.');
        detail.refetch();
      } else {
        setFormError(e instanceof ApiRequestError ? e.message : 'Could not save changes.');
      }
    },
  });

  const lot = detail.data?.lot ?? null;

  if (detail.isLoading) {
    return <LotDetailSkeleton />;
  }

  if (detail.isError || !lot) {
    return (
      <Panel>
        <ErrorState
          message="Couldn't load this lot."
          hint="It may have been removed, or the link is wrong."
          onRetry={() => detail.refetch()}
        />
      </Panel>
    );
  }

  const startEdit = () => {
    setOriginSource(lot.originSource ?? '');
    setOwner({ ...contactToInput(lot.owner), id: 'owner' });
    editRowN.current = 0;
    setPocs(lot.pointsOfContact.map((p) => ({ ...contactToInput(p), id: newEditRowId() })));
    setFacilitator(lot.facilitator ? { ...contactToInput(lot.facilitator), id: 'fac' } : null);
    setMediaSubtype(lot.mediaSubtype);
    setQuantityToDigitize(String(lot.quantityToDigitize));
    setQuantityRemarks(lot.quantityRemarks ?? '');
    setConditionNotes(lot.conditionNotes ?? '');
    setConditionPhotoUrl(lot.conditionPhotoUrl ?? '');
    setReasonForSending(lot.reasonForSending ?? '');
    setSenderRemarks(lot.senderRemarks ?? '');
    setRightsType(lot.rights.type ?? '');
    setDeedReference(lot.rights.deedReference ?? '');
    setRightsNotes(lot.rights.notes ?? '');
    setFormError(null);
    setEditing(true);
  };

  const save = () => {
    setFormError(null);
    if (!owner.name.trim()) return setFormError('Owner name is required.');
    if (!mediaSubtype.trim()) return setFormError('Media sub-type is required.');
    const qtd = Number(quantityToDigitize);
    if (!Number.isInteger(qtd) || qtd < 0) return setFormError('Quantity to digitize must be 0 or more.');
    if (!conditionPhotoUrl.trim()) return setFormError('A condition photo reference is required.');
    for (const [i, p] of pocs.entries()) {
      if (!p.name.trim()) return setFormError(`Point of contact ${i + 1} needs a name.`);
    }
    if (facilitator && !facilitator.name.trim()) {
      return setFormError('Facilitator name is required once a facilitator is added.');
    }

    const body: Record<string, unknown> = { version: lot.version };
    if ((lot.originSource ?? '') !== originSource && originSource) body.originSource = originSource;
    const cleanOwner = cleanContact(owner);
    if (!sameContact(contactToInput(lot.owner), owner)) body.owner = cleanOwner;
    const cleanPocs = pocs.map(cleanContact);
    if (JSON.stringify(lot.pointsOfContact.map(contactToInput).map(cleanContact)) !== JSON.stringify(cleanPocs)) {
      body.pointsOfContact = cleanPocs;
    }
    const initialFac = lot.facilitator ? contactToInput(lot.facilitator) : null;
    if (JSON.stringify(initialFac ? cleanContact(initialFac) : null) !== JSON.stringify(facilitator ? cleanContact(facilitator) : null)) {
      body.facilitator = facilitator ? cleanContact(facilitator) : null;
    }
    if (lot.mediaSubtype !== mediaSubtype.trim()) body.mediaSubtype = mediaSubtype.trim();
    if (lot.quantityToDigitize !== qtd) body.quantityToDigitize = qtd;
    if ((lot.quantityRemarks ?? '') !== quantityRemarks.trim()) body.quantityRemarks = quantityRemarks.trim() || null;
    if ((lot.conditionNotes ?? '') !== conditionNotes.trim()) body.conditionNotes = conditionNotes.trim() || null;
    if ((lot.conditionPhotoUrl ?? '') !== conditionPhotoUrl.trim()) body.conditionPhotoUrl = conditionPhotoUrl.trim();
    if ((lot.reasonForSending ?? '') !== reasonForSending.trim()) body.reasonForSending = reasonForSending.trim() || null;
    if ((lot.senderRemarks ?? '') !== senderRemarks.trim()) body.senderRemarks = senderRemarks.trim() || null;
    const rights = {
      ...(rightsType.trim() ? { type: rightsType.trim() } : {}),
      ...(deedReference.trim() ? { deedReference: deedReference.trim() } : {}),
      ...(rightsNotes.trim() ? { notes: rightsNotes.trim() } : {}),
    };
    const initialRights = {
      ...(lot.rights.type ? { type: lot.rights.type } : {}),
      ...(lot.rights.deedReference ? { deedReference: lot.rights.deedReference } : {}),
      ...(lot.rights.notes ? { notes: lot.rights.notes } : {}),
    };
    if (JSON.stringify(rights) !== JSON.stringify(initialRights)) {
      body.rights = Object.keys(rights).length > 0 ? rights : null;
    }

    if (Object.keys(body).length === 1) {
      setFormError('No changes to save.');
      return;
    }
    patch.mutate(body as unknown as LotPatchBody);
  };

  const onChanged = () => {
    detail.refetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
  };

  const stageLabel =
    stageList.data?.items.find((i) => i.value === lot.stage)?.label ??
    STAGE_LABELS[lot.stage as keyof typeof STAGE_LABELS] ??
    lot.stage;
  const originLabel = lot.originSource
    ? (originList.data?.items.find((o) => o.value === lot.originSource)?.label ?? lot.originSource)
    : null;

  const provenance = [
    `${num(lot.quantity)} × ${lot.mediaSubtypeLabel}`,
    originLabel,
    `Received ${date(lot.dateReceived)} · ${lot.receiver.name}`,
    lot.namingCode ? `Naming code ${lot.namingCode}` : 'Naming code issued at decision',
    `Record v${lot.version}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

  const updatePoc = (id: string, patch: Partial<ContactRow>) =>
    setPocs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const updateFac = (id: string, patch: Partial<ContactRow>) =>
    setFacilitator((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  const updateOwner = (_id: string, patch: Partial<ContactRow>) =>
    setOwner((prev) => ({ ...prev, ...patch }));
  const ownerColumns = makeContactColumns(updateOwner);
  const pocColumns = makeContactColumns(updatePoc);
  const facColumns = makeContactColumns(updateFac);

  if (editing) {
    return (
      <div className="flex flex-col gap-3.5 md:gap-4">
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setFormError(null);
          }}
          aria-label="Go back"
          className="m-0 inline-flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          <IconChevronLeft size={14} />
          Back to record
        </button>
        <FormError message={formError} />
        <Panel>
          <PanelHeader title="Edit intake record" />
          <div className="p-3 md:p-4 flex flex-col gap-5">
            <StepBlocks>
              <FormSection legend="Media &amp; origin">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Origin source">
                    <RefSelect
                      listKey="originSource"
                      value={originSource}
                      onChange={setOriginSource}
                      placeholder="Choose…"
                      createLabel="origin"
                    />
                  </Field>
                  <Field label="Media sub-type">
                    <SubtypeField format={lot.format} value={mediaSubtype} onChange={setMediaSubtype} />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                legend="Owner"
                description="Legal owner of the originals — the person, family or trust the media belongs to."
              >
                <EditableTable
                  columns={ownerColumns}
                  rows={[owner]}
                  getRowId={(o) => o.id}
                  onChange={(next) => setOwner(next[0] ?? owner)}
                  minRows={1}
                  maxRows={1}
                  allowDelete={false}
                  rowName={() => 'Owner'}
                  emptyMessage="Owner is required."
                />
              </FormSection>

              <FormSection
                legend={`Points of contact ${pocs.length > 0 ? `(${pocs.length})` : ''}`}
              >
                <EditableTable
                  columns={pocColumns}
                  rows={pocs}
                  getRowId={(p) => p.id}
                  onChange={setPocs}
                  createRow={() => ({ ...EMPTY_CONTACT, id: newEditRowId() })}
                  cloneRow={(p) => ({ ...p, id: newEditRowId() })}
                  minRows={0}
                  maxRows={5}
                  addLabel="Add contact"
                  rowName={(i) => `Contact ${i + 1}`}
                  emptyMessage="No points of contact yet."
                />
              </FormSection>

              <FormSection legend="Facilitator">
                <EditableTable
                  columns={facColumns}
                  rows={facilitator ? [facilitator] : []}
                  getRowId={(f) => f.id}
                  onChange={(next) => setFacilitator(next[0] ?? null)}
                  createRow={() => ({ ...EMPTY_CONTACT, id: 'fac' })}
                  minRows={0}
                  maxRows={1}
                  addLabel="Add facilitator"
                  rowName={() => 'Facilitator'}
                  emptyMessage="No facilitator added."
                />
              </FormSection>

              <FormSection legend="Condition &amp; quantities">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Quantity to digitize">
                    <TextInput
                      inputMode="numeric"
                      value={quantityToDigitize}
                      onChange={(e) => setQuantityToDigitize(e.target.value)}
                    />
                  </Field>
                  <Field label="Condition photo">
                    <TextInput
                      value={conditionPhotoUrl}
                      onChange={(e) => setConditionPhotoUrl(e.target.value)}
                    />
                  </Field>
                  <Field label="Quantity remarks">
                    <Textarea value={quantityRemarks} onChange={(e) => setQuantityRemarks(e.target.value)} />
                  </Field>
                  <Field label="Condition notes">
                    <Textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} />
                  </Field>
                  <Field label="Reason for sending">
                    <Textarea value={reasonForSending} onChange={(e) => setReasonForSending(e.target.value)} />
                  </Field>
                  <Field label="Sender remarks">
                    <Textarea value={senderRemarks} onChange={(e) => setSenderRemarks(e.target.value)} />
                  </Field>
                </div>
              </FormSection>

              <FormSection legend="Rights">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Rights type">
                    <RightsTypeField value={rightsType} onChange={setRightsType} />
                  </Field>
                  <Field label="Deed reference">
                    <TextInput value={deedReference} onChange={(e) => setDeedReference(e.target.value)} />
                  </Field>
                  <Field label="Rights notes">
                    <TextInput value={rightsNotes} onChange={(e) => setRightsNotes(e.target.value)} />
                  </Field>
                </div>
              </FormSection>

              <div className="flex items-center gap-2">
                <PrimaryButton disabled={patch.isPending} onClick={save}>
                  {patch.isPending ? 'Saving…' : 'Save changes'}
                </PrimaryButton>
                <GhostButton
                  disabled={patch.isPending}
                  onClick={() => {
                    setEditing(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </GhostButton>
              </div>
            </StepBlocks>
          </div>
        </Panel>
      </div>
    );
  }

  const tabs = TAB_IDS.map((id) => ({
    id,
    label: id === 'items' ? `Items (${num(lot.itemCounts.total)})` : TAB_LABELS[id],
  }));

  return (
    <div className="flex flex-col gap-3.5 md:gap-4">
      <header className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="m-0 inline-flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          <IconChevronLeft size={14} />
          Back
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="m-0 font-display text-[26px] md:text-[32px] font-semibold tracking-[-0.01em] leading-tight text-ink">
              {lot.lotReference}
            </h1>
            <p className="m-0 text-[12.5px] leading-relaxed text-ink-3">{provenance}</p>
          </div>
          <div className="sm:ml-auto flex items-center gap-2 flex-shrink-0">
            <Badge severity={STAGE_SEVERITY[lot.stage] ?? 'neutral'}>{stageLabel}</Badge>
            <Badge severity={DECISION_SEVERITY[lot.decision] ?? 'neutral'}>
              <span className="capitalize">{lot.decision}</span>
            </Badge>
            {canEdit ? <GhostButton onClick={startEdit}>Edit</GhostButton> : null}
          </div>
        </div>
        <Stepper stage={lot.stage} />
      </header>

      <FormError message={formError} />

      <Tabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="Lot record sections" />

      <TabPanel id="overview" active={tab === 'overview'}>
        <MaterialSection lot={lot} />
        <MediaLinesPanel lot={lot} />
        <ConditionSection lot={lot} />
        <ProgressSection lot={lot} />
        <JourneyPanel lot={lot} stageLabel={stageLabel} />
        <PeopleSection lot={lot} />
      </TabPanel>

      <TabPanel id="workflow" active={tab === 'workflow'}>
        <nav
          aria-label="Workflow sections"
          className="sticky top-0 z-10 -my-1 py-2 bg-surface/95 backdrop-blur flex gap-1.5 overflow-x-auto"
        >
          {WORKFLOW_JUMPS.map((j) => (
            <a
              key={j.id}
              href={`#${j.id}`}
              className="flex-shrink-0 h-8 px-3 rounded-full bg-surface-sunken border border-line text-[12.5px] font-medium text-ink-2 no-underline flex items-center hover:text-ink hover:border-line-strong"
            >
              {j.label}
            </a>
          ))}
        </nav>
        <div id="wf-decision" className="scroll-mt-16">
          <DecisionSection lot={lot} onChanged={onChanged} />
        </div>
        <div id="wf-scan" className="scroll-mt-16">
          <ScanSection lot={lot} onChanged={onChanged} />
        </div>
        <div id="wf-tag" className="scroll-mt-16">
          <MlsSection lot={lot} onChanged={onChanged} />
        </div>
        <div id="wf-return" className="scroll-mt-16">
          <ReturnSection lot={lot} onChanged={onChanged} />
        </div>
        <div id="wf-discard" className="scroll-mt-16">
          <DiscardSection lot={lot} onChanged={onChanged} />
        </div>
        <FilePathSection lot={lot} onChanged={onChanged} />
      </TabPanel>

      <TabPanel id="record" active={tab === 'record'}>
        <FullRecordSection lot={lot} originLabel={originLabel} />
      </TabPanel>

      <TabPanel id="items" active={tab === 'items'}>
        <ItemsPanel lotId={lot.id} />
      </TabPanel>

      <TabPanel id="activity" active={tab === 'activity'}>
        <ActivityPanel lotId={lot.id} />
      </TabPanel>
    </div>
  );
}
