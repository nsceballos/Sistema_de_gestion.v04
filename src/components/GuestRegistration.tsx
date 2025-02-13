import React from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/supabase';

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

export default function GuestRegistration() {
  const { register, handleSubmit, reset, watch, setValue } = useForm<GuestFormData>();
  const [loading, setLoading] = React.useState(false);
  const [exchangeRate, setExchangeRate] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetchExchangeRate();
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

  // Calcular montos en USD basados en ARS
  const calculateUSDAmount = (arsAmount: number) => {
    if (!exchangeRate) return 0;
    return Number((arsAmount / exchangeRate).toFixed(2));
  };

  // Observar cambios en los montos ARS
  const totalAmountARS = watch('totalAmountARS');
  const depositARS = watch('depositARS');

  const onSubmit = async (data: GuestFormData) => {
    setLoading(true);
    try {
      const checkIn = new Date(data.checkInDate);
      const checkOut = new Date(data.checkOutDate);
      const numNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      const totalAmountUSD = calculateUSDAmount(data.totalAmountARS);
      const depositUSD = calculateUSDAmount(data.depositARS);

      const { data: guestData, error: guestError } = await supabase
        .from('guests')
        .insert({
          check_in_date: data.checkInDate,
          check_out_date: data.checkOutDate,
          num_guests: data.numGuests,
          phone_number: data.phoneNumber,
          num_nights: numNights,
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

      const { error: reservationError } = await supabase
        .from('reservations')
        .insert({
          guest_id: guestData.id,
          status: 'Confirmada'
        });

      if (reservationError) throw reservationError;
      
      reset();
      alert('¡Huésped registrado exitosamente!');
    } catch (error) {
      console.error('Error al registrar huésped:', error);
      alert('Error al registrar huésped. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6">Registro de Huéspedes</h2>
      {exchangeRate && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
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
            <label className="block text-sm font-medium text-gray-700">Monto Total (USD)</label>
            <input
              type="number"
              step="0.01"
              value={calculateUSDAmount(totalAmountARS || 0)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50"
              readOnly
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
          <div>
            <label className="block text-sm font-medium text-gray-700">Seña (USD)</label>
            <input
              type="number"
              step="0.01"
              value={calculateUSDAmount(depositARS || 0)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-gray-50"
              readOnly
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Comentarios</label>
          <textarea
            {...register('comments')}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {loading ? 'Registrando...' : 'Registrar Huésped'}
          </button>
        </div>
      </form>
    </div>
  );
}