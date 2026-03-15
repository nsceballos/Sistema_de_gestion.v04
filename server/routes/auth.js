import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { SHEET_NAMES, getRows, appendRow, findRowByField } from '../sheets.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Check if user already exists
    const existingUser = await findRowByField(SHEET_NAMES.USERS, 'email', email.toLowerCase().trim());
    if (existingUser) {
      return res.status(409).json({ message: 'Ya existe una cuenta con este correo electrónico' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: crypto.randomUUID(),
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };

    await appendRow(SHEET_NAMES.USERS, newUser);

    const token = generateToken(newUser);
    return res.status(201).json({
      token,
      user: { id: newUser.id, email: newUser.email },
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    const user = await findRowByField(SHEET_NAMES.USERS, 'email', email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }

    const token = generateToken(user);
    return res.json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// GET /api/auth/me  — verifica sesión activa
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No autenticado' });

  try {
    const { default: jwt } = await import('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto_en_produccion';
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ user: { id: decoded.id, email: decoded.email } });
  } catch {
    return res.status(401).json({ message: 'Token inválido' });
  }
});

export default router;
