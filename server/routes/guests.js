import { Router } from 'express';
import { SHEET_NAMES, getRows, appendRow, updateRowById, deleteRowById } from '../sheets.js';
import { authenticateToken } from '../middleware/auth.js';

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

function computeBalances(guest) {
  const totalARS = parseFloat(guest.total_amount_ars) || 0;
  const depositARS = parseFloat(guest.deposit_ars) || 0;
  const totalUSD = parseFloat(guest.total_amount_usd) || 0;
  const depositUSD = parseFloat(guest.deposit_usd) || 0;
  return {
    ...guest,
    total_amount_ars: totalARS,
    total_amount_usd: totalUSD,
    deposit_ars: depositARS,
    deposit_usd: depositUSD,
    balance_ars: totalARS - depositARS,
    balance_usd: totalUSD - depositUSD,
    num_guests: parseInt(guest.num_guests) || 0,
    num_nights: parseInt(guest.num_nights) || 0,
    cabin_number: parseInt(guest.cabin_number) || 1,
  };
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
    const {
      check_in_date, check_out_date, num_guests, phone_number,
      num_nights, cabin_number, total_amount_usd, total_amount_ars,
      deposit_usd, deposit_ars, comments
    } = req.body;

    const totalARS = parseFloat(total_amount_ars) || 0;
    const depositARS = parseFloat(deposit_ars) || 0;
    const totalUSD = parseFloat(total_amount_usd) || 0;
    const depositUSD = parseFloat(deposit_usd) || 0;

    const now = new Date().toISOString();
    const guestId = crypto.randomUUID();

    const newGuest = {
      id: guestId,
      check_in_date,
      check_out_date,
      num_guests: parseInt(num_guests) || 1,
      phone_number: phone_number || '',
      num_nights: parseInt(num_nights) || 0,
      cabin_number: parseInt(cabin_number) || 1,
      total_amount_usd: totalUSD,
      total_amount_ars: totalARS,
      deposit_usd: depositUSD,
      deposit_ars: depositARS,
      balance_usd: totalUSD - depositUSD,
      balance_ars: totalARS - depositARS,
      comments: comments || '',
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
    const {
      check_in_date, check_out_date, num_guests, phone_number,
      num_nights, cabin_number, total_amount_usd, total_amount_ars,
      deposit_usd, deposit_ars, comments
    } = req.body;

    const totalARS = parseFloat(total_amount_ars) || 0;
    const depositARS = parseFloat(deposit_ars) || 0;
    const totalUSD = parseFloat(total_amount_usd) || 0;
    const depositUSD = parseFloat(deposit_usd) || 0;

    const updated = {
      check_in_date,
      check_out_date,
      num_guests: parseInt(num_guests) || 1,
      phone_number: phone_number || '',
      num_nights: parseInt(num_nights) || 0,
      cabin_number: parseInt(cabin_number) || 1,
      total_amount_usd: totalUSD,
      total_amount_ars: totalARS,
      deposit_usd: depositUSD,
      deposit_ars: depositARS,
      balance_usd: totalUSD - depositUSD,
      balance_ars: totalARS - depositARS,
      comments: comments || '',
      updated_at: new Date().toISOString(),
    };

    const success = await updateRowById(SHEET_NAMES.GUESTS, id, updated);
    if (!success) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }
    return res.json({ id, ...updated });
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
