import type { ReservationSource } from '../../lib/api';
import type { ReservationStatus } from '../../lib/reservations';

/** Pastilla verde para las reservas en curso; en el resto sólo deja el estado para lectores de pantalla */
export function StatusPill({ status, label }: { status: ReservationStatus; label: string }) {
  if (status !== 'ongoing') return <span className="sr-only">{label}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-600/20">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
      {label}
    </span>
  );
}

const SOURCE_STYLES: Record<string, string> = {
  Booking: 'bg-blue-100 text-blue-800',
  Airbnb: 'bg-rose-100 text-rose-800',
  Directo: 'bg-gray-200 text-gray-700',
};

/** Canal de la reserva; no muestra nada si no está cargado */
export function SourceBadge({ source, muted = false }: { source: ReservationSource; muted?: boolean }) {
  if (!source) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        SOURCE_STYLES[source] ?? SOURCE_STYLES.Directo
      } ${muted ? 'opacity-60' : ''}`}
    >
      {source}
    </span>
  );
}
