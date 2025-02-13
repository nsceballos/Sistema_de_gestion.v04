import { format } from 'date-fns';
import { supabase } from './supabase';

function escapeText(text: string): string {
  return text
    .replace(/[\\;,]/g, '\\$&')
    .replace(/\n/g, '\\n');
}

export async function generateICalFeed(cabinNumber: number): Promise<string> {
  try {
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select(`
        id,
        guest:guests (
          check_in_date,
          check_out_date,
          cabin_number
        )
      `)
      .eq('guest.cabin_number', cabinNumber)
      .gte('guest.check_in_date', new Date().toISOString());

    if (error) throw error;

    const events = reservations?.map(reservation => {
      const startDate = format(new Date(reservation.guest.check_in_date), "yyyyMMdd'T'HHmmss'Z'");
      const endDate = format(new Date(reservation.guest.check_out_date), "yyyyMMdd'T'HHmmss'Z'");
      
      return `BEGIN:VEVENT
UID:${reservation.id}
DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${escapeText(`Reserva Cabaña ${cabinNumber}`)}
STATUS:CONFIRMED
END:VEVENT`;
    }).join('\n') || '';

    const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Gestión Encantos//Calendario de Reservas//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Reservas Cabaña ${cabinNumber}
X-WR-TIMEZONE:America/Argentina/Buenos_Aires
${events}
END:VCALENDAR`;

    return calendar;
  } catch (error) {
    console.error('Error al generar feed iCal:', error);
    throw error;
  }
}