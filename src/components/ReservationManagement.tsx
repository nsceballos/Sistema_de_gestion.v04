import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { guestsApi, type Guest } from '../lib/api';
import ReservationCalendar from './ReservationCalendar';
import { useForm } from 'react-hook-form';

interface GuestFormData {
  checkInDate: string;
  checkOutDate: string;
  numGuests: number;
  phoneNumber: string;
  totalAmountARS: number;
  depositARS: number;
  cabinNumber: number;
  comments: string;
}

interface EditingGuest extends GuestFormData {
  id: string;
}

const formatNumber = (value: number): string =>
  value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReservationManagement() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGuest, setEditingGuest] = useState<EditingGuest | null>(null);
  const [calendarView, setCalendarView] = useState<'list' | 'calendar'>('list');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const { register, handleSubmit, reset, setValue } = useForm<GuestFormData>();
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchExchangeRate();
    fetchGuests();
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

  const calculateUSDAmount = (arsAmount: number) => {
    if (!exchangeRate) return 0;
    return Number((arsAmount / exchangeRate).toFixed(2));
  };

  const fetchGuests = async () => {
    try {
      setError(null);
      const data = await guestsApi.getAll();
      setGuests(data);
    } catch {
      setError('Error al cargar las reservas. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: GuestFormData) => {
    setLoading(true);
    setError(null);
    try {
      const checkIn = new Date(data.checkInDate);
      const checkOut = new Date(data.checkOutDate);
      const numNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      const totalAmountUSD = calculateUSDAmount(Number(data.totalAmountARS));
      const depositUSD = calculateUSDAmount(Number(data.depositARS));

      const payload = {
        check_in_date: data.checkInDate,
        check_out_date: data.checkOutDate,
        num_guests: Number(data.numGuests),
        num_nights: numNights,
        phone_number: data.phoneNumber,
        total_amount_usd: totalAmountUSD,
        total_amount_ars: Number(data.totalAmountARS),
        deposit_usd: depositUSD,
        deposit_ars: Number(data.depositARS),
        cabin_number: Number(data.cabinNumber),
        comments: data.comments || '',
      };

      if (editingGuest) {
        await guestsApi.update(editingGuest.id, payload);
        setEditingGuest(null);
        setSuccessMessage('¡Reserva actualizada exitosamente!');
      } else {
        await guestsApi.create(payload);
        setSuccessMessage('¡Reserva registrada exitosamente!');
      }

      reset();
      setShowForm(false);
      await fetchGuests();
    } catch (err: any) {
      setError(err.message || 'Error al procesar la reserva. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteInProgress) return;
    if (!window.confirm('¿Está seguro que desea eliminar esta reserva?')) return;

    setDeleteInProgress(true);
    setError(null);
    try {
      await guestsApi.delete(id);
      setGuests(prev => prev.filter(g => g.id !== id));
      setSuccessMessage('Reserva eliminada exitosamente');
    } catch (err: any) {
      setError(err.message || 'Error al eliminar la reserva');
      await fetchGuests();
    } finally {
      setDeleteInProgress(false);
    }
  };

  const startEditing = (guest: Guest) => {
    setEditingGuest({
      id: guest.id,
      checkInDate: guest.check_in_date,
      checkOutDate: guest.check_out_date,
      numGuests: guest.num_guests,
      phoneNumber: guest.phone_number,
      totalAmountARS: guest.total_amount_ars,
      depositARS: guest.deposit_ars,
      cabinNumber: guest.cabin_number,
      comments: guest.comments || '',
    });
    setShowForm(true);
    (Object.entries({
      checkInDate: guest.check_in_date,
      checkOutDate: guest.check_out_date,
      numGuests: guest.num_guests,
      phoneNumber: guest.phone_number,
      totalAmountARS: guest.total_amount_ars,
      depositARS: guest.deposit_ars,
      cabinNumber: guest.cabin_number,
      comments: guest.comments || '',
    }) as [keyof GuestFormData, any][]).forEach(([key, value]) => setValue(key, value));
  };

  const sendWhatsAppNotification = (phoneNumber: string) => {
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    const message = `Hola! Los esperamos hoy para su reserva. Me pueden ir avisando antes de llegar para poder recibirlos.
Al lado de la cabaña viven los encargados y ellos los van a estar recibiendo cuando lleguen.

Check-in: a partir de las 14hs
Check-out: hasta las 11hs

Ubicación de Maps: https://maps.app.goo.gl/oUwTkRov6mbKoNZY9`;
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (loading && guests.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

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
        <h2 className="text-2xl font-bold">Gestión de Reservas</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            {editingGuest ? 'Editar reserva' : 'Nueva reserva'}
          </button>
          <button
            onClick={() => setCalendarView(v => v === 'list' ? 'calendar' : 'list')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            {calendarView === 'list' ? 'Ver calendario' : 'Ver lista'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-8 p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">
            {editingGuest ? 'Editar Reserva' : 'Nueva Reserva'}
          </h3>
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
                <label className="block text-sm font-medium text-gray-700">Cabaña</label>
                <select
                  {...register('cabinNumber', { required: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value={1}>Cabaña 1</option>
                  <option value={2}>Cabaña 2</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha de Entrada</label>
                <input
                  type="date"
                  {...register('checkInDate', { required: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha de Salida</label>
                <input
                  type="date"
                  {...register('checkOutDate', { required: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Número de Huéspedes</label>
                <input
                  type="number"
                  {...register('numGuests', { required: true, min: 1 })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input
                  type="tel"
                  {...register('phoneNumber', { required: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Monto Total (ARS)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('totalAmountARS', { required: true, min: 0 })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Seña (ARS)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('depositARS', { required: true, min: 0 })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Comentarios</label>
                <textarea
                  {...register('comments')}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingGuest(null); reset(); }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Procesando...' : editingGuest ? 'Guardar cambios' : 'Registrar reserva'}
              </button>
            </div>
          </form>
        </div>
      )}

      {calendarView === 'calendar' ? (
        <ReservationCalendar
          reservations={guests.map(guest => ({
            id: guest.id,
            guest: {
              check_in_date: guest.check_in_date,
              check_out_date: guest.check_out_date,
              cabin_number: guest.cabin_number,
            },
          }))}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Cabaña', 'Entrada', 'Salida', 'Noches', 'Huéspedes', 'Total (ARS)', 'Seña (ARS)', 'Saldo (ARS)', 'Acciones'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {guests.map((guest) => (
                <tr key={guest.id}>
                  <td className="px-6 py-4 whitespace-nowrap">Cabaña {guest.cabin_number}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {format(parseISO(guest.check_in_date), 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {format(parseISO(guest.check_out_date), 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{guest.num_nights}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{guest.num_guests}</td>
                  <td className="px-6 py-4 whitespace-nowrap">ARS {formatNumber(guest.total_amount_ars)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">ARS {formatNumber(guest.deposit_ars)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">ARS {formatNumber(guest.balance_ars)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => startEditing(guest)}
                      className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                      title="Editar reserva"
                      disabled={deleteInProgress}
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(guest.id)}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      title="Eliminar reserva"
                      disabled={deleteInProgress}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => sendWhatsAppNotification(guest.phone_number)}
                      className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                      title="Enviar recordatorio"
                      disabled={deleteInProgress}
                    >
                      Enviar Recordatorio
                    </button>
                  </td>
                </tr>
              ))}
              {guests.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No hay reservas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
