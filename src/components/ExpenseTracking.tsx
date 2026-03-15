import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { expensesApi, type Expense } from '../lib/api';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface ExpenseFormData {
  expenseDate: string;
  category: string;
  amountARS: number;
  description: string;
}

const EXPENSE_CATEGORIES = [
  'Electricidad', 'Internet', 'Agua', 'Limpieza', 'Impuestos', 'Otros',
];

const formatNumber = (value: number): string =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpenseTracking() {
  const { register, handleSubmit, reset } = useForm<ExpenseFormData>();
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchExchangeRate();
    fetchExpenses();
  }, []);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
      const data = await response.json();
      setExchangeRate(data.venta);
    } catch {
      setExchangeRate(850);
    }
  };

  const fetchExpenses = async () => {
    try {
      const data = await expensesApi.getAll();
      setExpenses(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los gastos');
    }
  };

  const calculateUSDAmount = (arsAmount: number) => {
    if (!exchangeRate) return 0;
    return Number((arsAmount / exchangeRate).toFixed(2));
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setLoading(true);
    setError(null);
    try {
      const amountUSD = calculateUSDAmount(Number(data.amountARS));
      await expensesApi.create({
        expense_date: data.expenseDate,
        category: data.category,
        amount_usd: amountUSD,
        amount_ars: Number(data.amountARS),
        description: data.description || '',
      });
      reset();
      setShowForm(false);
      setSuccessMessage('¡Gasto registrado exitosamente!');
      await fetchExpenses();
    } catch (err: any) {
      setError(err.message || 'Error al registrar gasto. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro que desea eliminar este gasto?')) return;
    setError(null);
    try {
      await expensesApi.delete(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      setSuccessMessage('Gasto eliminado exitosamente');
    } catch (err: any) {
      setError(err.message || 'Error al eliminar gasto');
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

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
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
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
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
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
              {['Fecha', 'Categoría', 'Monto (ARS)', 'Descripción', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {format(parseISO(expense.expense_date), 'dd MMM yyyy', { locale: es })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{expense.category}</td>
                <td className="px-6 py-4 whitespace-nowrap">ARS {formatNumber(expense.amount_ars)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{expense.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="text-red-600 hover:text-red-900"
                    title="Eliminar gasto"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No hay gastos registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
