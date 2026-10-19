import { useEffect, useRef, type ReactNode } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { useForm, useWatch } from 'react-hook-form';
import type { Guest, GuestPayload, ReservationSource } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { CABINS, RESERVATION_SOURCES } from '../../lib/reservations';
import { rateFromRecord, toUSD, useExchangeRate, type ExchangeRateStatus } from '../../lib/useExchangeRate';
import { countNights } from './utils';

/** Todos los valores del formulario son strings (así se evita NaN con los inputs vacíos) */
interface FormValues {
  guestName: string;
  source: ReservationSource;
  phoneNumber: string;
  cabinNumber: string;
  checkInDate: string;
  checkOutDate: string;
  numGuests: string;
  totalAmountARS: string;
  depositARS: string;
  exchangeRate: string;
  comments: string;
}

interface Props {
  /** Reserva que se edita; null para una nueva */
  editing: Guest | null;
  saving: boolean;
  /** Error del servidor al guardar (se muestra sobre los botones) */
  error: string | null;
  onSubmit: (payload: GuestPayload) => Promise<void>;
  onCancel: () => void;
}

const toNumber = (value: string): number => (value.trim() === '' ? NaN : Number(value));

/** Tipo de cambio con el que se guardó la reserva (el de hoy no sirve: distorsiona el USD histórico) */
const recordRateOf = (guest: Guest | null): number | null =>
  guest ? rateFromRecord(guest.exchange_rate, guest.total_amount_ars, guest.total_amount_usd) : null;

function initialValues(editing: Guest | null, rate: number | null): FormValues {
  if (editing) {
    const savedRate = recordRateOf(editing) ?? rate;
    return {
      guestName: editing.guest_name || '',
      source: editing.source || '',
      phoneNumber: editing.phone_number || '',
      cabinNumber: String(editing.cabin_number),
      checkInDate: editing.check_in_date.slice(0, 10),
      checkOutDate: editing.check_out_date.slice(0, 10),
      numGuests: String(editing.num_guests),
      totalAmountARS: String(editing.total_amount_ars),
      depositARS: String(editing.deposit_ars),
      exchangeRate: savedRate !== null ? String(savedRate) : '',
      comments: editing.comments || '',
    };
  }
  return {
    guestName: '',
    source: 'Directo',
    phoneNumber: '',
    cabinNumber: String(CABINS[0]),
    checkInDate: '',
    checkOutDate: '',
    numGuests: '',
    totalAmountARS: '',
    depositARS: '0',
    exchangeRate: rate !== null ? String(rate) : '',
    comments: '',
  };
}

function buildPayload(values: FormValues, editing: Guest | null): GuestPayload {
  const rate = Number(values.exchangeRate);
  const total = Number(values.totalAmountARS);
  const deposit = Number(values.depositARS);

  // Si no cambió ni el tipo de cambio ni el monto, se conserva el USD guardado (evita corrimientos de centavos
  // en reservas viejas cuyo tipo de cambio se dedujo de sus montos)
  const sameRate = editing !== null && recordRateOf(editing) === rate;
  const usd = (ars: number, originalArs: number | undefined, originalUsd: number | undefined) =>
    sameRate && originalArs === ars && originalUsd !== undefined ? originalUsd : toUSD(ars, rate);

  return {
    guest_name: values.guestName.trim(),
    source: values.source,
    exchange_rate: rate,
    check_in_date: values.checkInDate,
    check_out_date: values.checkOutDate,
    num_guests: Number(values.numGuests),
    num_nights: countNights(values.checkInDate, values.checkOutDate) ?? 0,
    phone_number: values.phoneNumber.trim(),
    total_amount_usd: usd(total, editing?.total_amount_ars, editing?.total_amount_usd),
    total_amount_ars: total,
    deposit_usd: usd(deposit, editing?.deposit_ars, editing?.deposit_usd),
    deposit_ars: deposit,
    cabin_number: Number(values.cabinNumber),
    comments: values.comments,
  };
}

const inputClass = (invalid: boolean) =>
  `mt-1 block w-full rounded-md shadow-sm ${
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
  }`;

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

function Field({ id, label, error, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <div id={`${id}-hint`}>{hint}</div>
      )}
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function Amount({ ars, rate }: { ars: number; rate: number | null }) {
  if (!Number.isFinite(ars)) return <span className="text-gray-400">—</span>;
  return (
    <>
      <div className="font-medium tabular-nums">ARS {formatMoney(ars)}</div>
      <div className="text-xs text-gray-500 tabular-nums">
        {rate !== null ? `≈ USD ${formatMoney(toUSD(ars, rate))}` : 'USD: falta el tipo de cambio'}
      </div>
    </>
  );
}

function formatFetchedAt(fetchedAt: string | null): string | null {
  if (!fetchedAt) return null;
  const date = parseISO(fetchedAt);
  return isValid(date) ? format(date, 'dd/MM HH:mm') : null;
}

