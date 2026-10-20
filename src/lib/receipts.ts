import { format, isValid, parseISO } from 'date-fns';
import type { Guest, Receipt } from './api';
import { formatMoney } from './format';

/** Verde del encabezado y el pie del recibo */
export const RECEIPT_GREEN = '#7e9474';
/** Logo con fondo transparente (public/logo-encantos.png, 470×213 px) */
export const RECEIPT_LOGO_URL = '/logo-encantos.png';
export const RECEIPT_TITLE = 'RECIBO DE RESERVA';
export const RECEIPT_FOOTER = 'Documento no válido como factura';

/** 53 → "0053" */
export const formatReceiptNumber = (n: number): string => String(n).padStart(4, '0');

/** "2026-02-10" → "10/2/2026", como en el recibo en papel */
export function formatReceiptDate(iso: string): string {
  const d = parseISO(iso.slice(0, 10));
  return isValid(d) ? format(d, 'd/M/yyyy') : iso;
}

/** 100000 → "$100.000"; con centavos sólo si los tiene */
export const formatReceiptAmount = (value: number): string =>
  `$${formatMoney(value, Number.isInteger(value) ? 0 : 2)}`;

const longDate = (iso: string): string => {
  const d = parseISO(iso.slice(0, 10));
  return isValid(d) ? format(d, 'dd/MM/yyyy') : iso;
};

/**
 * Texto de "Detalle de reserva" a partir de una reserva:
 * "Cabaña para 2 personas. Check-in el día 27/02/2026 a partir de las 14 hs y check-out el día 02/03/2026 a las 11hs."
 */
export function buildReservationDetail(
  guest: Pick<Guest, 'num_guests' | 'check_in_date' | 'check_out_date'>,
): string {
  const people = guest.num_guests === 1 ? '1 persona' : `${guest.num_guests} personas`;
  return (
    `Cabaña para ${people}. Check-in el día ${longDate(guest.check_in_date)} a partir de las 14 hs ` +
    `y check-out el día ${longDate(guest.check_out_date)} a las 11hs.`
  );
}

/** Qué se está cobrando de una reserva */
export type ReceiptConceptKind = 'deposit' | 'balance' | 'total';

export const RECEIPT_CONCEPT_LABELS: Record<ReceiptConceptKind, string> = {
  deposit: 'Seña',
  balance: 'Saldo',
  total: 'Total',
};

/** "Pago seña reserva Cabaña 1" */
export function buildConcept(kind: ReceiptConceptKind, cabinNumber: number): string {
  const what = kind === 'deposit' ? 'seña' : kind === 'balance' ? 'saldo' : 'total';
  return `Pago ${what} reserva Cabaña ${cabinNumber}`;
}

/** Monto en ARS que corresponde a cada concepto de una reserva */
export function conceptAmount(
  kind: ReceiptConceptKind,
  guest: Pick<Guest, 'deposit_ars' | 'balance_ars' | 'total_amount_ars'>,
): number {
  if (kind === 'deposit') return guest.deposit_ars;
  if (kind === 'balance') return guest.balance_ars;
  return guest.total_amount_ars;
}

/** "Recibo-0053-Victor.pdf" (sin tildes ni espacios, para que WhatsApp lo muestre bien) */
export function receiptFileName(receipt: Pick<Receipt, 'number' | 'guest_name'>): string {
  const name = receipt.guest_name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `Recibo-${formatReceiptNumber(receipt.number)}${name ? `-${name}` : ''}.pdf`;
}
