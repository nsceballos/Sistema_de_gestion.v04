import { Router } from 'express';
import { SHEET_NAMES, getRows, appendRow, updateRowById, deleteRowById } from '../sheets.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  normalizeGuestInput,
  omitAbsentFields,
  GUEST_FIELDS_KEPT_IF_ABSENT,
  findOverlap,
  buildOverlapResponse,
  computeBalances,
} from '../validation.js';

const router = Router();
router.use(authenticateToken);

// Ordenar por check_in_date descendente
function sortByCheckIn(rows) {
  return rows.sort((a, b) => {
    const dateA = new Date(a.check_in_date || 0);
    const dateB = new Date(b.check_in_date || 0);
    return dateB - dateA;
  });
}

// GET /api/guests
router.get('/', async (req, res) => {
  try {
    const rows = await getRows(SHEET_NAMES.GUESTS);
    const guests = sortByCheckIn(rows).map(computeBalances);
    return res.json(guests);
  } catch (error) {
    console.error('Error al obtener huéspedes:', error);
    return res.status(500).json({ message: 'Error al cargar las reservas' });
  }
});

// POST /api/guests
router.post('/', async (req, res) => {
  try {
    const { error, value } = normalizeGuestInput(req.body);
    if (error) return res.status(400).json({ message: error });

    // Detectar reservas superpuestas en la misma cabaña
    const existing = await getRows(SHEET_NAMES.GUESTS);
    const conflict = findOverlap(value, existing);
    if (conflict && req.body?.allow_overlap !== true) {
      return res.status(409).json(buildOverlapResponse(conflict));
    }

    const now = new Date().toISOString();
    const guestId = crypto.randomUUID();
    const newGuest = {
      id: guestId,
      ...value,
      created_at: now,
      updated_at: now,
    };

    await appendRow(SHEET_NAMES.GUESTS, newGuest);

    // Create associated reservation
    const reservationId = crypto.randomUUID();
    await appendRow(SHEET_NAMES.RESERVATIONS, {
      id: reservationId,
      guest_id: guestId,
      status: 'Confirmada',
      notification_sent: 'false',
      created_at: now,
      updated_at: now,
    });

    return res.status(201).json(computeBalances(newGuest));
  } catch (error) {
    console.error('Error al crear huésped:', error);
    return res.status(500).json({ message: 'Error al registrar la reserva' });
  }
});

// PUT /api/guests/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = normalizeGuestInput(req.body);
    if (error) return res.status(400).json({ message: error });

    const existing = await getRows(SHEET_NAMES.GUESTS);
    if (!existing.some(g => g.id === id)) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    // Detectar superposición con OTRAS reservas de la misma cabaña
    const conflict = findOverlap(value, existing, { excludeId: id });
    if (conflict && req.body?.allow_overlap !== true) {
      return res.status(409).json(buildOverlapResponse(conflict));
    }

    // Si el cliente no manda nombre/canal/tipo de cambio, se conservan los valores guardados
    const changes = {
      ...omitAbsentFields(value, req.body, GUEST_FIELDS_KEPT_IF_ABSENT),
      updated_at: new Date().toISOString(),
    };

    const updated = await updateRowById(SHEET_NAMES.GUESTS, id, changes);
    if (!updated) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }
    return res.json(computeBalances(updated));
  } catch (error) {
    console.error('Error al actualizar huésped:', error);
    return res.status(500).json({ message: 'Error al actualizar la reserva' });
  }
});

// DELETE /api/guests/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete associated reservations first
    const reservations = await getRows(SHEET_NAMES.RESERVATIONS);
    const relatedReservations = reservations.filter(r => r.guest_id === id);
    for (const reservation of relatedReservations) {
      await deleteRowById(SHEET_NAMES.RESERVATIONS, reservation.id);
    }

    const success = await deleteRowById(SHEET_NAMES.GUESTS, id);
    if (!success) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }
    return res.json({ message: 'Reserva eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar huésped:', error);
    return res.status(500).json({ message: 'Error al eliminar la reserva' });
  }
});

export default router;
