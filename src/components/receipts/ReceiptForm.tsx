import { useMemo, useState } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import type { Guest, NextReceiptInfo, Receipt, ReceiptPayload } from '../../lib/api';
import {
  RECEIPT_CONCEPT_LABELS,
  RECEIPT_MAX_LENGTH,
  buildConcept,
  buildReservationDetail,
  conceptAmount,
  formatReceiptAmount,
  type ReceiptConceptKind,
} from '../../lib/receipts';
import { todayISO } from '../../lib/reservations';
import { Field } from './Field';
import { inputClass } from './inputClass';
import ReceiptPreview from './ReceiptPreview';
import { groupReservations, receiptLabel, reservationOptionLabel, toNumber } from './utils';

/** Todos los valores del formulario son strings (así se evita NaN con los inputs vacíos) */
interface FormValues {
  number: string;
  receiptDate: string;
  amount: string;
  guestName: string;
  concept: string;
  detail: string;
  holderName: string;
  holderPhone: string;
  holderAddress: string;
}

/** El formulario devuelve esto cuando el servidor rechaza el número por estar repetido */
export interface ReceiptSubmitFailure {
  field: 'number';
  message: string;
}

interface Props {
  /** Recibo que se edita; null para uno nuevo */
  editing: Receipt | null;
  /** Próximo número y datos del hospedaje recordados (null si no se pudo consultar) */
  next: NextReceiptInfo | null;
  guests: Guest[];
  guestsLoading: boolean;
  guestsError: string | null;
  /** Reserva desde la que se abrió el formulario (botón "Generar recibo" de la reserva) */
  initialGuest: Guest | null;
  saving: boolean;
  /** Error del servidor al guardar (se muestra sobre los botones) */
  error: string | null;
  onSubmit: (payload: ReceiptPayload) => Promise<ReceiptSubmitFailure | void>;
  onCancel: () => void;
}

const CONCEPT_KINDS: ReceiptConceptKind[] = ['deposit', 'balance', 'total'];

/** Seña por defecto; si la reserva no tiene seña, el total */
const defaultKind = (guest: Guest): ReceiptConceptKind => (guest.deposit_ars > 0 ? 'deposit' : 'total');

/** Valores que se completan al elegir una reserva y un concepto */
const conceptValues = (guest: Guest, kind: ReceiptConceptKind) => ({
  concept: buildConcept(kind, guest.cabin_number),
  amount: String(conceptAmount(kind, guest)),
});

const guestValues = (guest: Guest) => ({
  guestName: guest.guest_name?.trim() || '',
  detail: buildReservationDetail(guest),
  ...conceptValues(guest, defaultKind(guest)),
});

function initialValues(editing: Receipt | null, next: NextReceiptInfo | null, guest: Guest | null): FormValues {
  if (editing) {
    return {
      number: String(editing.number),
      receiptDate: editing.receipt_date.slice(0, 10),
      amount: String(editing.amount_ars),
      guestName: editing.guest_name || '',
      concept: editing.concept || '',
      detail: editing.detail || '',
      holderName: editing.holder_name || '',
      holderPhone: editing.holder_phone || '',
      holderAddress: editing.holder_address || '',
    };
  }
  const base: FormValues = {
    number: next ? String(next.number) : '',
    receiptDate: todayISO(),
    amount: '',
    guestName: '',
    concept: '',
    detail: '',
    holderName: next?.holder?.holder_name || '',
    holderPhone: next?.holder?.holder_phone || '',
    holderAddress: next?.holder?.holder_address || '',
  };
  return guest ? { ...base, ...guestValues(guest) } : base;
}

function buildPayload(values: FormValues, guestId: string): ReceiptPayload {
  const number = toNumber(values.number);
  return {
    ...(Number.isFinite(number) ? { number } : {}),
    receipt_date: values.receiptDate,
    guest_name: values.guestName.trim(),
    amount_ars: Math.round(Number(values.amount) * 100) / 100,
    concept: values.concept.trim(),
    detail: values.detail.trim(),
    holder_name: values.holderName.trim(),
    holder_phone: values.holderPhone.trim(),
    holder_address: values.holderAddress.trim(),
    guest_id: guestId,
  };
}

/** Vista previa que se actualiza con cada tecla; vive aparte para no volver a dibujar todo el formulario */
function LivePreview({ control }: { control: Control<FormValues> }) {
  const values = useWatch({ control });
  const number = toNumber(values.number ?? '');
  const amount = toNumber(values.amount ?? '');
  return (
    <ReceiptPreview
      data={{
        number: Number.isInteger(number) && number >= 1 ? number : null,
        date: values.receiptDate ?? '',
        amount: Number.isFinite(amount) ? amount : null,
        guestName: values.guestName ?? '',
        concept: values.concept ?? '',
        detail: values.detail ?? '',
        holderName: values.holderName ?? '',
        holderPhone: values.holderPhone ?? '',
        holderAddress: values.holderAddress ?? '',
      }}
    />
  );
}

