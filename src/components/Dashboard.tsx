import React, { useEffect, useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { guestsApi, expensesApi } from '../lib/api';

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  profit: number;
}

const formatNumber = (value: number): string =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Dashboard() {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'USD' | 'ARS'>('USD');

  useEffect(() => {
    fetchMonthlyData();
  }, [currency]);

  const fetchMonthlyData = async () => {
    try {
      setError(null);
      setLoading(true);

      const [allGuests, allExpenses] = await Promise.all([
        guestsApi.getAll(),
        expensesApi.getAll(),
      ]);

      const currentDate = new Date();
      const months = Array.from({ length: 12 }, (_, i) => subMonths(currentDate, i));

      const monthlyDataArray: MonthlyData[] = months.map(month => {
        const start = startOfMonth(month);
        const end = endOfMonth(month);

        const totalIncome = allGuests
          .filter(g => {
            const d = parseISO(g.check_in_date);
            return d >= start && d <= end;
          })
          .reduce((sum, g) => sum + (currency === 'USD' ? g.total_amount_usd : g.total_amount_ars), 0);

        const totalExpenses = allExpenses
          .filter(e => {
            const d = parseISO(e.expense_date);
            return d >= start && d <= end;
          })
          .reduce((sum, e) => sum + (currency === 'USD' ? e.amount_usd : e.amount_ars), 0);

        return {
          month: format(month, 'MMMM yyyy', { locale: es }),
          income: totalIncome,
          expenses: totalExpenses,
          profit: totalIncome - totalExpenses,
        };
      });

      setMonthlyData(monthlyDataArray.reverse());
    } catch {
      setError('Error al cargar los datos. Por favor, intente nuevamente más tarde.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-12">
          <div className="mb-4 text-red-600">{error}</div>
          <button
            onClick={() => fetchMonthlyData()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const totalIncome = monthlyData.reduce((sum, m) => sum + m.income, 0);
  const totalExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0);
  const totalProfit = totalIncome - totalExpenses;

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Panel Financiero</h2>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as 'USD' | 'ARS')}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-green-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-green-900">Ingresos Totales</h3>
          <p className="text-2xl font-bold text-green-600">
            {currency === 'USD' ? '$' : 'ARS '}{formatNumber(totalIncome)}
          </p>
        </div>
        <div className="bg-red-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-red-900">Gastos Totales</h3>
          <p className="text-2xl font-bold text-red-600">
            {currency === 'USD' ? '$' : 'ARS '}{formatNumber(totalExpenses)}
          </p>
        </div>
        <div className="bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-blue-900">Ganancia Neta Total</h3>
          <p className="text-2xl font-bold text-blue-600">
            {currency === 'USD' ? '$' : 'ARS '}{formatNumber(totalProfit)}
          </p>
        </div>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => formatNumber(v)} />
            <Tooltip
              formatter={(value: number) => [formatNumber(value), currency === 'USD' ? 'USD' : 'ARS']}
            />
            <Legend />
            <Bar dataKey="income" fill="#34D399" name="Ingresos" />
            <Bar dataKey="expenses" fill="#F87171" name="Gastos" />
            <Bar dataKey="profit" fill="#60A5FA" name="Ganancia" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
