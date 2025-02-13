import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ReservationCalendar from './ReservationCalendar';
import { useForm } from 'react-hook-form';

interface Guest {
  id: string;
  check_in_date: string;
  check_out_date: string;
  num_guests: number;
  num_nights: number;
  phone_number: string;
  total_amount_ars: number;
  deposit_ars: number;
  balance_ars: number;
  cabin_number: number;
  comments: string;
}

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

const formatNumber = (value: number): string => {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

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

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

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

  const calculateUSDAmount = (arsAmount: number) => {
    if (!exchangeRate) return 0;
    return Number((arsAmount / exchangeRate).toFixed(2));
  };

  const fetchGuests = async () => {
    try {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('guests')
        .select('*')
        .order('check_in_date', { ascending: false });

      if (fetchError) throw fetchError;
      setGuests(data || []);
    } catch (error) {
      console.error('Error al cargar reservas:', error);
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

      const totalAmountUSD = calculateUSDAmount(data.totalAmountARS);
      const depositUSD = calculateUSDAmount(data.depositARS);

      if (editingGuest) {
        const { error: updateError } = await supabase
          .from('guests')
          .update({
            check_in_date: data.checkInDate,
            check_out_date: data.checkOutDate,
            num_guests: data.numGuests,
            num_nights: numNights,
            phone_number: data.phoneNumber,
            total_amount_usd: totalAmountUSD,
            total_amount_ars: data.totalAmountARS,
            deposit_usd: depositUSD,
            deposit_ars: data.depositARS,
            cabin_number: data.cabinNumber,
            comments: data.comments
          })
          .eq('id', editingGuest.id);

        if (updateError) throw updateError;
        setEditingGuest(null);
        setSuccessMessage('¡Reserva actualizada exitosamente!');
      } else {
        const { data: guestData, error: guestError } = await supabase
          .from('guests')
          .insert({
            check_in_date: data.checkInDate,
            check_out_date: data.checkOutDate,
            num_guests: data.numGuests,
            num_nights: numNights,
            phone_number: data.phoneNumber,
            total_amount_usd: totalAmountUSD,
            total_amount_ars: data.totalAmountARS,
            deposit_usd: depositUSD,
            deposit_ars: data.depositARS,
            cabin_number: data.cabinNumber,
            comments: data.comments
          })
          .select()
          .single();

        if (guestError) throw guestError;

        if (guestData) {
          const { error: reservationError } = await supabase
            .from('reservations')
            .insert({
              guest_id: guestData.id,
              status: 'Confirmada'
            });

          if (reservationError) throw reservationError;
        }
        setSuccessMessage('¡Reserva registrada exitosamente!');
      }
      
      reset();
      setShowForm(false);
      await fetchGuests();
    } catch (error) {
      console.error('Error al procesar reserva:', error);
      setError('Error al procesar la reserva. Por favor intente nuevamente.');
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
      // Delete the guest (cascade will handle reservations)
      const { error: deleteError } = await supabase
        .from('guests')
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw new Error('Error al eliminar la reserva');
      }

      // Update local state immediately
      setGuests(prevGuests => prevGuests.filter(guest => guest.id !== id));
      setSuccessMessage('Reserva eliminada exitosamente');
    } catch (error) {
      console.error('Error al eliminar reserva:', error);
      setError(error instanceof Error ? error.message : 'Error al eliminar la reserva');
      // Refresh the list to ensure we have the correct state
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
      comments: guest.comments || ''
    });

    setShowForm(true);

    Object.entries({
      checkInDate: guest.check_in_date,
      checkOutDate: guest.check_out_date,
      numGuests: guest.num_guests,
      phoneNumber: guest.phone_number,
      totalAmountARS: guest.total_amount_ars,
      depositARS: guest.deposit_ars,
      cabinNumber: guest.cabin_number,
      comments: guest.comments || ''
    }).forEach(([key, value]) => {
      setValue(key as keyof GuestFormData, value);
    });
  };

  const sendWhatsAppNotification = (phoneNumber: string) => {
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    const message = `Hola! Los esperamos hoy para su reserva. Me pueden ir avisando antes de llegar para poder recibirlos.
Al lado de la cabaña viven los encargados y ellos los van a estar recibiendo cuando lleguen.

Check-in: a partir de las 14hs
Check-out: hasta las 11hs

Ubicación de Maps: https://maps.app.goo.gl/oUwTkRov6mbKoNZY9`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank');
  };

  if (loading) {
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
            onClick={() => setCalendarView(view => view === 'list' ? 'calendar' : 'list')}
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
                onClick={() => {
                  setShowForm(false);
                  setEditingGuest(null);
                  reset();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Procesando...' : (editingGuest ? 'Guardar cambios' : 'Registrar reserva')}
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
              cabin_number: guest.cabin_number
            }
          }))}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cabaña
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entrada
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Salida
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Noches
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Huéspedes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total (ARS)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seña (ARS)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Saldo (ARS)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {guests.map((guest) => (
                <tr key={guest.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    Cabaña {guest.cabin_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {format(parseISO(guest.check_in_date), 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {format(parseISO(guest.check_out_date), 'dd MMM yyyy', { locale: es })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {guest.num_nights}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {guest.num_guests}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ARS {formatNumber(guest.total_amount_ars)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ARS {formatNumber(guest.deposit_ars)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ARS {formatNumber(guest.balance_ars)}
                  </td>
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}