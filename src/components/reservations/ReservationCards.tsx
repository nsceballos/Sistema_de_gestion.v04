import type { Guest } from '../../lib/api';
import { getReservationStatus, getStatusLabel } from '../../lib/reservations';
import { SourceBadge, StatusPill } from './badges';
import RowActions from './RowActions';
import { STATUS_STYLES } from './statusStyles';
import { formatArs, formatDay } from './utils';

interface Props {
  guests: Guest[];
  /** Fecha de hoy (YYYY-MM-DD) con la que se calcula el estado de cada reserva */
  today: string;
  /** Deshabilita las acciones mientras hay una operación en curso */
  busy: boolean;
  onEdit: (guest: Guest) => void;
  onDelete: (id: string) => void;
  onCreateReceipt?: (guest: Guest) => void;
}

/** Listado para celular (debajo de md): una tarjeta por reserva con los mismos colores que la tabla */
export default function ReservationCards({ guests, today, busy, onEdit, onDelete, onCreateReceipt }: Props) {
  return (
    <ul className="space-y-3 md:hidden">
      {guests.map((guest) => {
        const status = getReservationStatus(guest, today);
        const style = STATUS_STYLES[status];
        const name = guest.guest_name?.trim();
        const phone = guest.phone_number?.trim();

        return (
          <li
            key={guest.id}
            className={`rounded-lg border border-gray-200 p-3 ${style.surface} ${style.cardAccent}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Cabaña {guest.cabin_number}</span>
                  <StatusPill status={status} label={getStatusLabel(guest, today)} />
                  <SourceBadge source={guest.source} muted={status === 'past'} />
                </div>
                <p className="mt-1 truncate text-sm">{name || '—'}</p>
                {phone && <p className={`text-xs ${style.subtext}`}>{phone}</p>}
              </div>
              <div className="-mr-1 -mt-1 shrink-0">
                <RowActions
                  guest={guest}
                  disabled={busy}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onCreateReceipt={onCreateReceipt}
                  large
                />
              </div>
            </div>

            <p className="mt-2 text-sm">
              {formatDay(guest.check_in_date)} → {formatDay(guest.check_out_date)}
            </p>
            <p className={`text-xs ${style.subtext}`}>
              {guest.num_nights} {guest.num_nights === 1 ? 'noche' : 'noches'} · {guest.num_guests}{' '}
              {guest.num_guests === 1 ? 'huésped' : 'huéspedes'}
            </p>

            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-black/5 pt-2 text-sm">
              <div>
                <dt className={`text-xs ${style.subtext}`}>Total (ARS)</dt>
                <dd className="tabular-nums">{formatArs(guest.total_amount_ars)}</dd>
              </div>
              <div>
                <dt className={`text-xs ${style.subtext}`}>Seña (ARS)</dt>
                <dd className="tabular-nums">{formatArs(guest.deposit_ars)}</dd>
              </div>
              <div>
                <dt className={`text-xs ${style.subtext}`}>Saldo (ARS)</dt>
                <dd className={`tabular-nums ${guest.balance_ars > 0 ? 'font-semibold' : ''}`}>
                  {formatArs(guest.balance_ars)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
