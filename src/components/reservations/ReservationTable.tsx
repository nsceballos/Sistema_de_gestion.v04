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

const HEADERS: { label: string; title?: string; align?: 'right' | 'center'; sticky?: boolean }[] = [
  { label: 'Cabaña' },
  { label: 'Huésped' },
  { label: 'Canal' },
  { label: 'Entrada' },
  { label: 'Salida' },
  { label: 'Noches', align: 'center' },
  { label: 'Pers.', title: 'Cantidad de huéspedes', align: 'center' },
  { label: 'Total (ARS)', align: 'right' },
  { label: 'Seña (ARS)', align: 'right' },
  { label: 'Saldo (ARS)', align: 'right' },
  { label: 'Acciones', align: 'right', sticky: true },
];

const ALIGN = { right: 'text-right', center: 'text-center' } as const;

// Si la tabla desborda (tablet), la columna de acciones queda fija a la derecha y no se pierde de vista
const STICKY_END = 'sticky right-0 z-10';

/** Listado de escritorio (md en adelante): una fila por reserva, coloreada según su estado */
export default function ReservationTable({ guests, today, busy, onEdit, onDelete, onCreateReceipt }: Props) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {HEADERS.map(({ label, title, align, sticky }, index) => (
              <th
                key={label}
                scope="col"
                title={title}
                className={`py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${
                  index === 0 ? 'pl-3 pr-2 xl:pl-4 xl:pr-3' : 'px-2 xl:px-3'
                } ${align ? ALIGN[align] : 'text-left'} ${sticky ? STICKY_END + ' bg-gray-50' : ''}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {guests.map((guest) => {
            const status = getReservationStatus(guest, today);
            const style = STATUS_STYLES[status];
            const name = guest.guest_name?.trim();
            const phone = guest.phone_number?.trim();

            return (
              <tr key={guest.id} className={`${style.surface} ${style.hover} transition-colors`}>
                <td className={`whitespace-nowrap py-3 pl-2 pr-2 xl:pl-3 xl:pr-3 ${style.accent}`}>
                  <div className="font-medium">Cabaña {guest.cabin_number}</div>
                  <StatusPill status={status} label={getStatusLabel(guest, today)} />
                </td>
                <td className="px-2 py-3 xl:px-3">
                  <div className="max-w-[11rem] truncate" title={name || undefined}>
                    {name || '—'}
                  </div>
                  {phone && <div className={`text-xs ${style.subtext}`}>{phone}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3">
                  <SourceBadge source={guest.source} muted={status === 'past'} />
                </td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3">{formatDay(guest.check_in_date)}</td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3">{formatDay(guest.check_out_date)}</td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3 text-center tabular-nums">{guest.num_nights}</td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3 text-center tabular-nums">{guest.num_guests}</td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3 text-right tabular-nums">{formatArs(guest.total_amount_ars)}</td>
                <td className="whitespace-nowrap px-2 py-3 xl:px-3 text-right tabular-nums">{formatArs(guest.deposit_ars)}</td>
                <td
                  className={`whitespace-nowrap px-2 py-3 xl:px-3 text-right tabular-nums ${
                    guest.balance_ars > 0 ? 'font-semibold' : ''
                  }`}
                >
                  {formatArs(guest.balance_ars)}
                </td>
                <td className={`whitespace-nowrap px-2 py-2 text-right xl:px-3 bg-inherit ${STICKY_END}`}>
                  <RowActions
                    guest={guest}
                    disabled={busy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onCreateReceipt={onCreateReceipt}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
