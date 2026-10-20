import { google } from 'googleapis';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dotenv from 'dotenv';
import {
  columnLetter,
  quoteSheetName,
  mergeHeaders,
  rowToObject,
  isEmptyRow,
  buildAppendRow,
  buildCellUpdates,
  applyCellUpdates,
  unknownKeys,
} from './sheetUtils.js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

// Proxy agent compartido (se crea una sola vez)
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

// Leer el ID del spreadsheet desde el entorno en tiempo de ejecución
function getSpreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID no está configurado');
  return id;
}

// Lazy initialization: se inicializa solo la primera vez que se necesita
let initialized = false;
let initPromise = null;

export async function ensureInitialized() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = initializeSpreadsheet()
      .then(() => { initialized = true; })
      .catch(err => { initPromise = null; throw err; });
  }
  return initPromise;
}

export const SHEET_NAMES = {
  USERS: 'Usuarios',
  GUESTS: 'Huespedes',
  EXPENSES: 'Gastos',
  RESERVATIONS: 'Reservas',
  RECEIPTS: 'Recibos',
};

// Columnas que necesita la app en cada hoja. Las columnas nuevas van SIEMPRE al final:
// en planillas existentes se agregan después de la última cabecera, sin mover nada.
const SHEET_HEADERS = {
  [SHEET_NAMES.USERS]: ['id', 'email', 'password_hash', 'created_at'],
  [SHEET_NAMES.GUESTS]: [
    'id', 'check_in_date', 'check_out_date', 'num_guests', 'phone_number',
    'num_nights', 'cabin_number', 'total_amount_usd', 'total_amount_ars',
    'deposit_usd', 'deposit_ars', 'balance_usd', 'balance_ars', 'comments',
    'created_at', 'updated_at',
    'guest_name', 'source', 'exchange_rate',
  ],
  [SHEET_NAMES.EXPENSES]: [
    'id', 'expense_date', 'category', 'amount_usd', 'amount_ars', 'description', 'created_at',
    'exchange_rate',
  ],
  [SHEET_NAMES.RESERVATIONS]: ['id', 'guest_id', 'status', 'notification_sent', 'created_at', 'updated_at'],
  [SHEET_NAMES.RECEIPTS]: [
    'id', 'number', 'receipt_date', 'guest_name', 'amount_ars', 'concept', 'detail',
    'holder_name', 'holder_phone', 'holder_address', 'guest_id', 'created_at', 'updated_at',
  ],
};

// ── Cliente de Google Sheets (uno por proceso) ──────────────────────────────

let sheetsClientPromise = null;

async function createSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no está configurado en las variables de entorno');
  }
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  // Obtener el cliente JWT real y configurar el proxy en su transporter
  const authClient = await auth.getClient();
  if (proxyAgent && authClient.transporter) {
    authClient.transporter.defaults = { ...authClient.transporter.defaults, agent: proxyAgent };
  }
  // Pasar authClient directamente para que el proxy se use también en llamadas a la API
  return google.sheets({ version: 'v4', auth: authClient });
}

/**
 * Devuelve el cliente cacheado. El cliente JWT renueva solo su access token, así que no hace
 * falta volver a autenticarse en cada request. Si la creación falla, se descarta la promesa
 * para que la próxima llamada lo vuelva a intentar.
 */
function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = createSheetsClient().catch(err => {
      sheetsClientPromise = null;
      throw err;
    });
  }
  return sheetsClientPromise;
}

// ── Cache de cabeceras ──────────────────────────────────────────────────────
// Fila 1 real de cada hoja. Se actualiza en la inicialización y cada vez que se lee la hoja
// completa. appendRow la usa sólo si es muy reciente (por ejemplo, la lectura que hace
// POST /api/guests para detectar superposiciones); si no, vuelve a leer la fila 1, por si
// alguien agregó o movió columnas a mano en la planilla mientras el servidor estaba corriendo.

const HEADER_CACHE_TTL_MS = 10 * 1000;
const headerCache = new Map();

function cacheHeaders(sheetName, headers) {
  headerCache.set(sheetName, { headers: [...(headers || [])], at: Date.now() });
}

