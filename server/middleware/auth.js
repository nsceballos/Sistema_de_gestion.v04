import jwt from 'jsonwebtoken';

// Secreto sólo para desarrollo local, cuando JWT_SECRET no está en el .env
const DEV_FALLBACK_SECRET = 'secreto_solo_para_desarrollo_local_no_usar_en_produccion';

// Valores de ejemplo que aparecen en el repo: en producción cuentan como "no configurado"
const PUBLIC_PLACEHOLDER_SECRETS = new Set([
  'cambiar_este_secreto_en_produccion',
  'cambiar_este_secreto_por_uno_seguro_en_produccion',
  'mi_secreto_super_seguro_2024',
  'pegá_acá_el_valor_generado',
  DEV_FALLBACK_SECRET,
]);

export const JWT_SECRET_MISSING_MESSAGE =
  'JWT_SECRET no está configurado en el servidor (o tiene un valor de ejemplo). ' +
  'Configurá la variable de entorno JWT_SECRET en Vercel (Settings → Environment Variables) ' +
  'con un texto largo y aleatorio, por ejemplo el resultado de `openssl rand -hex 32`, y volvé a desplegar.';

export class JwtConfigError extends Error {
  constructor() {
    super(JWT_SECRET_MISSING_MESSAGE);
    this.name = 'JwtConfigError';
  }
}

let warnedAboutFallback = false;

function isProduction() {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
}

/**
 * Devuelve el secreto para firmar/verificar tokens.
 * En producción (Vercel o NODE_ENV=production) exige JWT_SECRET y lanza JwtConfigError si falta.
 * En desarrollo local usa un secreto de prueba y avisa una sola vez por consola.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const configured = typeof secret === 'string' && secret.trim() !== '';

  if (isProduction()) {
    if (!configured || PUBLIC_PLACEHOLDER_SECRETS.has(secret.trim())) throw new JwtConfigError();
    return secret;
  }

  if (configured) return secret;
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn('Atención: JWT_SECRET no está configurado: se usa un secreto de desarrollo. Configurá JWT_SECRET en el .env antes de publicar.');
  }
  return DEV_FALLBACK_SECRET;
}

/** Responde 500 con el mensaje de configuración si el error es de JWT_SECRET. Devuelve true si respondió. */
export function handleJwtConfigError(err, res) {
  if (err instanceof JwtConfigError) {
    console.error(err.message);
    res.status(500).json({ message: err.message });
    return true;
  }
  return false;
}

function getBearerToken(req) {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.trim().split(/\s+/);
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

/**
 * Middleware: exige un token válido. Sin token o con token inválido/vencido → 401
 * (el frontend vuelve al login). Sin JWT_SECRET en producción → 500 con instrucciones.
 */
export function authenticateToken(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    if (handleJwtConfigError(err, res)) return;
    throw err;
  }

  try {
    req.user = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Tu sesión venció o no es válida. Iniciá sesión de nuevo.' });
  }
  return next();
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    getJwtSecret(),
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}
