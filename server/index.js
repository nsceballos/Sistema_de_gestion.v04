import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeSpreadsheet } from './sheets.js';
import authRoutes from './routes/auth.js';
import guestsRoutes from './routes/guests.js';
import expensesRoutes from './routes/expenses.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/expenses', expensesRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize Google Sheets and start server
async function start() {
  try {
    console.log('Inicializando Google Sheets...');
    await initializeSpreadsheet();
    console.log('Google Sheets inicializado correctamente');
  } catch (error) {
    console.error('Error al inicializar Google Sheets:', error.message);
    console.error('Verifica que GOOGLE_SPREADSHEET_ID y GOOGLE_SERVICE_ACCOUNT_JSON estén configurados');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}

start();
