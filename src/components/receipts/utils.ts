import { format, isValid, parseISO } from 'date-fns';
import type { Guest, Receipt } from '../../lib/api';
import { formatReceiptNumber } from '../../lib/receipts';
import { getReservationStatus } from '../../lib/reservations';

/** Número de un campo de texto; NaN si está vacío (evita que '' valga 0) */
export const toNumber = (value: string): number => (value.trim() === '' ? NaN : Number(value));

/** "N° 0053" */
export const receiptLabel = (n: number): string => `N° ${formatReceiptNumber(n)}`;

const day = (iso: string, pattern: string): string => {
  const date = parseISO(iso.slice(0, 10));
  return isValid(date) ? format(date, pattern) : iso;
};

/** "Cabaña 1 · Victor · 27/02 → 02/03/2026" (el año de la entrada sólo si difiere del de la salida) */
export function reservationOptionLabel(guest: Guest): string {
  const name = guest.guest_name?.trim() || '—';
  const sameYear = guest.check_in_date.slice(0, 4) === guest.check_out_date.slice(0, 4);
  const from = day(guest.check_in_date, sameYear ? 'dd/MM' : 'dd/MM/yyyy');
  return `Cabaña ${guest.cabin_number} · ${name} · ${from} → ${day(guest.check_out_date, 'dd/MM/yyyy')}`;
}

/**
 * Reservas para el selector: primero las en curso y próximas (la más cercana arriba),
 * después las finalizadas (la más reciente arriba).
 */
export function groupReservations(guests: Guest[], today: string): { current: Guest[]; past: Guest[] } {
  const current: Guest[] = [];
  const past: Guest[] = [];
  for (const guest of guests) {
    (getReservationStatus(guest, today) === 'past' ? past : current).push(guest);
  }
  current.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date) || a.cabin_number - b.cabin_number);
  past.sort((a, b) => b.check_in_date.localeCompare(a.check_in_date) || a.cabin_number - b.cabin_number);
  return { current, past };
}

/** Clave para reutilizar un PDF ya generado mientras el recibo no cambie */
export const pdfKey = (r: Receipt): string =>
  JSON.stringify([
    r.id, r.number, r.receipt_date, r.guest_name, r.amount_ars, r.concept, r.detail,
    r.holder_name, r.holder_phone, r.holder_address,
  ]);
