import { format } from 'date-fns';
import type { Guest, ReservationSource } from './api';

export const CABINS = [1, 2] as const;

export const RESERVATION_SOURCES: Exclude<ReservationSource, ''>[] = ['Directo', 'Booking', 'Airbnb'];

export type ReservationStatus = 'past' | 'ongoing' | 'upcoming';

/** Fecha local de hoy en formato YYYY-MM-DD (mismo formato que check_in_date / check_out_date) */
export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Estado de una reserva respecto de hoy. Compara strings YYYY-MM-DD para evitar
 * problemas de zona horaria. El día de salida todavía cuenta como "en curso".
 */
export function getReservationStatus(
  guest: Pick<Guest, 'check_in_date' | 'check_out_date'>,
  today: string = todayISO(),
): ReservationStatus {
  if (guest.check_out_date.slice(0, 10) < today) return 'past';
  if (guest.check_in_date.slice(0, 10) <= today) return 'ongoing';
  return 'upcoming';
}

/** Etiqueta corta del estado; distingue los días de llegada y salida */
export function getStatusLabel(
  guest: Pick<Guest, 'check_in_date' | 'check_out_date'>,
  today: string = todayISO(),
): string {
  const status = getReservationStatus(guest, today);
  if (status === 'past') return 'Finalizada';
  if (status === 'upcoming') return 'Próxima';
  if (guest.check_in_date.slice(0, 10) === today) return 'Llega hoy';
  if (guest.check_out_date.slice(0, 10) === today) return 'Sale hoy';
  return 'En curso';
}
