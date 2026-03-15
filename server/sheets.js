import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

export const SHEET_NAMES = {
  USERS: 'Usuarios',
  GUESTS: 'Huespedes',
  EXPENSES: 'Gastos',
  RESERVATIONS: 'Reservas',
};

const SHEET_HEADERS = {
  [SHEET_NAMES.USERS]: ['id', 'email', 'password_hash', 'created_at'],
  [SHEET_NAMES.GUESTS]: [
    'id', 'check_in_date', 'check_out_date', 'num_guests', 'phone_number',
    'num_nights', 'cabin_number', 'total_amount_usd', 'total_amount_ars',
    'deposit_usd', 'deposit_ars', 'balance_usd', 'balance_ars', 'comments',
    'created_at', 'updated_at'
  ],
  [SHEET_NAMES.EXPENSES]: ['id', 'expense_date', 'category', 'amount_usd', 'amount_ars', 'description', 'created_at'],
  [SHEET_NAMES.RESERVATIONS]: ['id', 'guest_id', 'status', 'notification_sent', 'created_at', 'updated_at'],
};

function getAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no está configurado en las variables de entorno');
  }
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Inicializa el spreadsheet creando las hojas y cabeceras si no existen
 */
export async function initializeSpreadsheet() {
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SPREADSHEET_ID no está configurado');
  }
  const sheets = getSheetsClient();

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingSheets = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

  const requests = [];

  for (const [, sheetName] of Object.entries(SHEET_NAMES)) {
    if (!existingSheets.includes(sheetName)) {
      requests.push({
        addSheet: { properties: { title: sheetName } },
      });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
  }

  // Add headers to sheets that are missing them
  for (const [, sheetName] of Object.entries(SHEET_NAMES)) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!1:1`,
    });
    const firstRow = response.data.values?.[0];
    if (!firstRow || firstRow.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [SHEET_HEADERS[sheetName]] },
      });
    }
  }
}

/**
 * Obtiene todas las filas de una hoja como array de objetos
 */
export async function getRows(sheetName) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
  });
  const rows = response.data.values || [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? row[index] : '';
    });
    return obj;
  });
}

/**
 * Agrega una nueva fila al final de una hoja
 */
export async function appendRow(sheetName, data) {
  const sheets = getSheetsClient();
  const headers = SHEET_HEADERS[sheetName];
  const row = headers.map(header => (data[header] !== undefined ? String(data[header]) : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

/**
 * Actualiza una fila identificada por id
 */
export async function updateRowById(sheetName, id, data) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
  });
  const rows = response.data.values || [];
  if (rows.length <= 1) return false;
  const headers = rows[0];
  const idIndex = headers.indexOf('id');
  if (idIndex === -1) return false;

  const rowIndex = rows.findIndex((row, index) => index > 0 && row[idIndex] === id);
  if (rowIndex === -1) return false;

  const updatedRow = headers.map((header, index) => {
    if (data[header] !== undefined) return String(data[header]);
    return rows[rowIndex][index] !== undefined ? rows[rowIndex][index] : '';
  });

  const sheetRowNumber = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${sheetRowNumber}:${String.fromCharCode(65 + headers.length - 1)}${sheetRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });
  return true;
}

/**
 * Elimina una fila identificada por id
 */
export async function deleteRowById(sheetName, id) {
  const sheets = getSheetsClient();
  const [dataResponse, spreadsheetResponse] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:Z`,
    }),
    sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }),
  ]);

  const rows = dataResponse.data.values || [];
  if (rows.length <= 1) return false;
  const headers = rows[0];
  const idIndex = headers.indexOf('id');
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
