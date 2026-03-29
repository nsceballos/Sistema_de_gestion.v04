import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ensureInitialized } from './sheets.js';
import authRoutes from './routes/auth.js';
import guestsRoutes from './routes/guests.js';
import expensesRoutes from './routes/expenses.js';
import calendarRoutes from './routes/calendar.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Asegurar inicialización de Google Sheets antes de cada request a la API
// (excluye /api/health para que el health check funcione siempre)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    const isGooglePermissionsError = err.status === 403 || (err.message && err.message.includes('does not have permission'));
    const isApiNotEnabled = err.message && err.message.includes('API has not been used');

    let userMessage = 'Servicio no disponible: no se pudo conectar con Google Sheets.';
    if (isGooglePermissionsError) {
      userMessage = 'Error de permisos en Google Sheets: asegúrate de (1) habilitar la Google Sheets API en Google Cloud y (2) compartir el spreadsheet con el email de la cuenta de servicio como Editor.';
    } else if (isApiNotEnabled) {
      userMessage = 'La Google Sheets API no está habilitada. Habilitala en https://console.cloud.google.com/apis/library/sheets.googleapis.com';
    } else if (!process.env.GOOGLE_SPREADSHEET_ID) {
      userMessage = 'Variable de entorno GOOGLE_SPREADSHEET_ID no configurada.';
    } else if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      userMessage = 'Variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON no configurada.';
    }

    console.error('Error al inicializar Google Sheets:', err.message);
    res.status(503).json({ message: userMessage });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/expenses', expensesRoutes);
// Calendar routes — /api/calendar/cabin/:id.ics is public (no Sheets init check needed)
app.use('/api/calendar', calendarRoutes);

// Health check — sin pasar por el middleware de inicialización de Sheets
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manejo de errores global
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Error interno del servidor' });
});

export default app;

// Solo llamar a listen() cuando el archivo se ejecuta directamente (desarrollo local)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001;
  console.log('Iniciando servidor local...');
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}
