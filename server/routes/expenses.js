import { Router } from 'express';
import { SHEET_NAMES, getRows, appendRow, updateRowById, deleteRowById } from '../sheets.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  normalizeExpenseInput,
  omitAbsentFields,
  EXPENSE_FIELDS_KEPT_IF_ABSENT,
  parseExpense,
} from '../validation.js';

const router = Router();
router.use(authenticateToken);

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    const rows = await getRows(SHEET_NAMES.EXPENSES);
    const expenses = rows
      .map(parseExpense)
      .sort((a, b) => new Date(b.expense_date || 0) - new Date(a.expense_date || 0));
    return res.json(expenses);
  } catch (error) {
    console.error('Error al obtener gastos:', error);
    return res.status(500).json({ message: 'Error al cargar los gastos' });
  }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const { error, value } = normalizeExpenseInput(req.body);
    if (error) return res.status(400).json({ message: error });

    const newExpense = {
      id: crypto.randomUUID(),
      ...value,
      created_at: new Date().toISOString(),
    };

    await appendRow(SHEET_NAMES.EXPENSES, newExpense);
    return res.status(201).json(parseExpense(newExpense));
  } catch (error) {
    console.error('Error al crear gasto:', error);
    return res.status(500).json({ message: 'Error al registrar el gasto' });
  }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = normalizeExpenseInput(req.body);
    if (error) return res.status(400).json({ message: error });

    // Si el cliente no manda el tipo de cambio, se conserva el guardado
    const changes = omitAbsentFields(value, req.body, EXPENSE_FIELDS_KEPT_IF_ABSENT);

    const updated = await updateRowById(SHEET_NAMES.EXPENSES, id, changes);
    if (!updated) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }
    return res.json(parseExpense(updated));
  } catch (error) {
    console.error('Error al actualizar gasto:', error);
    return res.status(500).json({ message: 'Error al actualizar el gasto' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteRowById(SHEET_NAMES.EXPENSES, id);
    if (!success) {
      return res.status(404).json({ message: 'Gasto no encontrado' });
    }
    return res.json({ message: 'Gasto eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar gasto:', error);
    return res.status(500).json({ message: 'Error al eliminar el gasto' });
  }
});

// GET /api/expenses/monthly-summary
router.get('/monthly-summary', async (req, res) => {
  try {
    const rows = await getRows(SHEET_NAMES.EXPENSES);
    return res.json(rows.map(parseExpense));
  } catch (error) {
    console.error('Error al obtener resumen mensual de gastos:', error);
    return res.status(500).json({ message: 'Error al cargar datos' });
  }
});

export default router;
