import { Edit2, MessageCircle, Trash2 } from 'lucide-react';
import type { Guest } from '../../lib/api';
import { openWhatsApp } from './utils';

interface Props {
  guest: Guest;
  /** Deshabilita las acciones mientras hay una operación en curso */
  disabled: boolean;
  onEdit: (guest: Guest) => void;
  onDelete: (id: string) => void;
  /** Botones más grandes para tocar con el dedo (tarjetas del celular) */
  large?: boolean;
}

const BASE =
  'inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';

/** Editar, eliminar y enviar WhatsApp: botones de sólo ícono */
export default function RowActions({ guest, disabled, onEdit, onDelete, large = false }: Props) {
  const label = guest.guest_name?.trim() || `cabaña ${guest.cabin_number}`;
  const size = large ? 'h-10 w-10' : 'h-8 w-8';
  const icon = large ? 'h-5 w-5' : 'h-4 w-4';
  const hasPhone = Boolean(guest.phone_number?.replace(/\D/g, ''));

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onEdit(guest)}
        disabled={disabled}
        title="Editar reserva"
        aria-label={`Editar reserva de ${label}`}
        className={`${BASE} ${size} text-indigo-600 hover:bg-black/5 hover:text-indigo-800`}
      >
        <Edit2 className={icon} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(guest.id)}
        disabled={disabled}
        title="Eliminar reserva"
        aria-label={`Eliminar reserva de ${label}`}
        className={`${BASE} ${size} text-red-600 hover:bg-black/5 hover:text-red-800`}
      >
        <Trash2 className={icon} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => openWhatsApp(guest)}
        disabled={disabled || !hasPhone}
        title={hasPhone ? 'Enviar recordatorio por WhatsApp' : 'Sin teléfono cargado'}
        aria-label={`Enviar recordatorio por WhatsApp a ${label}`}
        className={`${BASE} ${size} text-green-600 hover:bg-black/5 hover:text-green-800`}
      >
        <MessageCircle className={icon} aria-hidden="true" />
      </button>
    </div>
  );
}
