'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotContactInput, LotDetailResponse, LotPatchBody } from '@/types/lot';
import { ORIGIN_LABELS, STAGE_LABELS } from '@/lib/domain';
import type { Severity } from '@/types/dashboard';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { Badge, ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';
import { ContactFields, EMPTY_CONTACT, RightsTypeField, SubtypeField } from './lot-form-fields';
import { DecisionSection } from './DecisionSection';
import { ScanSection } from './ScanSection';
import { MlsSection } from './MlsSection';
import { ReturnSection } from './ReturnSection';
import { DiscardSection } from './DiscardSection';
import { ItemsPanel } from './ItemsPanel';
import { ActivityPanel } from './ActivityPanel';

type LotDetail = LotDetailResponse['lot'];

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

function Definition({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</span>
      <span className="text-[13px] text-ink break-words">{children}</span>
    </div>
  );
}

const dash = <span className="text-ink-4">—</span>;

export function LotDetail({ lotId }: { lotId: string }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const canEdit = me.data ? me.data.grants.includes('lot:edit') : false;
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state (initialised when entering edit mode)
  const [originSource, setOriginSource] = useState('');
  const [owner, setOwner] = useState<LotContactInput>({ ...EMPTY_CONTACT });
  const [pocs, setPocs] = useState<LotContactInput[]>([]);
  const [facilitator, setFacilitator] = useState<LotContactInput | null>(null);
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

  if (detail.isLoading) {
    return (
      <Panel>
        <PanelHeader title="Lot record" />
        <div className="p-3 md:p-4 flex flex-col gap-2">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Panel>
    );
  }

  if (detail.isError || !detail.data) {
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

  const lot = detail.data.lot;

  const startEdit = () => {
    setOriginSource(lot.originSource ?? '');
    setOwner(contactToInput(lot.owner));
    setPocs(lot.pointsOfContact.map(contactToInput));
    setFacilitator(lot.facilitator ? contactToInput(lot.facilitator) : null);
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

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="m-0 text-[18px] sm:text-[22px] font-semibold tracking-[-0.022em] text-ink">
            {lot.lotReference}
          </h1>
          <p className="m-0 text-[12.5px] text-ink-3">
            {lot.namingCode ? `Naming code ${lot.namingCode} · ` : 'Naming code issued at decision · '}
            Record version {lot.version}
          </p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <Badge severity={STAGE_SEVERITY[lot.stage] ?? 'neutral'}>
            {STAGE_LABELS[lot.stage as keyof typeof STAGE_LABELS] ?? lot.stage}
          </Badge>
          <Badge severity={DECISION_SEVERITY[lot.decision] ?? 'neutral'}>
            <span className="capitalize">{lot.decision}</span>
          </Badge>
          {canEdit && !editing ? <GhostButton onClick={startEdit}>Edit</GhostButton> : null}
        </div>
      </div>

      <FormError message={formError} />

      {!editing ? (
        <>
          <Panel>
            <PanelHeader title="Receipt" />
            <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Definition label="Date received">{lot.dateReceived.slice(0, 10)}</Definition>
              <Definition label="Origin">{lot.originSource ? ORIGIN_LABELS[lot.originSource as keyof typeof ORIGIN_LABELS] ?? lot.originSource : dash}</Definition>
              <Definition label="Received by">{lot.receiver.name}</Definition>
              <Definition label="Stage since">{lot.stageEnteredAt.slice(0, 10)}</Definition>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Owner & contacts" />
            <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <Definition label="Owner">
                {lot.owner.name}
                {lot.owner.phone ? <><br />{lot.owner.phone}</> : null}
                {lot.owner.email ? <><br />{lot.owner.email}</> : null}
                {lot.owner.address ? <><br />{lot.owner.address}</> : null}
              </Definition>
              <Definition label={`Points of contact (${lot.pointsOfContact.length})`}>
                {lot.pointsOfContact.length > 0 ? lot.pointsOfContact.map((p) => p.name).join(', ') : dash}
              </Definition>
              <Definition label="Facilitator">{lot.facilitator ? lot.facilitator.name : dash}</Definition>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Media & quantities" />
            <div className="p-3 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Definition label="Format"><span className="capitalize">{lot.format}</span></Definition>
              <Definition label="Data type"><span className="capitalize">{lot.dataType}</span></Definition>
              <Definition label="Sub-type">{lot.mediaSubtypeLabel}</Definition>
              <Definition label="Quantity">{lot.quantity}</Definition>
              <Definition label="To digitize">{lot.quantityToDigitize}</Definition>
              <Definition label="Already digitized">{lot.quantityAlreadyDigitized}</Definition>
              <Definition label="Items (total / selected)">{lot.itemCounts.total} / {lot.itemCounts.selected}</Definition>
              <Definition label="Digitized / tagged">{lot.itemCounts.digitized} / {lot.itemCounts.tagged}</Definition>
            </div>
            {lot.quantityRemarks ? (
              <div className="px-3 md:px-4 pb-3 md:pb-4">
                <Definition label="Quantity remarks">{lot.quantityRemarks}</Definition>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader title="Condition & sender" />
            <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Definition label="Condition notes">{lot.conditionNotes ?? dash}</Definition>
              <Definition label="Condition photo">{lot.conditionPhotoUrl ?? dash}</Definition>
              <Definition label="Reason for sending">{lot.reasonForSending ?? dash}</Definition>
              <Definition label="Sender remarks">{lot.senderRemarks ?? dash}</Definition>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Rights" />
            <div className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Definition label="Rights type">{lot.rights.typeLabel ?? dash}</Definition>
              <Definition label="Deed reference">{lot.rights.deedReference ?? dash}</Definition>
              <Definition label="Rights notes">{lot.rights.notes ?? dash}</Definition>
            </div>
          </Panel>

          <DecisionSection
            lot={lot}
            onChanged={() => {
              detail.refetch();
              queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
            }}
          />
          <ScanSection
            lot={lot}
            onChanged={() => {
              detail.refetch();
              queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
            }}
          />
          <MlsSection
            lot={lot}
            onChanged={() => {
              detail.refetch();
              queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
            }}
          />
          <ReturnSection
            lot={lot}
            onChanged={() => {
              detail.refetch();
              queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
            }}
          />
          <DiscardSection
            lot={lot}
            onChanged={() => {
              detail.refetch();
              queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
              queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
            }}
          />
          <ItemsPanel lotId={lot.id} />
          <ActivityPanel lotId={lot.id} />
        </>
      ) : (
        <Panel>
          <PanelHeader title="Edit intake record" />
          <div className="p-3 md:p-4 flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Origin source">
                <Select value={originSource} onChange={(e) => setOriginSource(e.target.value)}>
                  {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {v} — {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Media sub-type">
                <SubtypeField format={lot.format} value={mediaSubtype} onChange={setMediaSubtype} />
              </Field>
            </div>

            <ContactFields legend="Owner" value={owner} onChange={setOwner} />

            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className="px-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                Points of contact {pocs.length > 0 ? `(${pocs.length})` : ''}
              </legend>
              <div className="flex flex-col gap-4">
                {pocs.map((p, i) => (
                  <div key={i} className="border border-line-soft rounded-[6px] p-3 flex flex-col gap-3">
                    <ContactFields
                      legend={`Contact ${i + 1}`}
                      value={p}
                      onChange={(next) => setPocs(pocs.map((old, j) => (j === i ? next : old)))}
                    />
                    <div>
                      <GhostButton onClick={() => setPocs(pocs.filter((_, j) => j !== i))}>
                        Remove contact
                      </GhostButton>
                    </div>
                  </div>
                ))}
                {pocs.length < 5 ? (
                  <div>
                    <GhostButton onClick={() => setPocs([...pocs, { ...EMPTY_CONTACT }])}>
                      Add contact
                    </GhostButton>
                  </div>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className="px-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                Facilitator
              </legend>
              {facilitator === null ? (
                <GhostButton onClick={() => setFacilitator({ ...EMPTY_CONTACT })}>
                  Add facilitator
                </GhostButton>
              ) : (
                <div className="border border-line-soft rounded-[6px] p-3 flex flex-col gap-3">
                  <ContactFields legend="Facilitator" value={facilitator} onChange={setFacilitator} />
                  <div>
                    <GhostButton onClick={() => setFacilitator(null)}>Remove facilitator</GhostButton>
                  </div>
                </div>
              )}
            </fieldset>

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

            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className="px-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                Rights
              </legend>
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
            </fieldset>

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
          </div>
        </Panel>
      )}
    </div>
  );
}
