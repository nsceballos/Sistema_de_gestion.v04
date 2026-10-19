import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  format, subMonths, addMonths, startOfMonth, getDaysInMonth, parseISO, differenceInCalendarDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BedDouble, Clock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { guestsApi, expensesApi, type Guest, type Expense } from '../lib/api';
import { CABINS, getReservationStatus, getStatusLabel, todayISO } from '../lib/reservations';
import { errorMessage, formatMoney } from '../lib/format';

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmt = (value: number) => formatMoney(value, 0);

/**
 * Noches ocupadas de una cabaña dentro de un mes. Cada reserva ocupa las noches
 * [entrada, salida): la noche de la salida no cuenta. Se recorta al mes y se
 * trabaja sobre strings YYYY-MM-DD (sin `new Date('YYYY-MM-DD')`, que corre un día por UTC).
 * Las noches se marcan por día, así que reservas superpuestas no se cuentan dos veces.
 */
function occupiedNights(
  guests: Pick<Guest, 'cabin_number' | 'check_in_date' | 'check_out_date'>[],
  cabin: number,
  monthStart: string, // YYYY-MM-01
  nextMonthStart: string, // YYYY-MM-01 del mes siguiente
  daysInMonth: number,
): number {
  const occupied = new Array<boolean>(daysInMonth).fill(false);
  for (const g of guests) {
    if (g.cabin_number !== cabin) continue;
    const checkIn = g.check_in_date.slice(0, 10);
    const checkOut = g.check_out_date.slice(0, 10);
    const start = checkIn > monthStart ? checkIn : monthStart;
    const end = checkOut < nextMonthStart ? checkOut : nextMonthStart;
    if (end <= start) continue;
    // Índices de día dentro del mes (0 = día 1); `end` es exclusivo
    const first = Number(start.slice(8, 10)) - 1;
    const last = end === nextMonthStart ? daysInMonth : Number(end.slice(8, 10)) - 1;
    for (let d = first; d < last; d++) occupied[d] = true;
  }
  return occupied.filter(Boolean).length;
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface MonthlyData {
  label: string;
  fullLabel: string;
  income: number;
  expenses: number;
  profit: number;
}

interface ActivityItem {
  id: string;
  date: string;
  type: 'ingreso' | 'gasto';
  description: string;
  amount_usd: number;
  amount_ars: number;
}

interface CabinOccupancy {
  cabin: number;
  nights: number;
  percent: number;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ReservationCard({ guest, today }: { guest: Guest; today: string }) {
  const checkIn = parseISO(guest.check_in_date.slice(0, 10));
  const checkOut = parseISO(guest.check_out_date.slice(0, 10));
  const status = getReservationStatus(guest, today);
  const label = getStatusLabel(guest, today);
  const daysUntil = differenceInCalendarDays(checkIn, parseISO(today));

  const pillClass =
    status === 'upcoming'
      ? 'bg-blue-100 text-blue-700'
      : label === 'Sale hoy'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pillClass}`}>
          {label}
        </span>
        <span className="text-sm font-bold text-gray-700">Cabaña {guest.cabin_number}</span>
      </div>
      {(guest.guest_name || guest.source) && (
        <div className="flex items-center gap-2 min-w-0">
          {guest.guest_name && (
            <span className="text-sm font-semibold text-gray-800 truncate">{guest.guest_name}</span>
          )}
          {guest.source && (
            <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {guest.source}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <BedDouble className="h-4 w-4 text-gray-400 shrink-0" />
        <span>
          {format(checkIn, 'd MMM', { locale: es })} → {format(checkOut, 'd MMM yyyy', { locale: es })}
          <span className="ml-2 text-gray-400">({guest.num_nights} noches)</span>
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {guest.num_guests} huéspedes{guest.phone_number ? ` · ${guest.phone_number}` : ''}
        </span>
        {status === 'upcoming' && daysUntil > 0 && (
          <span className="flex items-center gap-1 text-blue-600 text-xs shrink-0">
            <Clock className="h-3.5 w-3.5" />
            {daysUntil === 1 ? 'mañana' : `en ${daysUntil} días`}
          </span>
        )}
      </div>
      <div className="pt-1 border-t border-gray-100 flex justify-between text-sm">
        <span className="text-gray-500">Total</span>
        <span className="font-semibold text-gray-800">
          ${fmt(guest.total_amount_usd)} USD
        </span>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function Dashboard() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [currency, setCurrency] = useState<'USD' | 'ARS'>('USD');

  // Se pide al servidor una sola vez al montar (y en "Reintentar"); cambiar USD/ARS no vuelve a pedir
  const loadData = useCallback(async () => {
    setErrors([]);
    setLoading(true);

    // Fetch independently so one failure doesn't block the other
    const [guestsResult, expensesResult] = await Promise.allSettled([
      guestsApi.getAll(),
      expensesApi.getAll(),
    ]);

    const newErrors: string[] = [];
    if (guestsResult.status === 'fulfilled') {
      setGuests(guestsResult.value);
    } else {
      newErrors.push('Reservas: ' + errorMessage(guestsResult.reason, 'error desconocido'));
    }
    if (expensesResult.status === 'fulfilled') {
      setExpenses(expensesResult.value);
    } else {
      newErrors.push('Gastos: ' + errorMessage(expensesResult.reason, 'error desconocido'));
    }

    setErrors(newErrors);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Fecha local de hoy: si la pestaña queda abierta de un día para otro, se recalcula al renderizar
  const today = todayISO();

  // ── Reservas en curso y próxima ────────────────────────────────────────
  const { ongoing, nextReservation } = useMemo(() => {
    const ongoingGuests = guests
      .filter((g) => getReservationStatus(g, today) === 'ongoing')
      .sort((a, b) => a.cabin_number - b.cabin_number);
    const upcoming = guests
      .filter((g) => getReservationStatus(g, today) === 'upcoming')
      .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
    return { ongoing: ongoingGuests, nextReservation: upcoming[0] ?? null };
  }, [guests, today]);

  // ── Ocupación del mes actual por cabaña ────────────────────────────────
  const occupancy = useMemo(() => {
    const monthDate = startOfMonth(parseISO(today));
    const monthStart = format(monthDate, 'yyyy-MM-dd');
    const nextMonthStart = format(addMonths(monthDate, 1), 'yyyy-MM-dd');
    const daysInMonth = getDaysInMonth(monthDate);
    const cabins: CabinOccupancy[] = CABINS.map((cabin) => {
      const nights = occupiedNights(guests, cabin, monthStart, nextMonthStart, daysInMonth);
      return { cabin, nights, percent: Math.round((nights / daysInMonth) * 100) };
    });
    return { monthName: format(monthDate, 'MMMM', { locale: es }), daysInMonth, cabins };
  }, [guests, today]);

  // ── Datos mensuales (últimos 12 meses, del más antiguo al actual) ──────
  const monthlyData = useMemo<MonthlyData[]>(() => {
    const base = parseISO(today);
    return Array.from({ length: 12 }, (_, i) => subMonths(base, 11 - i)).map((month) => {
      const key = format(month, 'yyyy-MM');

      const income = guests
        .filter((g) => g.check_in_date.slice(0, 7) === key)
        .reduce((sum, g) => sum + (currency === 'USD' ? g.total_amount_usd : g.total_amount_ars), 0);

      const monthExpenses = expenses
        .filter((e) => e.expense_date.slice(0, 7) === key)
        .reduce((sum, e) => sum + (currency === 'USD' ? e.amount_usd : e.amount_ars), 0);

      return {
        label: format(month, "MMM ''yy", { locale: es }),
        fullLabel: format(month, 'MMMM yyyy', { locale: es }),
        income,
        expenses: monthExpenses,
        profit: income - monthExpenses,
      };
    });
  }, [guests, expenses, currency, today]);

  // ── Actividad reciente (últimos 12 movimientos) ────────────────────────
  const recentActivity = useMemo<ActivityItem[]>(() => {
    const incomeItems: ActivityItem[] = guests.map((g) => ({
      id: `g-${g.id}`,
      date: g.check_in_date,
      type: 'ingreso',
      description: `Cabaña ${g.cabin_number} · ${g.num_guests} huésp. · ${g.num_nights} noches`,
      amount_usd: g.total_amount_usd,
      amount_ars: g.total_amount_ars,
    }));

    const expenseItems: ActivityItem[] = expenses.map((e) => ({
      id: `e-${e.id}`,
      date: e.expense_date,
      type: 'gasto',
      description: `${e.category}${e.description ? ' · ' + e.description : ''}`,
      amount_usd: e.amount_usd,
      amount_ars: e.amount_ars,
    }));

    // Sólo movimientos hasta hoy: las reservas futuras ya se ven en "Estado de reservas"
    return [...incomeItems, ...expenseItems]
      .filter((item) => item.date.slice(0, 10) <= today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
  }, [guests, expenses, today]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Show errors as a banner (partial data still renders below)
  const errorBanner = errors.length > 0 && (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-red-700 mb-1">Error al cargar datos:</p>
      {errors.map((e, i) => (
        <p key={i} className="text-sm text-red-600">{e}</p>
      ))}
      <button
        onClick={() => void loadData()}
        className="mt-3 px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
      >
        Reintentar
      </button>
    </div>
  );

  const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0);
  const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
  const totalProfit = totalIncome - totalExpenses;
  const prefix = currency === 'USD' ? '$' : 'ARS ';

  return (
    <div className="space-y-5">

      {errorBanner}

      {/* ── Reservas en curso y próxima ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Estado de reservas</h2>
        {ongoing.length === 0 && !nextReservation ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center text-gray-400 text-sm">
            No hay reservas activas ni próximas
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ongoing.map((g) => (
              <ReservationCard key={g.id} guest={g} today={today} />
            ))}
            {nextReservation && (
              <ReservationCard guest={nextReservation} today={today} />
            )}
          </div>
        )}
      </section>

      {/* ── Ocupación del mes ── */}
      <section className="bg-white shadow-sm rounded-xl p-4 sm:p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Ocupación de {occupancy.monthName}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {occupancy.cabins.map(({ cabin, nights, percent }) => (
            <div key={cabin}>
              <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span className="font-medium text-gray-700">Cabaña {cabin}</span>
                <span className="text-gray-500">
                  {nights} de {occupancy.daysInMonth} noches ·{' '}
                  <span className="font-semibold text-gray-800">{percent}%</span>
                </span>
              </div>
              <div
                className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden"
                role="progressbar"
                aria-label={`Ocupación de la cabaña ${cabin}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Resumen financiero ── */}
      <section className="bg-white shadow-sm rounded-xl p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold text-gray-700">Resumen financiero (12 meses)</h2>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'USD' | 'ARS')}
            className="text-sm rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1"
          >
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-green-50 rounded-lg p-3 sm:p-5">
            <p className="text-xs sm:text-sm text-green-700 font-medium">Ingresos</p>
            <p className="text-sm sm:text-2xl font-bold text-green-600 mt-1 break-all">
              {prefix}{fmt(totalIncome)}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 sm:p-5">
            <p className="text-xs sm:text-sm text-red-700 font-medium">Gastos</p>
            <p className="text-sm sm:text-2xl font-bold text-red-600 mt-1 break-all">
              {prefix}{fmt(totalExpenses)}
            </p>
          </div>
          <div className={`rounded-lg p-3 sm:p-5 ${totalProfit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
            <p className={`text-xs sm:text-sm font-medium ${totalProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              Ganancia
            </p>
            <p className={`text-sm sm:text-2xl font-bold mt-1 break-all ${totalProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {prefix}{fmt(totalProfit)}
            </p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${prefix}${fmt(v)}`}
                width={currency === 'ARS' ? 75 : 55}
              />
              <Tooltip
                formatter={(value: number, _name, props) => [
                  `${prefix}${fmt(value)}`,
                  props.name,
                ]}
                labelFormatter={(label) => {
                  const m = monthlyData.find((d) => d.label === label);
                  return m?.fullLabel ?? label;
                }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" fill="#34D399" name="Ingresos" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" fill="#F87171" name="Gastos" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" fill="#60A5FA" name="Ganancia" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Actividad reciente ── */}
      {recentActivity.length > 0 && (
        <section className="bg-white shadow-sm rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-700">Actividad reciente</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                {item.type === 'ingreso' ? (
                  <ArrowUpCircle className="h-8 w-8 text-green-500 shrink-0" />
                ) : (
                  <ArrowDownCircle className="h-8 w-8 text-red-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.description}</p>
                  <p className="text-xs text-gray-400">
                    {format(parseISO(item.date.slice(0, 10)), "d 'de' MMMM yyyy", { locale: es })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${item.type === 'ingreso' ? 'text-green-600' : 'text-red-500'}`}>
                    {item.type === 'ingreso' ? '+' : '-'}{prefix}
                    {fmt(currency === 'USD' ? item.amount_usd : item.amount_ars)}
                  </p>
                  <p className="text-xs text-gray-400 uppercase">{currency}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
