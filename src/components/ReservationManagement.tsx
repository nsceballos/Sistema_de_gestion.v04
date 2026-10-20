import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { ApiError, guestsApi, type Guest, type GuestPayload } from '../lib/api';
import { errorMessage } from '../lib/format';
import { getReservationStatus, todayISO } from '../lib/reservations';
import ReservationCalendar from './ReservationCalendar';
import ListToolbar from './reservations/ListToolbar';
import ReservationCards from './reservations/ReservationCards';
import ReservationForm from './reservations/ReservationForm';
import ReservationTable from './reservations/ReservationTable';
import type { ReservationFilter } from './reservations/statusStyles';

interface Props {
  /** Abre la pantalla de recibos con esta reserva elegida */
  onCreateReceipt?: (guest: Guest) => void;
}

export default function ReservationManagement({ onCreateReceipt }: Props) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  /** Cambia cada vez que se abre el formulario (nueva / editar): lo remonta con valores limpios y dispara el scroll */
  const [formKey, setFormKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<ReservationFilter>('all');
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const today = todayISO();

  const fetchGuests = useCallback(async () => {
    try {
      setError(null);
      setGuests(await guestsApi.getAll());
    } catch (err) {
      setError(errorMessage(err, 'Error al cargar las reservas. Por favor intente nuevamente.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGuests();
  }, [fetchGuests]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Al abrir el formulario (nueva o editar) se lleva la vista hasta él; scroll-mt deja lugar al header fijo
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm, formKey]);

  const counts = useMemo(() => {
    const result: Record<ReservationFilter, number> = { all: guests.length, upcoming: 0, ongoing: 0, past: 0 };
    for (const guest of guests) result[getReservationStatus(guest, today)] += 1;
    return result;
  }, [guests, today]);

  // El servidor ya devuelve las reservas ordenadas por entrada descendente
  const visibleGuests = useMemo(
    () => (filter === 'all' ? guests : guests.filter((guest) => getReservationStatus(guest, today) === filter)),
    [guests, filter, today],
  );

  const openForm = (guest: Guest | null) => {
    setEditingGuest(guest);
    setFormError(null);
    setShowForm(true);
    setFormKey((key) => key + 1);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingGuest(null);
    setFormError(null);
  };

  const handleSave = async (payload: GuestPayload) => {
    setSaving(true);
    setFormError(null);
    const send = (data: GuestPayload) =>
      editingGuest ? guestsApi.update(editingGuest.id, data) : guestsApi.create(data);

    try {
      try {
        await send(payload);
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== 'OVERLAP') throw err;
        // Superposición con otra reserva de la cabaña: el usuario decide si guarda igual
        if (!window.confirm(`${err.message}\n\n¿Guardar de todos modos?`)) return;
        await send({ ...payload, allow_overlap: true });
      }

      setSuccessMessage(editingGuest ? '¡Reserva actualizada exitosamente!' : '¡Reserva registrada exitosamente!');
      closeForm();
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await fetchGuests();
    } catch (err) {
      setFormError(errorMessage(err, 'Error al procesar la reserva. Por favor intente nuevamente.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteInProgress) return;
    if (!window.confirm('¿Está seguro que desea eliminar esta reserva?')) return;

    setDeleteInProgress(true);
    setError(null);
    try {
      await guestsApi.delete(id);
      setGuests((prev) => prev.filter((guest) => guest.id !== id));
      if (editingGuest?.id === id) closeForm();
      setSuccessMessage('Reserva eliminada exitosamente');
    } catch (err) {
      setError(errorMessage(err, 'Error al eliminar la reserva'));
      await fetchGuests();
    } finally {
      setDeleteInProgress(false);
    }
  };

  if (loading && guests.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-20 rounded-lg bg-white p-4 shadow sm:p-6">
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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Gestión de Reservas</h2>
        <div className="flex w-full gap-2 sm:w-auto sm:gap-4">
          <button
            type="button"
            onClick={() => openForm(null)}
            className="flex flex-1 items-center justify-center whitespace-nowrap rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 sm:flex-none sm:px-4"
          >
            <Plus className="mr-1.5 h-5 w-5 sm:mr-2" />
            Nueva reserva
          </button>
          <button
            type="button"
            onClick={() => setCalendarView((view) => (view === 'list' ? 'calendar' : 'list'))}
            className="flex-1 whitespace-nowrap rounded-md bg-gray-100 px-3 py-2 text-gray-700 hover:bg-gray-200 sm:flex-none sm:px-4"
          >
            {calendarView === 'list' ? 'Ver calendario' : 'Ver lista'}
          </button>
        </div>
      </div>

      {showForm && (
        <div ref={formRef} className="scroll-mt-20">
          <ReservationForm
            key={formKey}
            editing={editingGuest}
            saving={saving}
            error={formError}
            onSubmit={handleSave}
            onCancel={closeForm}
          />
        </div>
      )}

      {calendarView === 'calendar' ? (
        <ReservationCalendar guests={guests} />
      ) : (
        <>
          <ListToolbar filter={filter} onFilterChange={setFilter} counts={counts} />
          {visibleGuests.length === 0 ? (
            <p className="py-8 text-center text-gray-500">
              {guests.length === 0 ? 'No hay reservas registradas' : 'No hay reservas en esta categoría'}
            </p>
          ) : (
            <>
              <ReservationTable
                guests={visibleGuests}
                today={today}
                busy={deleteInProgress}
                onEdit={openForm}
                onDelete={handleDelete}
                onCreateReceipt={onCreateReceipt}
              />
              <ReservationCards
                guests={visibleGuests}
                today={today}
                busy={deleteInProgress}
                onEdit={openForm}
                onDelete={handleDelete}
                onCreateReceipt={onCreateReceipt}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
