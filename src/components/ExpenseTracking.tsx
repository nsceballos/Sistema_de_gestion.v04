import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { expensesApi, type Expense, type ExpensePayload } from '../lib/api';
import { rateFromRecord, toUSD, useExchangeRate, type ExchangeRateStatus } from '../lib/useExchangeRate';
import { errorMessage, formatMoney } from '../lib/format';

interface ExpenseFormData {
  expenseDate: string;
  category: string;
  amountARS: string;
  exchangeRate: string;
  description: string;
}

const EXPENSE_CATEGORIES = [
  'Electricidad', 'Internet', 'Agua', 'Limpieza', 'Impuestos', 'Otros',
];

const blankForm = (rate: number | null): ExpenseFormData => ({
  expenseDate: '',
  category: '',
  amountARS: '',
  exchangeRate: rate ? String(rate) : '',
  description: '',
});

/** Formatea una fecha YYYY-MM-DD (hora local, sin corrimiento por UTC); si no se puede, devuelve el texto tal cual */
const formatDate = (value: string, pattern = 'dd MMM yyyy'): string => {
  const date = parseISO(value.slice(0, 10));
  return isValid(date) ? format(date, pattern, { locale: es }) : value;
};

const monthLabel = (month: string): string => {
  const label = formatDate(`${month}-01`, 'MMMM yyyy');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const inputClass = (invalid: boolean) =>
  `mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 ${
    invalid
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-indigo-500'
  }`;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function rateHint(
  status: ExchangeRateStatus,
  fetchedAt: string | null,
): { text: string; className: string } {
  switch (status) {
    case 'live':
      return { text: 'Dólar oficial de hoy', className: 'text-gray-500' };
    case 'cached': {
      const when = fetchedAt ? parseISO(fetchedAt) : null;
      const stamp = when && isValid(when) ? ` del ${format(when, 'dd/MM HH:mm')}` : '';
      return {
        text: `Última cotización guardada${stamp} — no se pudo actualizar`,
        className: 'text-amber-600',
      };
    }
    case 'unavailable':
      return {
        text: 'No se pudo obtener la cotización: ingresala a mano',
        className: 'text-red-600',
      };
    default:
      return { text: 'Consultando la cotización...', className: 'text-gray-500' };
  }
}

export default function ExpenseTracking() {
  const {
    register, handleSubmit, reset, setValue, clearErrors, watch,
    formState: { errors: formErrors },
  } = useForm<ExpenseFormData>({ defaultValues: blankForm(null) });
  const { rate: liveRate, status: rateStatus, fetchedAt } = useExchangeRate();

  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthFilter, setMonthFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);
  // Mientras sea true, el campo de tipo de cambio acompaña a la cotización del hook
  // (que puede llegar después de abrir el formulario). Se apaga apenas el usuario lo edita.
  const followLiveRate = useRef(true);

  const editingId = editingExpense?.id ?? null;
  const editingStoredRate = editingExpense
    ? rateFromRecord(editingExpense.exchange_rate, editingExpense.amount_ars, editingExpense.amount_usd)
    : null;

  const fetchExpenses = useCallback(async () => {
    try {
      setExpenses(await expensesApi.getAll());
    } catch (err) {
      setError(errorMessage(err, 'Error al cargar los gastos'));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Cotización que llega (o se actualiza) con el formulario abierto
  useEffect(() => {
    if (showForm && followLiveRate.current && liveRate) {
      setValue('exchangeRate', String(liveRate));
      clearErrors('exchangeRate');
    }
  }, [showForm, liveRate, setValue, clearErrors]);

  // Llevar el formulario a la vista al abrirlo o al cambiar de gasto a editar
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm, editingId]);

  const closeForm = () => {
    setShowForm(false);
    setEditingExpense(null);
    followLiveRate.current = true;
    reset(blankForm(liveRate));
  };

  const openNewForm = () => {
    // Con el formulario de alta abierto, el botón lo cierra; en cualquier otro caso abre uno en blanco
    if (showForm && !editingExpense) {
      closeForm();
      return;
    }
    followLiveRate.current = true;
    reset(blankForm(liveRate));
    setEditingExpense(null);
    setError(null);
    setShowForm(true);
  };

  const startEdit = (expense: Expense) => {
    const storedRate = rateFromRecord(expense.exchange_rate, expense.amount_ars, expense.amount_usd);
    const rate = storedRate ?? liveRate;
    // Se conserva la cotización con la que se cargó el gasto; sólo se usa la de hoy si no hay ninguna
    followLiveRate.current = storedRate === null;
    reset({
      expenseDate: expense.expense_date.slice(0, 10),
      category: expense.category,
      amountARS: String(expense.amount_ars),
      exchangeRate: rate ? String(rate) : '',
      description: expense.description ?? '',
    });
    setEditingExpense(expense);
    setError(null);
    setShowForm(true);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    setSaving(true);
    setError(null);
    try {
      const amountARS = Math.round(Number(data.amountARS) * 100) / 100;
      const rate = Number(data.exchangeRate);
      const payload: ExpensePayload = {
        expense_date: data.expenseDate,
        category: data.category,
        amount_ars: amountARS,
        exchange_rate: rate,
        amount_usd: toUSD(amountARS, rate),
        description: data.description.trim(),
      };
      if (editingId) {
        await expensesApi.update(editingId, payload);
      } else {
        await expensesApi.create(payload);
      }
      setSuccessMessage(editingId ? '¡Gasto actualizado exitosamente!' : '¡Gasto registrado exitosamente!');
      closeForm();
      await fetchExpenses();
    } catch (err) {
      setError(errorMessage(err, 'Error al guardar el gasto. Por favor intente nuevamente.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro que desea eliminar este gasto?')) return;
    setError(null);
    try {
      await expensesApi.delete(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      if (editingId === id) closeForm();
      setSuccessMessage('Gasto eliminado exitosamente');
    } catch (err) {
      setError(errorMessage(err, 'Error al eliminar gasto'));
    }
  };

  // ── Datos derivados ──────────────────────────────────────────────────────

  // Categorías fijas + la del gasto en edición si es una categoría antigua
  const categoryOptions = useMemo(
    () =>
      editingExpense && editingExpense.category && !EXPENSE_CATEGORIES.includes(editingExpense.category)
        ? [...EXPENSE_CATEGORIES, editingExpense.category]
        : EXPENSE_CATEGORIES,
    [editingExpense],
  );

  // Meses presentes en los datos (YYYY-MM), el más reciente primero
  const months = useMemo(
    () =>
      Array.from(new Set(expenses.map(e => e.expense_date.slice(0, 7))))
        .filter(m => /^\d{4}-\d{2}$/.test(m))
        .sort()
        .reverse(),
    [expenses],
  );
  const activeMonth = months.includes(monthFilter) ? monthFilter : '';

  const visibleExpenses = useMemo(
    () =>
      expenses
        .filter(e => !activeMonth || e.expense_date.startsWith(activeMonth))
        .sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
    [expenses, activeMonth],
  );

  const totals = useMemo(
    () => ({
      ars: visibleExpenses.reduce((sum, e) => sum + e.amount_ars, 0),
      usd: visibleExpenses.reduce((sum, e) => sum + e.amount_usd, 0),
    }),
    [visibleExpenses],
  );

  const amountValue = Number(watch('amountARS'));
  const rateValue = Number(watch('exchangeRate'));
  const usdPreview = amountValue > 0 && rateValue > 0 ? toUSD(amountValue, rateValue) : null;
  const editingRateInferred = editingExpense !== null && !(editingExpense.exchange_rate > 0);
  let hint: { text: string; className: string };
  if (editingStoredRate && rateValue === editingStoredRate) {
    hint = {
      text: editingRateInferred
        ? 'Cotización estimada a partir de los montos guardados'
        : 'Cotización con la que se guardó este gasto',
      className: 'text-gray-500',
    };
  } else if (rateValue > 0 && rateValue !== liveRate && rateStatus !== 'loading') {
    hint = { text: 'Cotización ingresada a mano', className: 'text-gray-500' };
  } else {
    hint = rateHint(rateStatus, fetchedAt);
  }

  return (
    <div className="bg-white shadow rounded-lg p-4 sm:p-6">
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

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Gestión de Gastos</h2>
        <button
          onClick={openNewForm}
          className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Registrar nuevo gasto
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className="mb-8 p-4 sm:p-6 bg-gray-50 rounded-lg scroll-mt-20">
          <h3 className="text-lg font-semibold mb-4">{editingExpense ? 'Editar gasto' : 'Nuevo Gasto'}</h3>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="expense-date" className="block text-sm font-medium text-gray-700">Fecha</label>
                <input
                  id="expense-date"
                  type="date"
                  {...register('expenseDate', { required: 'La fecha es requerida' })}
                  className={inputClass(!!formErrors.expenseDate)}
                />
                <FieldError message={formErrors.expenseDate?.message} />
              </div>
              <div>
                <label htmlFor="expense-category" className="block text-sm font-medium text-gray-700">Categoría</label>
                <select
                  id="expense-category"
                  {...register('category', { required: 'La categoría es requerida' })}
                  className={inputClass(!!formErrors.category)}
                >
                  <option value="">Seleccione una categoría</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <FieldError message={formErrors.category?.message} />
              </div>
              <div>
                <label htmlFor="expense-amount" className="block text-sm font-medium text-gray-700">Monto (ARS)</label>
                <input
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  {...register('amountARS', {
                    required: 'El monto es requerido',
                    validate: v => (Number.isFinite(Number(v)) && Number(v) >= 0) || 'El monto no puede ser negativo',
                  })}
                  className={inputClass(!!formErrors.amountARS)}
                />
                <FieldError message={formErrors.amountARS?.message} />
                {usdPreview !== null && (
                  <p className="mt-1 text-sm text-gray-500">≈ USD {formatMoney(usdPreview)}</p>
                )}
              </div>
              <div>
                <label htmlFor="expense-rate" className="block text-sm font-medium text-gray-700">
                  Tipo de cambio (ARS por USD)
                </label>
                <input
                  id="expense-rate"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  {...register('exchangeRate', {
                    required: 'El tipo de cambio es requerido',
                    validate: v => Number(v) > 0 || 'El tipo de cambio debe ser mayor a 0',
                    onChange: () => {
                      followLiveRate.current = false;
                    },
                  })}
                  className={inputClass(!!formErrors.exchangeRate)}
                />
                <FieldError message={formErrors.exchangeRate?.message} />
                <p className={`mt-1 text-sm ${hint.className}`}>{hint.text}</p>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="expense-description" className="block text-sm font-medium text-gray-700">Descripción</label>
                <input
                  id="expense-description"
                  type="text"
                  {...register('description')}
                  className={inputClass(false)}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {editingExpense
                  ? (saving ? 'Guardando...' : 'Guardar cambios')
                  : (saving ? 'Registrando...' : 'Registrar Gasto')}
              </button>
            </div>
          </form>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <label htmlFor="expense-month" className="text-sm font-medium text-gray-700">Mes</label>
            <select
              id="expense-month"
              value={activeMonth}
              onChange={e => setMonthFilter(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1.5"
            >
              <option value="">Todos los meses</option>
              {months.map(m => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
          <p className="text-sm text-gray-700">
            <span className="text-gray-500">
              {visibleExpenses.length} {visibleExpenses.length === 1 ? 'gasto' : 'gastos'} ·{' '}
            </span>
            <span className="font-semibold">Total: ARS {formatMoney(totals.ars)}</span>
            <span className="text-gray-500"> (≈ USD {formatMoney(totals.usd)})</span>
          </p>
        </div>
      )}

      {/* Celular: tarjetas */}
      <ul className="md:hidden space-y-3">
        {visibleExpenses.map((expense) => (
          <li key={expense.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-500">{formatDate(expense.expense_date)}</p>
                <p className="font-medium text-gray-900">{expense.category}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-gray-900">ARS {formatMoney(expense.amount_ars)}</p>
                {expense.amount_usd > 0 && (
                  <p className="text-xs text-gray-400">≈ USD {formatMoney(expense.amount_usd)}</p>
                )}
              </div>
            </div>
            {expense.description && (
              <p className="mt-2 text-sm text-gray-600 break-words">{expense.description}</p>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end gap-5">
              <button
                onClick={() => startEdit(expense)}
                className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-900"
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Editar
              </button>
              <button
                onClick={() => handleDelete(expense.id)}
                className="flex items-center text-sm font-medium text-red-600 hover:text-red-900"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar
              </button>
            </div>
          </li>
        ))}
        {visibleExpenses.length === 0 && (
          <li className="py-8 text-center text-gray-500">
            {listLoading ? 'Cargando gastos...' : 'No hay gastos registrados'}
          </li>
        )}
      </ul>

      {/* Escritorio: tabla */}
      <div className="hidden md:block overflow-x-auto">
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
            {visibleExpenses.map((expense) => (
              <tr key={expense.id}>
                <td className="px-6 py-4 whitespace-nowrap">{formatDate(expense.expense_date)}</td>
                <td className="px-6 py-4 whitespace-nowrap">{expense.category}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  ARS {formatMoney(expense.amount_ars)}
                  {expense.amount_usd > 0 && (
                    <span className="block text-xs text-gray-400">≈ USD {formatMoney(expense.amount_usd)}</span>
                  )}
                </td>
                <td className="px-6 py-4 max-w-xs truncate" title={expense.description}>{expense.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => startEdit(expense)}
                    className="text-indigo-600 hover:text-indigo-900"
                    title="Editar gasto"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
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
            {visibleExpenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  {listLoading ? 'Cargando gastos...' : 'No hay gastos registrados'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
