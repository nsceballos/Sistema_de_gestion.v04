import React, { useEffect, useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, BedDouble, Clock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { guestsApi, expensesApi, type Guest, type Expense } from '../lib/api';

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmt = (value: number) =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

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

// ─── Sub-components ────────────────────────────────────────────────────────

function ReservationCard({ guest, label }: { guest: Guest; label: string }) {
  const checkIn = parseISO(guest.check_in_date);
  const checkOut = parseISO(guest.check_out_date);
  const daysUntil = differenceInDays(checkIn, new Date());

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          label === 'En curso'
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {label}
        </span>
        <span className="text-sm font-bold text-gray-700">Cabaña {guest.cabin_number}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <BedDouble className="h-4 w-4 text-gray-400 shrink-0" />
        <span>
          {format(checkIn, 'd MMM', { locale: es })} → {format(checkOut, 'd MMM yyyy', { locale: es })}
          <span className="ml-2 text-gray-400">({guest.num_nights} noches)</span>
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{guest.num_guests} huéspedes · {guest.phone_number}</span>
        {label !== 'En curso' && daysUntil > 0 && (
          <span className="flex items-center gap-1 text-blue-600 text-xs">
            <Clock className="h-3.5 w-3.5" />
            en {daysUntil} días
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
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [currentReservations, setCurrentReservations] = useState<Guest[]>([]);
  const [nextReservation, setNextReservation] = useState<Guest | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'USD' | 'ARS'>('USD');

  useEffect(() => {
    fetchData();
  }, [currency]);

  const fetchData = async () => {
    try {
      setError(null);
      setLoading(true);

      const [allGuests, allExpenses] = await Promise.all([
        guestsApi.getAll(),
        expensesApi.getAll(),
      ]);

      const today = todayStr();

      // ── Reservas en curso y próxima ──────────────────────────────────────
      const ongoing = allGuests.filter(
        (g) => g.check_in_date <= today && g.check_out_date >= today,
      );
      const upcoming = allGuests
        .filter((g) => g.check_in_date > today)
        .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));

      setCurrentReservations(ongoing);
      setNextReservation(upcoming[0] ?? null);

      // ── Datos mensuales (últimos 12 meses) ───────────────────────────────
      const currentDate = new Date();
      const months = Array.from({ length: 12 }, (_, i) => subMonths(currentDate, i));

      const monthly: MonthlyData[] = months.map((month) => {
        const start = startOfMonth(month);
        const end = endOfMonth(month);

        const income = allGuests
          .filter((g) => {
            const d = parseISO(g.check_in_date);
            return d >= start && d <= end;
          })
          .reduce(
            (sum, g) => sum + (currency === 'USD' ? g.total_amount_usd : g.total_amount_ars),
            0,
          );

        const expenses = allExpenses
          .filter((e) => {
            const d = parseISO(e.expense_date);
            return d >= start && d <= end;
          })
          .reduce(
            (sum, e) => sum + (currency === 'USD' ? e.amount_usd : e.amount_ars),
            0,
          );

        return {
          label: format(month, "MMM ''yy", { locale: es }),
          fullLabel: format(month, 'MMMM yyyy', { locale: es }),
          income,
          expenses,
          profit: income - expenses,
        };
      });

      setMonthlyData(monthly.reverse());

      // ── Actividad reciente (últimos 10 movimientos) ──────────────────────
      const incomeItems: ActivityItem[] = allGuests.map((g) => ({
        id: `g-${g.id}`,
        date: g.check_in_date,
        type: 'ingreso',
        description: `Cabaña ${g.cabin_number} · ${g.num_guests} huésp. · ${g.num_nights} noches`,
        amount_usd: g.total_amount_usd,
        amount_ars: g.total_amount_ars,
      }));

      const expenseItems: ActivityItem[] = allExpenses.map((e) => ({
        id: `e-${e.id}`,
        date: e.expense_date,
        type: 'gasto',
        description: `${e.category}${e.description ? ' · ' + e.description : ''}`,
        amount_usd: e.amount_usd,
        amount_ars: e.amount_ars,
      }));

      const combined = [...incomeItems, ...expenseItems]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12);

      setRecentActivity(combined);
    } catch {
      setError('Error al cargar los datos. Por favor, intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-xl p-6 text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0);
  const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
  const totalProfit = totalIncome - totalExpenses;
  const prefix = currency === 'USD' ? '$' : 'ARS ';

  return (
    <div className="space-y-5">

      {/* ── Reservas en curso y próxima ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Estado de reservas</h2>
        {currentReservations.length === 0 && !nextReservation ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center text-gray-400 text-sm">
            No hay reservas activas ni próximas
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentReservations.map((g) => (
              <ReservationCard key={g.id} guest={g} label="En curso" />
            ))}
            {nextReservation && (
              <ReservationCard guest={nextReservation} label="Próxima" />
            )}
          </div>
        )}
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
                    {format(parseISO(item.date), "d 'de' MMMM yyyy", { locale: es })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${item.type === 'ingreso' ? 'text-green-600' : 'text-red-500'}`}>
                    {item.type === 'ingreso' ? '+' : '-'}$
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
