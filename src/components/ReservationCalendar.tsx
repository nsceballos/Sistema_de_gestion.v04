import React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
}

interface Props {
  reservations: Array<{
    id: string;
    guest: {
      check_in_date: string;
      check_out_date: string;
      cabin_number: number;
    };
  }>;
}

export default function ReservationCalendar({ reservations }: Props) {
  const events: CalendarEvent[] = reservations.map((reservation) => ({
    id: reservation.id,
    title: `Cabaña ${reservation.guest.cabin_number}`,
    start: reservation.guest.check_in_date,
    end: reservation.guest.check_out_date,
    backgroundColor: reservation.guest.cabin_number === 1 ? '#818cf8' : '#f87171',
    borderColor: reservation.guest.cabin_number === 1 ? '#6366f1' : '#ef4444',
  }));

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="es"
        events={events}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek'
        }}
        buttonText={{
          today: 'Hoy',
          month: 'Mes',
          week: 'Semana'
        }}
        height="auto"
        eventContent={(eventInfo) => (
          <div className="p-1">
            <div className="font-semibold">{eventInfo.event.title}</div>
          </div>
        )}
      />
    </div>
  );
}