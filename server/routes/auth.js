import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { SHEET_NAMES, getRows, appendRow } from '../sheets.js';
import { authenticateToken, generateToken, getJwtSecret, handleJwtConfigError } from '../middleware/auth.js';
import { normalizeEmail, parseAllowedEmails, isRegistrationAllowed } from '../validation.js';

const router = Router();

const REGISTRATION_DISABLED_MESSAGE =
  'El registro de cuentas nuevas está deshabilitado. Si ya tenés cuenta, iniciá sesión. ' +
  'Para habilitar este email, el administrador tiene que agregarlo a la variable de entorno ' +
  'ALLOWED_EMAILS en Vercel (varios emails separados por comas) y volver a desplegar.';

function hasContent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'El email no es válido' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Verificar la configuración antes de crear el usuario
    getJwtSecret();

    const users = (await getRows(SHEET_NAMES.USERS)).filter(u => hasContent(u.email) || hasContent(u.id));

    // Sólo se permite la primera cuenta o emails autorizados en ALLOWED_EMAILS
    const allowed = isRegistrationAllowed({
      email: normalizedEmail,
      existingUserCount: users.length,
      allowedEmails: parseAllowedEmails(process.env.ALLOWED_EMAILS),
    });
    if (!allowed) {
      return res.status(403).json({ message: REGISTRATION_DISABLED_MESSAGE });
    }

    if (users.some(u => normalizeEmail(u.email) === normalizedEmail)) {
      return res.status(409).json({ message: 'Ya existe una cuenta con este correo electrónico' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
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
    if (handleJwtConfigError(error, res)) return;
    console.error('Error al registrar usuario:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    // Verificar la configuración antes de consultar la planilla
    getJwtSecret();

    const normalizedEmail = normalizeEmail(email);
    const users = await getRows(SHEET_NAMES.USERS);
    const user = users.find(u => normalizeEmail(u.email) === normalizedEmail);
    if (!user || !user.password_hash) {
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
    if (handleJwtConfigError(error, res)) return;
    console.error('Error al iniciar sesión:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// GET /api/auth/me  — verifica sesión activa
router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: { id: req.user.id, email: req.user.email } });
});

export default router;
