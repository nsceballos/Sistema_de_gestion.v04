import express from 'express';
import { getRows, getCalendarConfig, saveCalendarConfig, ensureInitialized, SHEET_NAMES } from '../sheets.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ── iCal helpers ──────────────────────────────────────────────────────────

function toICalDate(dateStr) {
  // "2026-03-20" → "20260320"
  return dateStr.replace(/-/g, '');
}

function generateICS(reservations, cabinNumber) {
  const events = reservations
    .filter((r) => Number(r.cabin_number) === cabinNumber)
    .map((r) => {
      const uid = `${r.id}@gestion-encantos`;
      const dtstart = toICalDate(r.check_in_date);
      const dtend = toICalDate(r.check_out_date);
      return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtend}`,
        `SUMMARY:Reserva Cabaña ${cabinNumber}`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`,
        'END:VEVENT',
      ].join('\r\n');
    });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gestión Encantos//Sistema de Gestión//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Encantos del Valle - Cabaña ${cabinNumber}`,
    'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function parseICS(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const getValue = (key) => {
      const match = block.match(new RegExp(`${key}[^:]*:([^\r\n]+)`));
      return match ? match[1].trim() : null;
    };

    const dtstart = getValue('DTSTART');
    const dtend = getValue('DTEND');
    if (!dtstart || !dtend) continue;

    const parseDate = (d) => {
      const clean = d.replace(/T.*$/, '').replace(/[^0-9]/g, '');
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
    };

    events.push({
      id: getValue('UID') || `ext-${Math.random()}`,
      start: parseDate(dtstart),
      end: parseDate(dtend),
      title: getValue('SUMMARY') || 'Bloqueado',
    });
  }

  return events;
}

// ── Export iCal — público, sin auth (Airbnb/Booking lo consume) ───────────

router.get('/cabin/:cabinId.ics', async (req, res) => {
  try {
    await ensureInitialized();
    const cabinNumber = parseInt(req.params.cabinId, 10);
    if (![1, 2].includes(cabinNumber)) {
      return res.status(404).send('Cabaña no encontrada');
    }

    const reservations = await getRows(SHEET_NAMES.GUESTS);
    const ics = generateICS(reservations, cabinNumber);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="cabin-${cabinNumber}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(ics);
  } catch (err) {
    res.status(500).send('Error al generar el calendario');
  }
});

// ── Proxy para obtener calendarios externos (evita CORS) ──────────────────

router.get('/external', authenticateToken, async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ message: 'URL requerida' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GestionEncantos/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(502).json({
        message: `El calendario externo devolvió error ${response.status}`,
      });
    }

    const text = await response.text();
    const events = parseICS(text);
    res.json(events);
  } catch (err) {
    res.status(502).json({
      message: 'No se pudo obtener el calendario externo: ' + err.message,
    });
  }
});

// ── Configuración de URLs externas ────────────────────────────────────────

router.get('/config', authenticateToken, async (req, res) => {
  try {
    await ensureInitialized();
    const config = await getCalendarConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/config', authenticateToken, async (req, res) => {
  try {
    await ensureInitialized();
    const { cabin1_airbnb, cabin1_booking, cabin2_airbnb, cabin2_booking } = req.body;
    await saveCalendarConfig({ cabin1_airbnb, cabin1_booking, cabin2_airbnb, cabin2_booking });
    res.json({ message: 'Configuración guardada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
