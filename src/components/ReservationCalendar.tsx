import { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventInput } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import type { Guest } from '../lib/api';
import { getReservationStatus, todayISO } from '../lib/reservations';

interface Props {
  guests: Guest[];
}

const NARROW_QUERY = '(max-width: 640px)';

/** true en pantallas angostas (celular): ahí la barra del calendario se simplifica para que entre */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export default function ReservationCalendar({ guests }: Props) {
  const narrow = useIsNarrow();
  const today = todayISO();

  const events = useMemo<EventInput[]>(
    () =>
      guests.map((guest) => {
        const name = guest.guest_name?.trim();
        const isCabin1 = guest.cabin_number === 1;
        return {
          id: guest.id,
          title: name ? `Cabaña ${guest.cabin_number} · ${name}` : `Cabaña ${guest.cabin_number}`,
          start: guest.check_in_date,
          end: guest.check_out_date,
          backgroundColor: isCabin1 ? '#818cf8' : '#f87171',
          borderColor: isCabin1 ? '#6366f1' : '#ef4444',
          // Las reservas finalizadas se ven atenuadas
          classNames: getReservationStatus(guest, today) === 'past' ? ['opacity-60'] : [],
        };
      }),
    [guests, today],
  );

  return (
    <div className="reservation-calendar">
      <style>{`@media (max-width: 640px) { .reservation-calendar .fc-toolbar-title { font-size: 1.125rem; } }`}</style>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={esLocale}
        events={events}
        headerToolbar={
          narrow
            ? { left: 'prev,next', center: 'title', right: 'today' }
            : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }
        }
        buttonText={{
          today: 'Hoy',
          month: 'Mes',
          week: 'Semana',
        }}
        height="auto"
        eventContent={(eventInfo) => (
          <div className="truncate px-1 font-semibold">{eventInfo.event.title}</div>
        )}
      />
    </div>
  );
}
