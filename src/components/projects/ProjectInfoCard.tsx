import type { ReactNode } from 'react';
import Link from 'next/link';
import { date } from '@/lib/format';
import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import type { ProjectDetailResponse } from '@/types/project';

type Contact = { name: string; phone?: string; email?: string; address?: string };

function Phone({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <a href={`tel:${value.replace(/\s+/g, '')}`} className="text-accent no-underline hover:underline">
      {value}
    </a>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</span>
      <div className="text-[13px] leading-snug text-ink break-words">{children}</div>
    </div>
  );
}

const Missing = () => (
  <span className="flex flex-wrap items-center gap-2">
    <span className="text-ink-3">Not recorded yet</span>
    <Badge severity="warning">Waiting for assignees</Badge>
  </span>
);

function ContactLines({ c }: { c: Contact }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{c.name}</span>
      {c.phone ? <Phone value={c.phone} /> : null}
      {c.email ? (
        <a href={`mailto:${c.email}`} className="text-accent no-underline hover:underline break-all">
          {c.email}
        </a>
      ) : null}
      {c.address ? <span className="text-ink-2">{c.address}</span> : null}
    </div>
  );
}

/**
 * The project's shared intake values as a definition grid. Empty optional sections are
 * hidden; origin source, date received and owner always show, with a warning chip when
 * the assignees still have to fill them in.
 */
export function ProjectInfoCard({
  projectId,
  shared,
  canEdit,
  originLabel,
}: {
  projectId: string;
  shared: ProjectDetailResponse['project']['shared'];
  canEdit: boolean;
  /** Resolves the stored origin-source value to its display label. */
  originLabel: (value: string) => string;
}) {
  const owner = shared.owner;
  const points = shared.pointsOfContact ?? [];
  const people = shared.referencePeople ?? [];
  const rights = shared.rights;
  const hasRights = !!(rights && (rights.type || rights.deedReference || rights.notes));
  const hasReturn = !!(shared.returnRequested || shared.returnFormat || shared.returnDuration || shared.returnDueAt);

  return (
    <Panel>
      <PanelHeader title="Project information">
        {canEdit ? (
          <Link
            href={`/projects/${projectId}/shared`}
            className="ml-auto text-[12.5px] font-medium text-accent no-underline hover:underline"
          >
            Edit shared details
          </Link>
        ) : null}
      </PanelHeader>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
        <Block label="Origin source">
          {shared.originSource ? originLabel(shared.originSource) : <Missing />}
        </Block>
        <Block label="Date received">{shared.dateReceived ? date(shared.dateReceived) : <Missing />}</Block>
        <Block label="Owner">{owner?.name ? <ContactLines c={owner} /> : <Missing />}</Block>

        {points.length > 0 ? (
          <Block label="Points of contact">
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {points.map((c, i) => (
                <li key={`${c.name}-${i}`}>
                  <ContactLines c={c} />
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
        {people.length > 0 ? (
          <Block label="People who know about this">
            <ul className="m-0 p-0 list-none flex flex-col gap-1">
              {people.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span className="font-medium">{p.name}</span> · <Phone value={p.phone} />
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
        {shared.reasonForSending ? <Block label="Reason for sending">{shared.reasonForSending}</Block> : null}
        {shared.conditionNotes ? <Block label="Condition notes">{shared.conditionNotes}</Block> : null}
        {shared.senderRemarks ? <Block label="Sender remarks">{shared.senderRemarks}</Block> : null}
        {hasReturn ? (
          <Block label="Return request">
            <div className="flex flex-col gap-0.5">
              <span>{shared.returnRequested ? 'Return requested' : 'No return requested'}</span>
              {shared.returnFormat && shared.returnFormat !== 'none' ? (
                <span className="text-ink-2 capitalize">Format: {shared.returnFormat.replace(/_/g, ' ')}</span>
              ) : null}
              {shared.returnDuration ? <span className="text-ink-2">Duration: {shared.returnDuration}</span> : null}
              {shared.returnDueAt ? <span className="text-ink-2">Due {date(shared.returnDueAt)}</span> : null}
            </div>
          </Block>
        ) : null}
        {hasRights ? (
          <Block label="Rights">
            <div className="flex flex-col gap-0.5">
              {rights?.type ? <span className="capitalize">{rights.type.replace(/_/g, ' ')}</span> : null}
              {rights?.deedReference ? <span className="text-ink-2">Deed ref: {rights.deedReference}</span> : null}
              {rights?.notes ? <span className="text-ink-2">{rights.notes}</span> : null}
            </div>
          </Block>
        ) : null}
      </div>
    </Panel>
  );
}
