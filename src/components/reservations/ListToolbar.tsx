import { FILTER_OPTIONS, LEGEND_ITEMS, STATUS_STYLES, type ReservationFilter } from './statusStyles';

interface Props {
  filter: ReservationFilter;
  onFilterChange: (filter: ReservationFilter) => void;
  counts: Record<ReservationFilter, number>;
}

/** Filtros por estado (con cantidades) y leyenda de colores del listado */
export default function ListToolbar({ filter, onFilterChange, counts }: Props) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div
        role="group"
        aria-label="Filtrar reservas por estado"
        className="inline-flex flex-wrap gap-1 self-start rounded-lg bg-gray-100 p-1"
      >
        {FILTER_OPTIONS.map(({ value, label }) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                active ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {counts[value]}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Leyenda de colores">
        {LEGEND_ITEMS.map(({ status, label }) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm border ${STATUS_STYLES[status].swatch}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
