import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Check, X, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ExpenseFormData {
  expenseDate: string;
  category: string;
  amountARS: number;
  description: string;
}

interface Expense {
  id: string;
  expense_date: string;
  category: string;
  amount_ars: number;
  amount_usd: number;
  description: string;
}

const EXPENSE_CATEGORIES = [
  'Electricidad',
  'Internet',
  'Agua',
  'Limpieza',
  'Impuestos',
  'Otros'
];

export default function ExpenseTracking() {
  const { register, handleSubmit, reset } = useForm<ExpenseFormData>();
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [editingExpense, setEditingExpense] = useState<string | null>(null);

  useEffect(() => {
    fetchExchangeRate();
    fetchExpenses();
  }, []);

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
      const data = await response.json();
      setExchangeRate(data.venta);
    } catch (error) {
      console.error('Error al obtener tasa de cambio:', error);
      setExchangeRate(850);
    }
  };

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error al cargar gastos:', error);
    }
  };

  const calculateUSDAmount = (arsAmount: number) => {
    if (!exchangeRate) return 0;
    return Number((arsAmount / exchangeRate).toFixed(2));
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setLoading(true);
    try {
      const amountUSD = calculateUSDAmount(data.amountARS);

      const { error } = await supabase.from('expenses').insert({
        expense_date: data.expenseDate,
        category: data.category,
        amount_usd: amountUSD,
        amount_ars: data.amountARS,
        description: data.description
      });

      if (error) throw error;
      
      reset();
      setShowForm(false);
      fetchExpenses();
      alert('¡Gasto registrado exitosamente!');
    } catch (error) {
      console.error('Error al registrar gasto:', error);
      alert('Error al registrar gasto. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro que desea eliminar este gasto?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      fetchExpenses();
      alert('Gasto eliminado exitosamente');
    } catch (error) {
      console.error('Error al eliminar gasto:', error);
      alert('Error al eliminar gasto');
    }
  };

  const formatNumber = (value: number): string => {
    return value.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Gestión de Gastos</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Registrar nuevo gasto
        </button>
      </div>

      {showForm && (
        <div className="mb-8 p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Nuevo Gasto</h3>
          {exchangeRate && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800">
                Tipo de cambio actual: 1 USD = {exchangeRate.toFixed(2)} ARS
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha</label>
                <input
                  type="date"
                  {...register('expenseDate', { required: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Categoría</label>
                <select
                  {...register('category', { required: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="">Seleccione una categoría</option>
                  {EXPENSE_CATEGORIES.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Monto (ARS)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('amountARS', { required: true, min: 0 })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <input
                  type="text"
                  {...register('description')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                {loading ? 'Registrando...' : 'Registrar Gasto'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Categoría
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Monto (ARS)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Descripción
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {format(new Date(expense.expense_date), 'dd MMM yyyy', { locale: es })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {expense.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  ARS {formatNumber(expense.amount_ars)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {expense.description}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}