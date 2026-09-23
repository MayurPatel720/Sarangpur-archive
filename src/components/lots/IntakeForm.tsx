'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, lotsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { LotCreateBody, LotContactInput } from '@/types/lot';
import {
  DATA_TYPES,
  FORMATS,
  NOT_DIGITIZED_REASONS,
  NOT_DIGITIZED_REASON_LABELS,
  ORIGIN_LABELS,
  ORIGIN_SOURCES,
} from '@/lib/domain';
import { date, dmyToIso, todayDmy } from '@/lib/format';
import {
  Field,
  FormError,
  GhostButton,
  PrimaryButton,
  Select,
  Textarea,
  TextInput,
} from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';
import { ContactFields, EMPTY_CONTACT, RightsTypeField, SubtypeField } from './lot-form-fields';
import { Stepper } from './Stepper';

function cleanContact(c: LotContactInput): LotContactInput {
  const out: LotContactInput = { name: c.name.trim() };
  if (c.phone?.trim()) out.phone = c.phone.trim();
  if (c.email?.trim()) out.email = c.email.trim();
  if (c.address?.trim()) out.address = c.address.trim();
  return out;
}

const STEPS = [
  { label: 'Origin & contacts' },
  { label: 'Media & quantities' },
  { label: 'Condition & notes' },
  { label: 'Rights & review' },
] as const;

type FieldErrors = Partial<Record<string, string>>;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-1.5 border-b border-line-soft last:border-b-0">
      <span className="text-[12px] font-semibold text-ink-3">{label}</span>
      <span className="text-[13px] text-ink break-words">{value || '—'}</span>
    </div>
  );
}

function SummarySection({
  title,
  stepIndex,
  onEdit,
  children,
}: {
  title: string;
  stepIndex: number;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line-soft rounded-[6px] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12px] font-semibold text-accent bg-transparent border-0 p-0 cursor-pointer"
        >
          Edit
          <span className="sr-only"> {title} (step {stepIndex + 1})</span>
        </button>
      </div>
      {children}
    </section>
  );
}

