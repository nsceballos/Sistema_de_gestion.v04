import { Router } from 'express';
import { SHEET_NAMES, getRows, appendRow, updateRowById, deleteRowById } from '../sheets.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  normalizeReceiptInput,
  parseReceipt,
  sortReceipts,
  findLatestReceipt,
  nextReceiptNumber,
  getReceiptStartNumber,
  findReceiptByNumber,
  buildDuplicateReceiptResponse,
} from '../validation.js';

const router = Router();
router.use(authenticateToken);

// GET /api/receipts
router.get('/', async (req, res) => {
  try {
    const rows = await getRows(SHEET_NAMES.RECEIPTS);
    return res.json(sortReceipts(rows.map(parseReceipt)));
  } catch (error) {
    console.error('Error al obtener recibos:', error);
    return res.status(500).json({ message: 'Error al cargar los recibos' });
  }
});

// GET /api/receipts/next — va antes de las rutas /:id
// Próximo número a emitir y datos del hospedaje del último recibo (para no volver a escribirlos)
router.get('/next', async (req, res) => {
  try {
    const receipts = (await getRows(SHEET_NAMES.RECEIPTS)).map(parseReceipt);
    const latest = findLatestReceipt(receipts);
    // El número cambia con cada recibo: que ningún caché lo devuelva viejo
    res.set('Cache-Control', 'no-store');
    return res.json({
      number: nextReceiptNumber(receipts, getReceiptStartNumber()),
      holder: {
        holder_name: latest?.holder_name ?? '',
        holder_phone: latest?.holder_phone ?? '',
        holder_address: latest?.holder_address ?? '',
      },
    });
  } catch (error) {
    console.error('Error al calcular el próximo número de recibo:', error);
    return res.status(500).json({ message: 'Error al calcular el próximo número de recibo' });
  }
});

// POST /api/receipts
router.post('/', async (req, res) => {
  try {
    const { error, value } = normalizeReceiptInput(req.body);
    if (error) return res.status(400).json({ message: error });

    // Sin número se asigna el próximo; con número, no puede estar usado
    const existing = await getRows(SHEET_NAMES.RECEIPTS);
    const number = value.number ?? nextReceiptNumber(existing, getReceiptStartNumber());
    if (findReceiptByNumber(existing, number)) {
      return res.status(409).json(buildDuplicateReceiptResponse(number));
    }

    const now = new Date().toISOString();
    const newReceipt = {
      id: crypto.randomUUID(),
      ...value,
      number,
      created_at: now,
      updated_at: now,
    };

    await appendRow(SHEET_NAMES.RECEIPTS, newReceipt);

    // Dos pedidos simultáneos pueden haber tomado el mismo número sin verse entre sí: se vuelve a
    // leer la hoja y el que quedó segundo borra su fila y avisa. Los dos llegan a la misma
    // conclusión porque se queda con el número la primera fila en el orden de la hoja.
    const afterAppend = await getRows(SHEET_NAMES.RECEIPTS);
    const owner = findReceiptByNumber(afterAppend, number);
    if (owner && owner.id !== newReceipt.id) {
      await deleteRowById(SHEET_NAMES.RECEIPTS, newReceipt.id);
      return res.status(409).json(buildDuplicateReceiptResponse(number));
    }

    return res.status(201).json(parseReceipt(newReceipt));
  } catch (error) {
    console.error('Error al crear recibo:', error);
    return res.status(500).json({ message: 'Error al registrar el recibo' });
  }
});

// PUT /api/receipts/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = normalizeReceiptInput(req.body);
    if (error) return res.status(400).json({ message: error });

    const existing = await getRows(SHEET_NAMES.RECEIPTS);
    if (!existing.some(r => r.id === id)) {
      return res.status(404).json({ message: 'Recibo no encontrado' });
    }

    // El número se puede cambiar, pero no puede coincidir con el de OTRO recibo.
    // Si el cliente no lo manda, el recibo conserva el suyo.
    if (value.number !== undefined && findReceiptByNumber(existing, value.number, { excludeId: id })) {
      return res.status(409).json(buildDuplicateReceiptResponse(value.number));
    }

    const changes = { ...value, updated_at: new Date().toISOString() };

    const updated = await updateRowById(SHEET_NAMES.RECEIPTS, id, changes);
    if (!updated) {
      return res.status(404).json({ message: 'Recibo no encontrado' });
    }
    return res.json(parseReceipt(updated));
  } catch (error) {
    console.error('Error al actualizar recibo:', error);
    return res.status(500).json({ message: 'Error al actualizar el recibo' });
  }
});

// DELETE /api/receipts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteRowById(SHEET_NAMES.RECEIPTS, id);
    if (!success) {
      return res.status(404).json({ message: 'Recibo no encontrado' });
    }
    return res.json({ message: 'Recibo eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar recibo:', error);
    return res.status(500).json({ message: 'Error al eliminar el recibo' });
  }
});

export default router;
