import { generateICalFeed } from '../../lib/ical';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cabinNumber = parseInt(url.pathname.split('/').pop() || '1');

    if (isNaN(cabinNumber) || cabinNumber < 1 || cabinNumber > 2) {
      return new Response('Número de cabaña inválido', { status: 400 });
    }

    const calendar = await generateICalFeed(cabinNumber);

    return new Response(calendar, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="cabin${cabinNumber}.ics"`,
      },
    });
  } catch (error) {
    console.error('Error en endpoint iCal:', error);
    return new Response('Error interno del servidor', { status: 500 });
  }
}