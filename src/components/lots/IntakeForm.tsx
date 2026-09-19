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
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { ErrorState, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { useMe } from '@/hooks/useCan';
import { ContactFields, EMPTY_CONTACT, RightsTypeField, SubtypeField } from './lot-form-fields';

function cleanContact(c: LotContactInput): LotContactInput {
  const out: LotContactInput = { name: c.name.trim() };
  if (c.phone?.trim()) out.phone = c.phone.trim();
  if (c.email?.trim()) out.email = c.email.trim();
  if (c.address?.trim()) out.address = c.address.trim();
  return out;
}

function todayInput(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function IntakeForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const can = me.data ? me.data.grants.includes('lot:create') : false;

  const [dateReceived, setDateReceived] = useState(todayInput());
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

  const submit = () => {
    setFormError(null);
    if (!dateReceived) return setFormError('Date received is required.');
    if (!originSource) return setFormError('Origin source is required.');
    if (!owner.name.trim()) return setFormError('Owner name is required.');
    if (!mediaSubtype.trim()) return setFormError('Media sub-type is required.');
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) return setFormError('Quantity must be a whole number of at least 1.');
    if (!conditionPhotoUrl.trim()) return setFormError('A condition photo reference is required.');
    for (const [i, p] of pocs.entries()) {
      if (!p.name.trim()) return setFormError(`Point of contact ${i + 1} needs a name.`);
    }
    if (hasFacilitator && !facilitator.name.trim()) {
      return setFormError('Facilitator name is required once a facilitator is added.');
    }

    const body: LotCreateBody = {
      dateReceived: new Date(`${dateReceived}T00:00:00`).toISOString(),
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
      ...(notDigitizedReason ? { notDigitizedReason: notDigitizedReason as LotCreateBody['notDigitizedReason'] } : {}),
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

  return (
    <Panel>
      <PanelHeader title="New intake" />
      <div className="p-3 md:p-4 flex flex-col gap-5">
        <FormError message={formError} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Date received">
            <TextInput type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} />
          </Field>
          <Field label="Origin source">
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
          {!hasFacilitator ? (
            <GhostButton onClick={() => setHasFacilitator(true)}>Add facilitator</GhostButton>
          ) : (
            <div className="border border-line-soft rounded-[6px] p-3 flex flex-col gap-3">
              <ContactFields legend="Facilitator" value={facilitator} onChange={setFacilitator} />
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
          <Field label="Media sub-type" hint={format === 'photo' || format === 'video' || format === 'audio' ? 'From the managed vocabulary.' : 'Free text for this format.'}>
            <SubtypeField format={format} value={mediaSubtype} onChange={setMediaSubtype} />
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Quantity">
            <TextInput
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 40"
            />
          </Field>
          <Field label="To digitize">
            <TextInput
              inputMode="numeric"
              value={quantityToDigitize}
              onChange={(e) => setQuantityToDigitize(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Already digitized">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Condition notes">
            <Textarea
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Condition photo" hint="A file reference or URL — upload arrives later.">
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

        <div className="flex items-center gap-2">
          <PrimaryButton disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Registering…' : 'Register lot'}
          </PrimaryButton>
          <GhostButton disabled={create.isPending} onClick={() => router.push('/register')}>
            Cancel
          </GhostButton>
        </div>
      </div>
    </Panel>
  );
}
