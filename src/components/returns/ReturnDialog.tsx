'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, returnsApi } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useReferenceList } from '@/hooks/useReferenceList';
import { todayIso } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Field, FormError, GhostButton, PrimaryButton, Select, Textarea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { SHIPPED_METHODS, type ReturnCard } from '@/types/returns';

type Errors = Partial<Record<'name' | 'contact' | 'place' | 'items', string>>;

/**
 * Record a handover for one lot: what is going back, WHO is receiving it (name, phone,
 * email, place — pre-filled from the lot's own contacts), how it is sent, and when. Whole
 * lots are one step; item returns let you tick exactly which items are in this handover.
 */
export function ReturnDialog({ card, onClose }: { card: ReturnCard; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const methods = useReferenceList('returnMethod');

  const ready = card.items.filter((i) => !i.waiting);
  const [picked, setPicked] = useState<string[]>(ready.map((i) => i.id));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [place, setPlace] = useState('');
  const [method, setMethod] = useState('In person');
  const [tracking, setTracking] = useState('');
  const [returnedOn, setReturnedOn] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);

  const shipped = SHIPPED_METHODS.includes(method.toLowerCase());
  const count = card.wholeLot ? card.itemCount : picked.length;

  const useContact = (c: ReturnCard['contacts'][number]) => {
    setName(c.name);
    setPhone(c.phone ?? '');
    setEmail(c.email ?? '');
    setPlace(c.address ?? '');
    setErrors({});
  };

  const save = useMutation({
    mutationFn: () =>
      returnsApi.record({
        lotId: card.lotId,
        scope: card.wholeLot ? 'lot' : 'items',
        ...(card.wholeLot ? {} : { itemIds: picked }),
        recipient: { name: name.trim(), phone: phone.trim(), email: email.trim(), place: place.trim() },
        method: method || undefined,
        trackingReference: tracking.trim() || undefined,
        returnedOn,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.returns.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queues.all });
      toast.success(
        res.lotFinished ? 'Marked returned — lot finished' : `${res.returned} ${res.returned === 1 ? 'item' : 'items'} marked returned`,
        `${res.lotReference} → ${name.trim()}`,
      );
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not record the return.'),
  });

  const submit = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Enter the name of the person receiving it.';
    if (!phone.trim() && !email.trim()) next.contact = 'Add a phone number or an email so the receiver can be reached.';
    if (phone.trim() && !/^[0-9+()\-\s.]{5,40}$/.test(phone.trim())) next.contact = 'Enter a valid phone number.';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.contact = 'That email address is not valid.';
    if (shipped && !place.trim()) next.place = `Add the address — it is being sent by ${method.toLowerCase()}.`;
    if (!card.wholeLot && picked.length === 0) next.items = 'Choose at least one item.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setError(null);
    save.mutate();
  };

  return (
    <Dialog
      title={`Record return · ${card.lotReference}`}
      subtitle={card.wholeLot ? `Whole lot · ${card.itemCount} items` : `${card.items.length} item${card.items.length === 1 ? '' : 's'} waiting to go back`}
      onClose={onClose}
      wide
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!card.wholeLot ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">What is being handed over</h3>
              <button type="button" onClick={() => setPicked(ready.map((i) => i.id))} className="ml-auto bg-transparent border-0 p-0 text-[12px] font-semibold text-accent cursor-pointer min-h-[28px]">
                All
              </button>
              <button type="button" onClick={() => setPicked([])} className="bg-transparent border-0 p-0 text-[12px] font-semibold text-accent cursor-pointer min-h-[28px]">
                None
              </button>
            </div>
            <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
              {card.items.map((it) => (
                <li key={it.id}>
                  <label className={`flex items-start gap-2 rounded-[6px] border border-line-soft px-2.5 py-2 min-h-[44px] ${it.waiting ? 'opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-accent"
                      disabled={it.waiting}
                      checked={picked.includes(it.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, it.id] : p.filter((x) => x !== it.id)))}
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-[12px] font-semibold text-ink truncate">{it.code}</span>
                      <span className="block text-[11.5px] text-ink-3 truncate">
                        {it.name ?? 'Unnamed'}
                        {it.waiting ? ' · digitalize first' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {errors.items ? <p role="alert" className="m-0 text-[12px] text-danger">{errors.items}</p> : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">Who is receiving it</h3>
          {card.contacts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Fill from the lot's contacts">
              {card.contacts.map((c, i) => (
                <button
                  key={`${c.role}-${i}`}
                  type="button"
                  onClick={() => useContact(c)}
                  className="min-h-[34px] px-2.5 rounded-[6px] border border-line bg-surface text-[12px] text-ink-2 cursor-pointer hover:border-accent"
                >
                  Use <span className="font-semibold text-ink">{c.name}</span> <span className="text-ink-3">({c.role})</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" required error={errors.name}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name of the receiver" autoComplete="off" maxLength={120} />
            </Field>
            <Field label="Phone number" error={errors.contact} hint="Phone or email — at least one.">
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 98XXXXXXXX" autoComplete="off" maxLength={40} />
            </Field>
            <Field label="Email">
              <TextInput value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="name@example.com" autoComplete="off" maxLength={160} />
            </Field>
            <Field label={shipped ? 'Address' : 'Place'} required={shipped} error={errors.place} hint={shipped ? 'Where it is being sent.' : 'Town / mandir / address — optional for hand delivery.'}>
              <TextInput value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Sarangpur Mandir, Gujarat" autoComplete="off" maxLength={400} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">How and when</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Return method">
                {(methods.data?.items ?? []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                {!(methods.data?.items ?? []).some((m) => m.value === method) ? <option value={method}>{method}</option> : null}
              </Select>
            </Field>
            <Field label={shipped ? 'Tracking reference' : 'Reference (optional)'}>
              <TextInput value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={shipped ? 'Consignment / AWB no.' : 'Receipt no., if any'} maxLength={120} />
            </Field>
            <Field label="Handed over on">
              <DatePicker value={returnedOn} onChange={setReturnedOn} aria-label="Handed over on (dd/mm/yyyy)" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering — who collected it, condition, ID checked…" maxLength={2000} />
          </Field>
        </section>

        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2.5">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={save.isPending || count === 0}>
            {save.isPending ? 'Saving…' : `Mark ${count} ${count === 1 ? 'item' : 'items'} returned`}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