export default function ReceiptForm({
  editing,
  next,
  guests,
  guestsLoading,
  guestsError,
  initialGuest,
  saving,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: initialValues(editing, next, initialGuest), mode: 'onTouched' });

  const [guestId, setGuestId] = useState(editing?.guest_id ?? initialGuest?.id ?? '');
  const [numberValue, conceptValue] = useWatch({ control, name: ['number', 'concept'] });

  const { current, past } = useMemo(() => groupReservations(guests, todayISO()), [guests]);
  const selectedGuest =
    (guestId ? guests.find((guest) => guest.id === guestId) : undefined) ??
    (initialGuest && initialGuest.id === guestId ? initialGuest : null);
  const listedGuestId = guests.some((guest) => guest.id === guestId) ? guestId : '';

  const fill = (values: Partial<FormValues>) => {
    for (const [name, value] of Object.entries(values)) {
      setValue(name as keyof FormValues, value, { shouldDirty: true, shouldValidate: true });
    }
  };

  const pickGuest = (id: string) => {
    setGuestId(id);
    const guest = guests.find((g) => g.id === id);
    if (guest) fill(guestValues(guest));
  };

  const pickConcept = (kind: ReceiptConceptKind) => {
    if (selectedGuest) fill(conceptValues(selectedGuest, kind));
  };

  const numberError = errors.number;
  const numberNow = toNumber(numberValue);
  const validNumber = Number.isInteger(numberNow) && numberNow >= 1;
  const suggestedNumber =
    numberError?.type === 'server' && next && String(next.number) !== numberValue.trim() ? next.number : null;

  const useSuggestedNumber = () => {
    if (suggestedNumber === null) return;
    setValue('number', String(suggestedNumber), { shouldDirty: true });
    clearErrors('number');
  };

  const submit = handleSubmit(async (values) => {
    const failure = await onSubmit(buildPayload(values, guestId));
    if (failure?.field === 'number') {
      setError('number', { type: 'server', message: failure.message }, { shouldFocus: true });
    }
  });

  const field = (name: keyof FormValues) => ({
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `rec-${name}-error` : undefined,
  });

  const heading = editing ? `Editar recibo ${receiptLabel(editing.number)}` : 'Nuevo recibo';
  const numberRequired = Boolean(editing || next);

  return (
    <div className="mb-8 rounded-lg bg-gray-50 p-4 sm:p-6">
      <h3 className="mb-4 text-lg font-semibold">{heading}</h3>
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <label htmlFor="rec-guestId" className="block text-sm font-medium text-gray-700">
                Completar desde una reserva
              </label>
              <select
                id="rec-guestId"
                value={listedGuestId}
                onChange={(e) => pickGuest(e.target.value)}
                className={inputClass(false)}
              >
                <option value="">
                  {guestsLoading ? 'Cargando reservas…' : guests.length ? 'Elegí una reserva…' : 'No hay reservas cargadas'}
                </option>
                {current.length > 0 && (
                  <optgroup label="Próximas y en curso">
                    {current.map((guest) => (
                      <option key={guest.id} value={guest.id}>
                        {reservationOptionLabel(guest)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {past.length > 0 && (
                  <optgroup label="Finalizadas">
                    {past.map((guest) => (
                      <option key={guest.id} value={guest.id}>
                        {reservationOptionLabel(guest)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {guestsError && <p className="mt-1 text-xs text-red-600">{guestsError}</p>}
            </div>

            <div>
              <p className="text-xs text-gray-500">
                {selectedGuest
                  ? 'Qué se cobra (completa el concepto y el monto):'
                  : 'Elegí una reserva para completar huésped, detalle, concepto y monto.'}
              </p>
              <div role="group" aria-label="Qué se cobra" className="mt-2 grid grid-cols-3 gap-2">
                {CONCEPT_KINDS.map((kind) => {
                  const amount = selectedGuest ? conceptAmount(kind, selectedGuest) : null;
                  const unavailable = amount !== null && !(amount > 0);
                  const active =
                    selectedGuest !== null && conceptValue === buildConcept(kind, selectedGuest.cabin_number);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => pickConcept(kind)}
                      disabled={!selectedGuest || unavailable}
                      aria-pressed={active}
                      title={unavailable ? `Sin ${RECEIPT_CONCEPT_LABELS[kind].toLowerCase()} en esta reserva` : undefined}
                      className={`flex flex-col items-center justify-center rounded-md border px-2 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span>{RECEIPT_CONCEPT_LABELS[kind]}</span>
                      <span className="text-xs font-normal tabular-nums text-gray-500">
                        {amount !== null ? formatReceiptAmount(amount) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="rec-number"
              label="N° de recibo"
              error={numberError?.message}
              errorAction={
                suggestedNumber !== null && (
                  <button
                    type="button"
                    onClick={useSuggestedNumber}
                    className="font-medium text-indigo-600 underline hover:text-indigo-800"
                  >
                    Usar {receiptLabel(suggestedNumber)}
                  </button>
                )
              }
              hint={
                <p className="mt-1 text-xs text-gray-500">
                  {validNumber
                    ? `Se imprime como ${receiptLabel(numberNow)}.`
                    : numberRequired
                      ? 'Número entero, desde 1.'
                      : 'Si lo dejás vacío, se asigna el próximo.'}
                </p>
              }
            >
              <input
                id="rec-number"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                {...register('number', {
                  required: numberRequired ? 'Ingresá el número de recibo.' : false,
                  validate: (value) =>
                    value.trim() === '' ||
                    (Number.isInteger(Number(value)) && Number(value) >= 1) ||
                    'Ingresá un número entero mayor o igual a 1.',
                  onChange: () => clearErrors('number'),
                })}
                {...field('number')}
                className={inputClass(Boolean(numberError))}
              />
            </Field>

            <Field id="rec-receiptDate" label="Fecha" error={errors.receiptDate?.message}>
              <input
                id="rec-receiptDate"
                type="date"
                {...register('receiptDate', { required: 'Ingresá la fecha del recibo.' })}
                {...field('receiptDate')}
                className={inputClass(Boolean(errors.receiptDate))}
              />
            </Field>

            <Field id="rec-amount" label="Monto (ARS)" error={errors.amount?.message}>
              <input
                id="rec-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                {...register('amount', {
                  required: 'Ingresá el monto.',
                  validate: (value) => Number(value) > 0 || 'El monto tiene que ser mayor a 0.',
                })}
                {...field('amount')}
                className={inputClass(Boolean(errors.amount))}
              />
            </Field>

            <Field id="rec-guestName" label="Huésped" error={errors.guestName?.message}>
              <input
                id="rec-guestName"
                maxLength={RECEIPT_MAX_LENGTH.line}
                type="text"
                autoComplete="off"
                {...register('guestName', { validate: (value) => value.trim() !== '' || 'Ingresá el nombre del huésped.' })}
                {...field('guestName')}
                className={inputClass(Boolean(errors.guestName))}
              />
            </Field>

            <Field id="rec-concept" label="Concepto" error={errors.concept?.message} className="sm:col-span-2">
              <input
                id="rec-concept"
                maxLength={RECEIPT_MAX_LENGTH.line}
                type="text"
                autoComplete="off"
                {...register('concept', { validate: (value) => value.trim() !== '' || 'Ingresá el concepto.' })}
                {...field('concept')}
                className={inputClass(Boolean(errors.concept))}
              />
            </Field>

            <Field id="rec-detail" label="Detalle de reserva" className="sm:col-span-2">
              <textarea
                id="rec-detail"
                rows={3}
                maxLength={RECEIPT_MAX_LENGTH.detail}
                {...register('detail')}
                className={inputClass(false)}
              />
            </Field>
          </div>

          <fieldset className="space-y-4">
            <div className="border-b border-dotted border-gray-400 pb-1">
              <legend className="text-sm font-semibold text-gray-900">Datos del hospedaje</legend>
              <p className="text-xs text-gray-500">Se recuerdan para el próximo recibo.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="rec-holderName" label="Titular" className="sm:col-span-2">
                <input
                  id="rec-holderName"
                maxLength={RECEIPT_MAX_LENGTH.line}
                  type="text"
                  autoComplete="off"
                  {...register('holderName')}
                  className={inputClass(false)}
                />
              </Field>
              <Field id="rec-holderPhone" label="Teléfono">
                <input
                  id="rec-holderPhone"
                maxLength={RECEIPT_MAX_LENGTH.line}
                  type="tel"
                  autoComplete="off"
                  {...register('holderPhone')}
                  className={inputClass(false)}
                />
              </Field>
              <Field id="rec-holderAddress" label="Dirección">
                <input
                  id="rec-holderAddress"
                maxLength={RECEIPT_MAX_LENGTH.line}
                  type="text"
                  autoComplete="off"
                  {...register('holderAddress')}
                  className={inputClass(false)}
                />
              </Field>
            </div>
          </fieldset>
        </div>

        {/* Escritorio: a la derecha y fija al desplazarse; celular: debajo de los campos y antes del botón */}
        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Vista previa">
          <div className="lg:sticky lg:top-20">
            <p className="mb-2 text-sm font-medium text-gray-700">Vista previa</p>
            <LivePreview control={control} />
          </div>
        </aside>

        <div className="space-y-4 lg:col-start-1 lg:row-start-2">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Generar recibo'}
            </button>
          </div>
          {editing && (
            <p className="text-right text-xs text-gray-500">
              Al guardar se vuelve a generar el PDF del recibo {receiptLabel(editing.number)}.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
