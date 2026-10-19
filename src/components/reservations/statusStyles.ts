import type { ReservationStatus } from '../../lib/reservations';

/** Filtro del listado: un estado de reserva o todas */
export type ReservationFilter = 'all' | ReservationStatus;

export interface StatusStyle {
  /** Fondo y color de texto base de la fila / tarjeta */
  surface: string;
  /** Feedback al pasar el mouse (sutil, coherente con cada color; colores sólidos para la columna fija) */
  hover: string;
  /** Acento de la izquierda de la primera celda de la fila: grosor y color */
  accent: string;
  /** Igual que `accent`, para la tarjeta del celular (que además tiene borde gris) */
  cardAccent: string;
  /** Color del texto secundario (teléfono, etiquetas) */
  subtext: string;
  /** Muestra de color de la leyenda */
  swatch: string;
}

/** Finalizada = gris, en curso = verde, próxima = blanco */
export const STATUS_STYLES: Record<ReservationStatus, StatusStyle> = {
  past: {
    surface: 'bg-gray-100 text-gray-500',
    hover: 'hover:bg-gray-200',
    accent: 'border-l-4 border-l-gray-300',
    cardAccent: 'border-l-4 border-l-gray-300',
    subtext: 'text-gray-500',
    swatch: 'bg-gray-100 border-gray-300',
  },
  ongoing: {
    surface: 'bg-green-50 text-gray-900',
    hover: 'hover:bg-green-100',
    accent: 'border-l-4 border-l-green-500',
    cardAccent: 'border-l-4 border-l-green-500',
    subtext: 'text-gray-500',
    swatch: 'bg-green-50 border-green-500',
  },
  upcoming: {
    surface: 'bg-white text-gray-900',
    hover: 'hover:bg-gray-50',
    accent: 'border-l-4 border-l-transparent',
    cardAccent: 'border-l-4 border-l-gray-200',
    subtext: 'text-gray-500',
    swatch: 'bg-white border-gray-300',
  },
};

export const FILTER_OPTIONS: { value: ReservationFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'upcoming', label: 'Próximas' },
  { value: 'ongoing', label: 'En curso' },
  { value: 'past', label: 'Finalizadas' },
];

/** Leyenda: nombre en singular de cada estado, en el orden en que se muestran */
export const LEGEND_ITEMS: { status: ReservationStatus; label: string }[] = [
  { status: 'past', label: 'Finalizada' },
  { status: 'ongoing', label: 'En curso' },
  { status: 'upcoming', label: 'Próxima' },
];
