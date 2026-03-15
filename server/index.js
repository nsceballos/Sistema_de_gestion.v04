import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ensureInitialized } from './sheets.js';
import authRoutes from './routes/auth.js';
import guestsRoutes from './routes/guests.js';
import expensesRoutes from './routes/expenses.js';

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
app.use('/api', async (_req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    res.status(503).json({ message: 'Servicio no disponible: ' + err.message });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/expenses', expensesRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