async function getHeaders(sheets, sheetName) {
  const cached = headerCache.get(sheetName);
  if (cached && Date.now() - cached.at < HEADER_CACHE_TTL_MS) return cached.headers;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${quoteSheetName(sheetName)}!1:1`,
  });
  const headers = response.data.values?.[0] || [];
  cacheHeaders(sheetName, headers);
  return headers;
}

/** Lee todas las celdas de una hoja (fila 1 = cabeceras) y refresca la cache de cabeceras. */
async function readSheet(sheets, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: quoteSheetName(sheetName),
  });
  const rows = response.data.values || [];
  cacheHeaders(sheetName, rows[0] || []);
  return rows;
}

// ── Inicialización / migración del esquema ──────────────────────────────────

/**
 * Inicializa el spreadsheet: crea las hojas que falten y agrega las cabeceras que falten.
 *
 * Es segura para planillas con datos reales: si la fila 1 ya tiene cabeceras, sólo se agregan
 * las que faltan a continuación de la última columna con contenido. Nunca se reordenan,
 * renombran, borran ni pisan celdas existentes.
 */
export async function initializeSpreadsheet() {
  const SPREADSHEET_ID = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const sheetNames = Object.values(SHEET_NAMES);

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties',
  });
  const sheetProps = new Map(
    (spreadsheet.data.sheets || []).map(s => [s.properties?.title, s.properties])
  );

  // 1. Crear las hojas que no existen
  const addRequests = sheetNames
    .filter(name => !sheetProps.has(name))
    .map(name => ({
      addSheet: {
        properties: {
          title: name,
          gridProperties: { columnCount: Math.max(26, SHEET_HEADERS[name].length) },
        },
      },
    }));

  if (addRequests.length > 0) {
    const result = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: addRequests },
    });
    for (const reply of result.data.replies || []) {
      const props = reply.addSheet?.properties;
      if (props?.title) sheetProps.set(props.title, props);
    }
  }

  // 2. Leer todas las hojas en una sola llamada (sólo en el arranque): la fila 1 da las cabeceras y
  //    el resto, el ancho real de los datos (puede haber columnas con datos pero sin cabecera)
  const sheetResponse = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: sheetNames.map(name => quoteSheetName(name)),
  });
  const valueRanges = sheetResponse.data.valueRanges || [];

  // 3. Calcular qué cabeceras faltan en cada hoja
  const writes = [];
  const expandRequests = [];
  const mergedHeaders = new Map();

  sheetNames.forEach((name, i) => {
    const rows = valueRanges[i]?.values || [];
    const existing = rows[0] || [];
    const dataWidth = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const { headers, missing, startIndex } = mergeHeaders(existing, SHEET_HEADERS[name], dataWidth);
    mergedHeaders.set(name, headers);
    if (missing.length === 0) return;

    const endIndex = startIndex + missing.length - 1;
    writes.push({
      range: `${quoteSheetName(name)}!${columnLetter(startIndex)}1:${columnLetter(endIndex)}1`,
      values: [missing],
    });

    // Si la grilla no tiene columnas suficientes, agregarlas al final antes de escribir
    const props = sheetProps.get(name);
    const columnCount = props?.gridProperties?.columnCount;
    if (props?.sheetId !== undefined && Number.isInteger(columnCount) && columnCount < endIndex + 1) {
      expandRequests.push({
        appendDimension: {
          sheetId: props.sheetId,
          dimension: 'COLUMNS',
          length: endIndex + 1 - columnCount,
        },
      });
    }

    console.log(`Hoja "${name}": se agregan las columnas ${missing.join(', ')}`);
  });

  try {
    if (expandRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: expandRequests },
      });
    }

    if (writes.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: writes },
      });
    }
  } catch (err) {
    // Si la fila 1 está protegida (o la cuenta de servicio no puede editarla), no se bloquea toda la
    // app: sigue funcionando con las columnas que ya existen. Otros errores se propagan y se reintenta.
    if (!isPermissionError(err)) throw err;
    console.error(
      'No se pudieron agregar las columnas nuevas en la fila 1 (¿está protegida?). ' +
      'Dale permiso de edición a la cuenta de servicio o agregalas a mano: ' +
      writes.map(w => `${w.range} = ${w.values[0].join(', ')}`).join(' | ') +
      '. Mientras tanto, esos datos no se guardan.',
      err.message
    );
    // Cachear sólo las hojas que no necesitaban cambios; el resto se vuelve a leer de la planilla
    for (const [name, headers] of mergedHeaders) {
      if (!writes.some(w => w.range.startsWith(`${quoteSheetName(name)}!`))) cacheHeaders(name, headers);
    }
    return;
  }

  for (const [name, headers] of mergedHeaders) cacheHeaders(name, headers);
}

function isPermissionError(err) {
  const status = err?.status ?? err?.code ?? err?.response?.status;
  return status === 403 || /protected|permission/i.test(err?.message || '');
}

// ── Operaciones sobre filas ─────────────────────────────────────────────────

/**
 * Obtiene todas las filas de una hoja como array de objetos (claves = cabeceras de la fila 1).
 */
export async function getRows(sheetName) {
  const sheets = await getSheetsClient();
  const rows = await readSheet(sheets, sheetName);
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter(row => !isEmptyRow(row))
    .map(row => rowToObject(headers, row));
}

/**
 * Agrega una nueva fila al final de una hoja. Cada valor va en la columna cuya cabecera
 * coincide con su nombre; las columnas desconocidas quedan vacías.
 */
export async function appendRow(sheetName, data) {
  const SPREADSHEET_ID = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const headers = await getHeaders(sheets, sheetName);

  if (!headers.some(h => String(h).trim() === 'id')) {
    throw new Error(`La hoja "${sheetName}" no tiene la columna "id" en la fila 1`);
  }
  const lost = unknownKeys(headers, data);
  if (lost.length > 0) {
    console.warn(`Hoja "${sheetName}": no existen las columnas ${lost.join(', ')}; esos valores no se guardan`);
  }

  const row = buildAppendRow(headers, data);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${quoteSheetName(sheetName)}!A:${columnLetter(headers.length - 1)}`,
    valueInputOption: 'RAW',
    // Insertar filas nuevas en lugar de escribir sobre las existentes
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Actualiza una fila identificada por id. Sólo se escriben las columnas presentes en `data`
 * (según la cabecera real de la hoja); las demás celdas no se tocan.
 *
 * Devuelve el registro completo como quedó en la hoja, o null si no existe.
 */
export async function updateRowById(sheetName, id, data) {
  const SPREADSHEET_ID = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const rows = await readSheet(sheets, sheetName);
  if (rows.length <= 1) return null;
  const headers = rows[0];
  const idIndex = headers.findIndex(h => String(h).trim() === 'id');
  if (idIndex === -1) return null;

  const rowIndex = rows.findIndex((row, index) => index > 0 && row[idIndex] === id);
  if (rowIndex === -1) return null;

  const lost = unknownKeys(headers, data);
  if (lost.length > 0) {
    console.warn(`Hoja "${sheetName}": no existen las columnas ${lost.join(', ')}; esos valores no se guardan`);
  }

  const runs = buildCellUpdates(headers, data);
  const sheetRowNumber = rowIndex + 1;
  if (runs.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: runs.map(run => ({
          range: `${quoteSheetName(sheetName)}!${columnLetter(run.startIndex)}${sheetRowNumber}:${columnLetter(run.startIndex + run.values.length - 1)}${sheetRowNumber}`,
          values: [run.values],
        })),
      },
    });
  }

  return rowToObject(headers, applyCellUpdates(rows[rowIndex], runs));
}

/**
 * Elimina una fila identificada por id
 */
export async function deleteRowById(sheetName, id) {
  const SPREADSHEET_ID = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const [rows, spreadsheetResponse] = await Promise.all([
    readSheet(sheets, sheetName),
    sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets.properties',
    }),
  ]);

  if (rows.length <= 1) return false;
  const headers = rows[0];
  const idIndex = headers.findIndex(h => String(h).trim() === 'id');
  if (idIndex === -1) return false;

  const rowIndex = rows.findIndex((row, index) => index > 0 && row[idIndex] === id);
  if (rowIndex === -1) return false;

  const sheet = spreadsheetResponse.data.sheets?.find(
    s => s.properties?.title === sheetName
  );
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    },
  });
  return true;
}

/**
 * Busca una fila por un campo específico
 */
export async function findRowByField(sheetName, field, value) {
  const rows = await getRows(sheetName);
  return rows.find(row => row[field] === value) || null;
}
