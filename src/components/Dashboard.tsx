import React, { useEffect, useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  profit: number;
}

const formatNumber = (value: number): string => {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

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
      const currentDate = new Date();
      const months = Array.from({ length: 12 }, (_, i) => subMonths(currentDate, i));
      const monthlyDataArray: MonthlyData[] = [];

      for (const month of months) {
        const startDate = startOfMonth(month);
        const endDate = endOfMonth(month);

        // Fetch income (guests)
        const { data: incomeData, error: incomeError } = await supabase
          .from('guests')
          .select('total_amount_usd, total_amount_ars, check_in_date')
          .gte('check_in_date', startDate.toISOString())
          .lte('check_in_date', endDate.toISOString());

        if (incomeError) {
          console.error('Error fetching income data:', incomeError);
          continue;
        }

        // Fetch expenses
        const { data: expenseData, error: expenseError } = await supabase
          .from('expenses')
          .select('amount_usd, amount_ars, expense_date')
          .gte('expense_date', startDate.toISOString())
          .lte('expense_date', endDate.toISOString());

        if (expenseError) {
          console.error('Error fetching expense data:', expenseError);
          continue;
        }

        // Calculate totals based on selected currency
        const totalIncome = incomeData?.reduce((sum, item) => 
          sum + (currency === 'USD' ? (item.total_amount_usd || 0) : (item.total_amount_ars || 0)), 0) || 0;
        const totalExpenses = expenseData?.reduce((sum, item) => 
          sum + (currency === 'USD' ? (item.amount_usd || 0) : (item.amount_ars || 0)), 0) || 0;

        monthlyDataArray.push({
          month: format(month, 'MMMM yyyy', { locale: es }),
          income: totalIncome,
          expenses: totalExpenses,
          profit: totalIncome - totalExpenses
        });
      }

      setMonthlyData(monthlyDataArray.reverse());
    } catch (error) {
      console.error('Error al cargar datos mensuales:', error);
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
          <div className="mb-4 text-red-600">
            {error}
          </div>
          <button
            onClick={() => {
              setLoading(true);
              fetchMonthlyData();
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const totalIncome = monthlyData.reduce((sum, month) => sum + month.income, 0);
  const totalExpenses = monthlyData.reduce((sum, month) => sum + month.expenses, 0);
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
          <BarChart
            data={monthlyData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatNumber(value)} />
            <Tooltip 
              formatter={(value: number) => [
                formatNumber(value),
                currency === 'USD' ? 'USD' : 'ARS'
              ]}
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