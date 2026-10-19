import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Guest } from '../../lib/api';
import { formatMoney } from '../../lib/format';

/** "19 oct 2026" a partir de un YYYY-MM-DD (parseISO lo interpreta en hora local) */
export const formatDay = (iso: string): string => {
  const date = parseISO(iso);
  return isValid(date) ? format(date, 'dd MMM yyyy', { locale: es }) : iso;
};

/** Monto en ARS: sin decimales cuando es entero (ahorra ancho en la tabla) */
export const formatArs = (value: number): string => formatMoney(value, Number.isInteger(value) ? 0 : 2);

/** Noches entre dos fechas YYYY-MM-DD; null si faltan o la salida no es posterior a la entrada */
export function countNights(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null;
  const start = parseISO(checkIn);
  const end = parseISO(checkOut);
  if (!isValid(start) || !isValid(end)) return null;
  const nights = differenceInCalendarDays(end, start);
  return nights > 0 ? nights : null;
}

/** Link de WhatsApp con el mensaje de bienvenida; null si la reserva no tiene teléfono */
export function buildWhatsAppUrl(guest: Pick<Guest, 'guest_name' | 'phone_number'>): string | null {
  const phone = (guest.phone_number || '').replace(/\D/g, '');
  if (!phone) return null;
  const name = (guest.guest_name || '').trim();
  const greeting = name ? `Hola ${name}!` : 'Hola!';
  const message = `${greeting} Los esperamos hoy para su reserva. Me pueden ir avisando antes de llegar para poder recibirlos.
Al lado de la cabaña viven los encargados y ellos los van a estar recibiendo cuando lleguen.

Check-in: a partir de las 14hs
Check-out: hasta las 11hs

Ubicación de Maps: https://maps.app.goo.gl/oUwTkRov6mbKoNZY9`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(guest: Pick<Guest, 'guest_name' | 'phone_number'>): void {
  const url = buildWhatsAppUrl(guest);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