export default function ReservationForm({ editing, saving, error, onSubmit, onCancel }: Props) {
  const { rate, status, fetchedAt } = useExchangeRate();
  const recordRate = recordRateOf(editing);
  const rateTouched = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: initialValues(editing, rate), mode: 'onTouched' });

  // Mientras el usuario no toque el campo, sigue a la cotización del hook (que puede llegar después de abrir el
  // formulario). Al editar una reserva con cotización guardada se respeta esa y no se pisa nunca.
  const followLiveRate = recordRate === null;
  useEffect(() => {
    if (followLiveRate && rate !== null && !rateTouched.current) {
      setValue('exchangeRate', String(rate));
    }
  }, [followLiveRate, rate, setValue]);

  const [checkIn, checkOut, total, deposit, rateValue] = useWatch({
    control,
    name: ['checkInDate', 'checkOutDate', 'totalAmountARS', 'depositARS', 'exchangeRate'],
  });

  const nights = countNights(checkIn, checkOut);
  const rateNumber = toNumber(rateValue);
  const effectiveRate = Number.isFinite(rateNumber) && rateNumber > 0 ? rateNumber : null;
  const totalNumber = toNumber(total);
  const depositNumber = toNumber(deposit);
  const balanceNumber = totalNumber - depositNumber; // NaN si falta alguno

  const useCurrentRate = () => {
    if (rate === null) return;
    rateTouched.current = true;
    setValue('exchangeRate', String(rate), { shouldDirty: true, shouldValidate: true });
  };

  const recordRateInferred = editing !== null && !(editing.exchange_rate > 0);
  const hint = rateHint({ rateValue: rateNumber, recordRate, recordRateInferred, rate, status, fetchedAt });
  // Cotización actual que se puede aplicar con un clic (cuando el campo tiene otro valor)
  const offeredRate = rate !== null && status !== 'loading' && rateNumber !== rate ? rate : null;

  const submit = handleSubmit(async (values) => {
    await onSubmit(buildPayload(values, editing));
  });

  const field = (name: keyof FormValues) => ({
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `res-${name}-error` : undefined,
  });

  return (
    <div className="mb-8 rounded-lg bg-gray-50 p-4 sm:p-6">
      <h3 className="mb-4 text-lg font-semibold">{editing ? 'Editar reserva' : 'Nueva reserva'}</h3>
      <form onSubmit={submit} noValidate className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field id="res-cabinNumber" label="Cabaña">
            <select id="res-cabinNumber" {...register('cabinNumber', { required: true })} className={inputClass(false)}>
              {CABINS.map((cabin) => (
                <option key={cabin} value={cabin}>
                  Cabaña {cabin}
                </option>
              ))}
            </select>
          </Field>

          <Field id="res-guestName" label="Nombre del huésped (opcional)">
            <input
              id="res-guestName"
              type="text"
              autoComplete="off"
              {...register('guestName')}
              className={inputClass(false)}
            />
          </Field>

          <Field id="res-source" label="Canal">
            <select id="res-source" {...register('source')} className={inputClass(false)}>
              {editing && !editing.source && <option value="">Sin especificar</option>}
              {RESERVATION_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </Field>

          <Field id="res-checkInDate" label="Fecha de entrada" error={errors.checkInDate?.message}>
            <input
              id="res-checkInDate"
              type="date"
              {...register('checkInDate', {
                required: 'Ingresá la fecha de entrada.',
                onChange: () => {
                  if (getValues('checkOutDate')) void trigger('checkOutDate');
                },
              })}
              {...field('checkInDate')}
              className={inputClass(Boolean(errors.checkInDate))}
            />
          </Field>

          <Field id="res-checkOutDate" label="Fecha de salida" error={errors.checkOutDate?.message}>
            <input
              id="res-checkOutDate"
              type="date"
              min={checkIn || undefined}
              {...register('checkOutDate', {
                required: 'Ingresá la fecha de salida.',
                validate: (value, all) =>
                  !all.checkInDate || value > all.checkInDate || 'La salida debe ser posterior a la entrada.',
              })}
              {...field('checkOutDate')}
              className={inputClass(Boolean(errors.checkOutDate))}
            />
          </Field>

          <Field id="res-numGuests" label="Número de huéspedes" error={errors.numGuests?.message}>
            <input
              id="res-numGuests"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              {...register('numGuests', {
                required: 'Ingresá la cantidad de huéspedes.',
                validate: (value) => {
                  const n = Number(value);
                  return (Number.isInteger(n) && n >= 1) || 'Tiene que haber al menos 1 huésped.';
                },
              })}
              {...field('numGuests')}
              className={inputClass(Boolean(errors.numGuests))}
            />
          </Field>

          <Field id="res-phoneNumber" label="Teléfono (opcional)">
            <input
              id="res-phoneNumber"
              type="tel"
              autoComplete="off"
              {...register('phoneNumber')}
              className={inputClass(false)}
            />
          </Field>

          <Field id="res-totalAmountARS" label="Monto total (ARS)" error={errors.totalAmountARS?.message}>
            <input
              id="res-totalAmountARS"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              {...register('totalAmountARS', {
                required: 'Ingresá el monto total.',
                validate: (value) => Number(value) >= 0 || 'El monto no puede ser negativo.',
                onChange: () => {
                  if (getValues('depositARS') !== '') void trigger('depositARS');
                },
              })}
              {...field('totalAmountARS')}
              className={inputClass(Boolean(errors.totalAmountARS))}
            />
          </Field>

          <Field id="res-depositARS" label="Seña (ARS)" error={errors.depositARS?.message}>
            <input
              id="res-depositARS"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              {...register('depositARS', {
                required: 'Ingresá la seña (si no hay, poné 0).',
                validate: (value, all) => {
                  const amount = Number(value);
                  if (amount < 0) return 'El monto no puede ser negativo.';
                  const totalAmount = toNumber(all.totalAmountARS);
                  if (Number.isFinite(totalAmount) && amount > totalAmount) {
                    return 'La seña no puede ser mayor al total.';
                  }
                  return true;
                },
              })}
              {...field('depositARS')}
              className={inputClass(Boolean(errors.depositARS))}
            />
          </Field>

          <Field
            id="res-exchangeRate"
            label="Tipo de cambio (ARS por USD)"
            error={errors.exchangeRate?.message}
            hint={
              <p className={`mt-1 text-xs ${hint.warning ? 'text-amber-700' : 'text-gray-500'}`}>
                {hint.text}
                {offeredRate !== null && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={useCurrentRate}
                      className="font-medium text-indigo-600 underline hover:text-indigo-800"
                    >
                      Usar {formatMoney(offeredRate)}
                    </button>
                  </>
                )}
              </p>
            }
          >
            <input
              id="res-exchangeRate"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              {...register('exchangeRate', {
                required: 'Ingresá el tipo de cambio.',
                validate: (value) => Number(value) > 0 || 'El tipo de cambio tiene que ser mayor a 0.',
                onChange: () => {
                  rateTouched.current = true;
                },
              })}
              {...field('exchangeRate')}
              aria-describedby={errors.exchangeRate ? 'res-exchangeRate-error' : 'res-exchangeRate-hint'}
              className={inputClass(Boolean(errors.exchangeRate))}
            />
          </Field>

          <Field id="res-comments" label="Comentarios" className="md:col-span-2 lg:col-span-3">
            <textarea id="res-comments" rows={3} {...register('comments')} className={inputClass(false)} />
          </Field>
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-4">
          <SummaryItem label="Noches">
            <span className="font-medium tabular-nums">{nights ?? '—'}</span>
          </SummaryItem>
          <SummaryItem label="Total">
            <Amount ars={totalNumber} rate={effectiveRate} />
          </SummaryItem>
          <SummaryItem label="Seña">
            <Amount ars={depositNumber} rate={effectiveRate} />
          </SummaryItem>
          <SummaryItem label="Saldo">
            <Amount ars={balanceNumber} rate={effectiveRate} />
          </SummaryItem>
        </dl>

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
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar reserva'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface RateHintInput {
  /** Valor actual del campo (NaN si está vacío) */
  rateValue: number;
  /** Cotización con la que se guardó la reserva que se edita */
  recordRate: number | null;
  /** La reserva no tenía cotización guardada: recordRate se estimó a partir de sus montos */
  recordRateInferred: boolean;
  /** Cotización del hook (en vivo o la última guardada) */
  rate: number | null;
  status: ExchangeRateStatus;
  fetchedAt: string | null;
}

/** Texto bajo el campo de tipo de cambio según de dónde salió el valor que muestra */
function rateHint({ rateValue, recordRate, recordRateInferred, rate, status, fetchedAt }: RateHintInput): {
  text: string;
  warning: boolean;
} {
  if (recordRate !== null && rateValue === recordRate) {
    if (recordRateInferred) return { text: 'Cotización estimada a partir de los montos guardados.', warning: false };
    return { text: 'Cotización con la que se guardó esta reserva.', warning: false };
  }
  if (rate !== null && rateValue === rate) {
    if (status === 'live') return { text: 'Dólar oficial de hoy.', warning: false };
    if (status === 'cached') {
      const when = formatFetchedAt(fetchedAt);
      return {
        text: `Última cotización guardada${when ? ` del ${when}` : ''} — no se pudo actualizar.`,
        warning: true,
      };
    }
    return { text: 'Actualizando cotización…', warning: false };
  }
  if (rate === null) {
    if (status === 'unavailable') {
      return { text: 'No se pudo obtener la cotización: ingresala a mano.', warning: true };
    }
    if (status === 'loading') return { text: 'Obteniendo cotización…', warning: false };
  }
  return { text: 'Cotización ingresada a mano.', warning: false };
}