export function IntakeForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const can = me.data ? me.data.grants.includes('lot:create') : false;

  const [step, setStep] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [dateReceived, setDateReceived] = useState(todayDmy());
  const [originSource, setOriginSource] = useState('');
  const [owner, setOwner] = useState<LotContactInput>({ ...EMPTY_CONTACT });
  const [pocs, setPocs] = useState<LotContactInput[]>([]);
  const [hasFacilitator, setHasFacilitator] = useState(false);
  const [facilitator, setFacilitator] = useState<LotContactInput>({ ...EMPTY_CONTACT });
  const [format, setFormat] = useState<string>('photo');
  const [dataType, setDataType] = useState<string>('physical');
  const [mediaSubtype, setMediaSubtype] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quantityToDigitize, setQuantityToDigitize] = useState('0');
  const [quantityAlreadyDigitized, setQuantityAlreadyDigitized] = useState('0');
  const [notDigitizedReason, setNotDigitizedReason] = useState('');
  const [quantityRemarks, setQuantityRemarks] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [conditionPhotoUrl, setConditionPhotoUrl] = useState('');
  const [reasonForSending, setReasonForSending] = useState('');
  const [senderRemarks, setSenderRemarks] = useState('');
  const [rightsType, setRightsType] = useState('');
  const [deedReference, setDeedReference] = useState('');
  const [rightsNotes, setRightsNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: LotCreateBody) => lotsApi.create(body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      router.push(`/register/${res.id}`);
    },
    onError: (e) => {
      setFormError(e instanceof ApiRequestError ? e.message : 'Could not register this lot.');
    },
  });

  if (me.isLoading) {
    return (
      <Panel>
        <PanelHeader title="New intake" />
        <div className="p-3 md:p-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      </Panel>
    );
  }

  if (!can) {
    return (
      <Panel>
        <ErrorState
          message="You don't have access to register lots."
          hint="Ask an admin for the lot:create permission."
        />
      </Panel>
    );
  }

  const err = (key: string, message: string): false => {
    setFieldErrors({ [key]: message });
    setFormError(null);
    return false;
  };

  const clearErrors = () => setFieldErrors({});

  const validateStep = (index: number): boolean => {
    clearErrors();
    setFormError(null);
    if (index === 0) {
      if (!dateReceived.trim()) return err('dateReceived', 'Date received is required.');
      if (!dmyToIso(dateReceived)) {
        return err('dateReceived', 'Date received must be dd/mm/yyyy (e.g. 23/09/2026).');
      }
      if (!originSource) return err('originSource', 'Origin source is required.');
      if (!owner.name.trim()) return err('owner.name', 'Owner name is required.');
      for (const [i, p] of pocs.entries()) {
        if (!p.name.trim()) return err(`poc.${i}`, `Point of contact ${i + 1} needs a name.`);
      }
      if (hasFacilitator && !facilitator.name.trim()) {
        return err('facilitator.name', 'Facilitator name is required once a facilitator is added.');
      }
      return true;
    }
    if (index === 1) {
      if (!mediaSubtype.trim()) return err('mediaSubtype', 'Media sub-type is required.');
      const q = Number(quantity);
      if (!Number.isInteger(q) || q < 1) {
        return err('quantity', 'Quantity must be a whole number of at least 1.');
      }
      const qtd = Number(quantityToDigitize) || 0;
      const qad = Number(quantityAlreadyDigitized) || 0;
      if (qtd > q) return err('quantityToDigitize', 'To digitize cannot exceed quantity.');
      if (qad > q) return err('quantityAlreadyDigitized', 'Already digitized cannot exceed quantity.');
      return true;
    }
    if (index === 2) {
      if (!conditionPhotoUrl.trim()) {
        return err('conditionPhotoUrl', 'A condition photo reference is required.');
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    clearErrors();
    setFormError(null);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpTo = (index: number) => {
    if (index >= step) return;
    clearErrors();
    setFormError(null);
    setStep(index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = () => {
    setFormError(null);
    clearErrors();
    // Full pre-check mirrors the per-step gates, so a jump-to-review path can never skip them.
    if (!dateReceived.trim()) return err('dateReceived', 'Date received is required.');
    const dateReceivedIso = dmyToIso(dateReceived);
    if (!dateReceivedIso) {
      return err('dateReceived', 'Date received must be dd/mm/yyyy (e.g. 23/09/2026).');
    }
    if (!originSource) return err('originSource', 'Origin source is required.');
    if (!owner.name.trim()) return err('owner.name', 'Owner name is required.');
    if (!mediaSubtype.trim()) return err('mediaSubtype', 'Media sub-type is required.');
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) {
      return err('quantity', 'Quantity must be a whole number of at least 1.');
    }
    if (!conditionPhotoUrl.trim()) {
      return err('conditionPhotoUrl', 'A condition photo reference is required.');
    }
    for (const [i, p] of pocs.entries()) {
      if (!p.name.trim()) return err(`poc.${i}`, `Point of contact ${i + 1} needs a name.`);
    }
    if (hasFacilitator && !facilitator.name.trim()) {
      return err('facilitator.name', 'Facilitator name is required once a facilitator is added.');
    }

    const body: LotCreateBody = {
      dateReceived: new Date(`${dateReceivedIso}T00:00:00`).toISOString(),
      originSource: originSource as LotCreateBody['originSource'],
      owner: cleanContact(owner),
      pointsOfContact: pocs.map(cleanContact),
      ...(hasFacilitator ? { facilitator: cleanContact(facilitator) } : {}),
      format: format as LotCreateBody['format'],
      dataType: dataType as LotCreateBody['dataType'],
      mediaSubtype: mediaSubtype.trim(),
      quantity: q,
      quantityToDigitize: Number(quantityToDigitize) || 0,
      quantityAlreadyDigitized: Number(quantityAlreadyDigitized) || 0,
      ...(notDigitizedReason
        ? { notDigitizedReason: notDigitizedReason as LotCreateBody['notDigitizedReason'] }
        : {}),
      ...(quantityRemarks.trim() ? { quantityRemarks: quantityRemarks.trim() } : {}),
      ...(conditionNotes.trim() ? { conditionNotes: conditionNotes.trim() } : {}),
      conditionPhotoUrl: conditionPhotoUrl.trim(),
      ...(reasonForSending.trim() ? { reasonForSending: reasonForSending.trim() } : {}),
      ...(senderRemarks.trim() ? { senderRemarks: senderRemarks.trim() } : {}),
      ...(rightsType.trim() || deedReference.trim() || rightsNotes.trim()
        ? {
            rights: {
              ...(rightsType.trim() ? { type: rightsType.trim() } : {}),
              ...(deedReference.trim() ? { deedReference: deedReference.trim() } : {}),
              ...(rightsNotes.trim() ? { notes: rightsNotes.trim() } : {}),
            },
          }
        : {}),
    };
    create.mutate(body);
  };

  const originLabel = originSource
    ? `${originSource} — ${ORIGIN_LABELS[originSource as keyof typeof ORIGIN_LABELS] ?? ''}`
    : '';
  const formatLabel = format.charAt(0).toUpperCase() + format.slice(1);
  const dataTypeLabel = dataType.charAt(0).toUpperCase() + dataType.slice(1);
  const notDigLabel = notDigitizedReason
    ? NOT_DIGITIZED_REASON_LABELS[notDigitizedReason as keyof typeof NOT_DIGITIZED_REASON_LABELS] ??
      notDigitizedReason
    : '';
  const contactLine = (c: LotContactInput) =>
    [c.name, c.phone, c.email, c.address].filter(Boolean).join(' · ');

  return (
    <Panel>
      <PanelHeader title="New intake" />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <Stepper steps={STEPS} current={step} onJump={jumpTo} />

        <FormError message={formError} />

        {/* ------------------------------------------------------ step 0 */}
        {step === 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Date received" error={fieldErrors.dateReceived}>
                <TextInput
                  value={dateReceived}
                  onChange={(e) => setDateReceived(e.target.value)}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-describedby="date-received-hint"
                />
                <span id="date-received-hint" className="sr-only">
                  Format dd/mm/yyyy
                </span>
              </Field>
              <Field label="Origin source" error={fieldErrors.originSource}>
                <Select value={originSource} onChange={(e) => setOriginSource(e.target.value)}>
                  <option value="">Select origin…</option>
                  {ORIGIN_SOURCES.map((o) => (
                    <option key={o} value={o}>
                      {o} — {ORIGIN_LABELS[o]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <ContactFields legend="Owner" value={owner} onChange={setOwner} />
              {fieldErrors['owner.name'] ? (
                <span role="alert" className="text-[11.5px] font-medium text-danger">
                  {fieldErrors['owner.name']}
                </span>
              ) : null}
            </div>

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
                    {fieldErrors[`poc.${i}`] ? (
                      <span role="alert" className="text-[11.5px] font-medium text-danger">
                        {fieldErrors[`poc.${i}`]}
                      </span>
                    ) : null}
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
              {!hasFacilitator ? (
                <GhostButton onClick={() => setHasFacilitator(true)}>Add facilitator</GhostButton>
              ) : (
                <div className="border border-line-soft rounded-[6px] p-3 flex flex-col gap-3">
                  <ContactFields legend="Facilitator" value={facilitator} onChange={setFacilitator} />
                  {fieldErrors['facilitator.name'] ? (
                    <span role="alert" className="text-[11.5px] font-medium text-danger">
                      {fieldErrors['facilitator.name']}
                    </span>
                  ) : null}
                  <div>
                    <GhostButton
                      onClick={() => {
                        setHasFacilitator(false);
                        setFacilitator({ ...EMPTY_CONTACT });
                      }}
                    >
                      Remove facilitator
                    </GhostButton>
                  </div>
                </div>
              )}
            </fieldset>
          </>
        ) : null}

        {/* ------------------------------------------------------ step 1 */}
        {step === 1 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Format">
                <Select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value);
                    setMediaSubtype('');
                  }}
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data type">
                <Select value={dataType} onChange={(e) => setDataType(e.target.value)}>
                  {DATA_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Media sub-type"
                error={fieldErrors.mediaSubtype}
                hint={
                  format === 'photo' || format === 'video' || format === 'audio'
                    ? 'From the managed vocabulary.'
                    : 'Free text for this format.'
                }
              >
                <SubtypeField format={format} value={mediaSubtype} onChange={setMediaSubtype} />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Quantity" error={fieldErrors.quantity}>
                <TextInput
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 40"
                />
              </Field>
              <Field label="To digitize" error={fieldErrors.quantityToDigitize}>
                <TextInput
                  inputMode="numeric"
                  value={quantityToDigitize}
                  onChange={(e) => setQuantityToDigitize(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Already digitized" error={fieldErrors.quantityAlreadyDigitized}>
                <TextInput
                  inputMode="numeric"
                  value={quantityAlreadyDigitized}
                  onChange={(e) => setQuantityAlreadyDigitized(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Not-digitized reason">
                <Select value={notDigitizedReason} onChange={(e) => setNotDigitizedReason(e.target.value)}>
                  <option value="">None</option>
                  {NOT_DIGITIZED_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {NOT_DIGITIZED_REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Quantity remarks">
              <Textarea
                value={quantityRemarks}
                onChange={(e) => setQuantityRemarks(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </>
        ) : null}

        {/* ------------------------------------------------------ step 2 */}
        {step === 2 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Condition notes">
                <Textarea
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field
                label="Condition photo"
                error={fieldErrors.conditionPhotoUrl}
                hint="A file reference or URL — upload arrives later."
              >
                <TextInput
                  value={conditionPhotoUrl}
                  onChange={(e) => setConditionPhotoUrl(e.target.value)}
                  placeholder="Required"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Reason for sending">
                <Textarea
                  value={reasonForSending}
                  onChange={(e) => setReasonForSending(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Sender remarks">
                <Textarea
                  value={senderRemarks}
                  onChange={(e) => setSenderRemarks(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </>
        ) : null}

        {/* ------------------------------------------------------ step 3 */}
        {step === 3 ? (
          <>
            <fieldset className="m-0 p-0 border-0 min-w-0">
              <legend className="px-0 mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                Rights (optional)
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Rights type">
                  <RightsTypeField value={rightsType} onChange={setRightsType} />
                </Field>
                <Field label="Deed reference">
                  <TextInput
                    value={deedReference}
                    onChange={(e) => setDeedReference(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Rights notes">
                  <TextInput
                    value={rightsNotes}
                    onChange={(e) => setRightsNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <h2 className="m-0 text-[13px] font-semibold text-ink">Review</h2>

              <SummarySection title="Origin & contacts" stepIndex={0} onEdit={() => jumpTo(0)}>
                <SummaryRow label="Date received" value={date(dateReceived)} />
                <SummaryRow label="Origin source" value={originLabel} />
                <SummaryRow label="Owner" value={contactLine(owner)} />
                <SummaryRow
                  label="Points of contact"
                  value={pocs.length ? pocs.map(contactLine).join(' | ') : 'None'}
                />
                <SummaryRow
                  label="Facilitator"
                  value={hasFacilitator ? contactLine(facilitator) : 'None'}
                />
              </SummarySection>

              <SummarySection title="Media & quantities" stepIndex={1} onEdit={() => jumpTo(1)}>
                <SummaryRow label="Format" value={formatLabel} />
                <SummaryRow label="Data type" value={dataTypeLabel} />
                <SummaryRow label="Media sub-type" value={mediaSubtype} />
                <SummaryRow label="Quantity" value={quantity} />
                <SummaryRow
                  label="To digitize"
                  value={quantityToDigitize}
                />
                <SummaryRow label="Already digitized" value={quantityAlreadyDigitized} />
                <SummaryRow label="Not-digitized reason" value={notDigLabel} />
                <SummaryRow label="Quantity remarks" value={quantityRemarks} />
              </SummarySection>

              <SummarySection title="Condition & notes" stepIndex={2} onEdit={() => jumpTo(2)}>
                <SummaryRow label="Condition notes" value={conditionNotes} />
                <SummaryRow label="Condition photo" value={conditionPhotoUrl} />
                <SummaryRow label="Reason for sending" value={reasonForSending} />
                <SummaryRow label="Sender remarks" value={senderRemarks} />
              </SummarySection>
            </div>
          </>
        ) : null}

        {/* ------------------------------------------------------- footer */}
        <div className="flex items-center gap-2 pt-1 border-t border-line-soft">
          {step > 0 ? (
            <GhostButton disabled={create.isPending} onClick={goBack}>
              Back
            </GhostButton>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <GhostButton disabled={create.isPending} onClick={() => router.push('/register')}>
              Cancel
            </GhostButton>
            {step < STEPS.length - 1 ? (
              <PrimaryButton onClick={goNext}>Next</PrimaryButton>
            ) : (
              <PrimaryButton disabled={create.isPending} onClick={submit}>
                {create.isPending ? 'Registering…' : 'Register lot'}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
