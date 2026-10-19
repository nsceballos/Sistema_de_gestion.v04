// Lógica pura de validación y normalización (sin acceso a Google Sheets), para poder testearla.

export const CABINS = [1, 2];
export const RESERVATION_SOURCES = ['', 'Directo', 'Booking', 'Airbnb'];

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ── Helpers genéricos ───────────────────────────────────────────────────────

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function toText(value) {
  return isBlank(value) ? '' : String(value).trim();
}

/** Número a partir de un number o de un string numérico; cualquier otra cosa (booleanos, objetos, '12abc') → NaN. */
function toNumberStrict(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw.trim());
  return NaN;
}

/** Convierte 'YYYY-MM-DD' a milisegundos UTC, o null si no es una fecha real. */
function parseDateUTC(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

/** true si es una fecha real con formato YYYY-MM-DD (rechaza 2026-02-30, 2026-13-01, etc.). */
export function isValidDateString(value) {
  return parseDateUTC(value) !== null;
}

/**
 * Fecha 'YYYY-MM-DD' de un valor guardado en la planilla. Acepta también valores con hora
 * ('2026-12-14T00:00:00Z') tomando los primeros 10 caracteres. null si no hay una fecha válida.
 */
export function toDateKey(value) {
  if (value === undefined || value === null) return null;
  const key = String(value).trim().slice(0, 10);
  return isValidDateString(key) ? key : null;
}

/** Noches entre dos fechas YYYY-MM-DD (diferencia de días en UTC). null si alguna fecha es inválida. */
export function computeNights(checkIn, checkOut) {
  const start = parseDateUTC(checkIn);
  const end = parseDateUTC(checkOut);
  if (start === null || end === null) return null;
  return Math.round((end - start) / DAY_MS);
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (si no es una fecha válida, la devuelve tal cual). */
export function formatDateAR(value) {
  if (!isValidDateString(value)) return String(value ?? '');
  const [year, month, day] = value.trim().split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Lee un número no negativo. Vacío → valor por defecto (0).
 * Devuelve { value } o { error }.
 */
function readNonNegativeNumber(raw, label, { defaultValue = 0 } = {}) {
  if (isBlank(raw)) return { value: defaultValue };
  const value = toNumberStrict(raw);
  if (!Number.isFinite(value) || value < 0) {
    return { error: `${label} debe ser un número mayor o igual a 0.` };
  }
  return { value };
}

// ── Reservas ────────────────────────────────────────────────────────────────

/** Número de cabaña tal como lo muestra la app (las filas viejas sin cabaña cuentan como la 1). */
export function toCabinNumber(raw) {
  return parseInt(raw, 10) || 1;
}

/** Canal normalizado ('booking' → 'Booking'); null si no es un canal válido. */
export function normalizeSource(raw) {
  const text = toText(raw);
  const match = RESERVATION_SOURCES.find(s => s.toLowerCase() === text.toLowerCase());
  return match === undefined ? null : match;
}

/**
 * Valida y normaliza el cuerpo de POST/PUT /api/guests.
 * Devuelve { value } con los campos listos para guardar, o { error } con un mensaje en español.
 * `num_nights` se calcula a partir de las fechas (se ignora el valor del cliente) y
 * `allow_overlap` nunca forma parte del resultado.
 */
export function normalizeGuestInput(body) {
  const input = body && typeof body === 'object' ? body : {};

  const checkIn = toText(input.check_in_date);
  const checkOut = toText(input.check_out_date);
  if (!isValidDateString(checkIn)) {
    return { error: 'La fecha de entrada no es válida (tiene que ser una fecha real con formato AAAA-MM-DD).' };
  }
  if (!isValidDateString(checkOut)) {
    return { error: 'La fecha de salida no es válida (tiene que ser una fecha real con formato AAAA-MM-DD).' };
  }
  if (checkOut <= checkIn) {
    return { error: 'La fecha de salida tiene que ser posterior a la fecha de entrada.' };
  }

  const cabin = toNumberStrict(input.cabin_number);
  if (!CABINS.includes(cabin)) {
    return { error: `La cabaña tiene que ser ${CABINS.join(' o ')}.` };
  }

  const guests = toNumberStrict(input.num_guests);
  if (!Number.isInteger(guests) || guests < 1) {
    return { error: 'La cantidad de huéspedes tiene que ser un número entero mayor o igual a 1.' };
  }

  const amounts = {};
  const amountFields = [
    ['total_amount_ars', 'El total en ARS'],
    ['total_amount_usd', 'El total en USD'],
    ['deposit_ars', 'La seña en ARS'],
    ['deposit_usd', 'La seña en USD'],
    ['exchange_rate', 'El tipo de cambio'],
  ];
  for (const [field, label] of amountFields) {
    const result = readNonNegativeNumber(input[field], label);
    if (result.error) return { error: result.error };
    amounts[field] = result.value;
  }
  if (amounts.deposit_ars > amounts.total_amount_ars) {
    return { error: 'La seña no puede ser mayor que el total de la reserva.' };
  }

  const source = normalizeSource(input.source);
  if (source === null) {
    return { error: 'El canal de la reserva no es válido (opciones: Directo, Booking o Airbnb).' };
  }

  return {
    value: {
      guest_name: toText(input.guest_name),
      source,
      exchange_rate: amounts.exchange_rate,
      check_in_date: checkIn,
      check_out_date: checkOut,
      num_guests: guests,
      num_nights: computeNights(checkIn, checkOut),
      phone_number: toText(input.phone_number),
      cabin_number: cabin,
      total_amount_usd: amounts.total_amount_usd,
      total_amount_ars: amounts.total_amount_ars,
      deposit_usd: amounts.deposit_usd,
      deposit_ars: amounts.deposit_ars,
      balance_usd: amounts.total_amount_usd - amounts.deposit_usd,
      balance_ars: amounts.total_amount_ars - amounts.deposit_ars,
      comments: isBlank(input.comments) ? '' : String(input.comments).trim(),
    },
  };
}

/**
 * Campos que, en un PUT, se conservan si el cliente no los manda (por ejemplo una pestaña con
 * una versión vieja de la app abierta): así no se borra el nombre, el canal ni el tipo de cambio.
 */
export const GUEST_FIELDS_KEPT_IF_ABSENT = ['guest_name', 'source', 'exchange_rate'];
export const EXPENSE_FIELDS_KEPT_IF_ABSENT = ['exchange_rate'];

/** Copia de `value` sin los campos de `fields` que no vienen en el cuerpo original. */
export function omitAbsentFields(value, body, fields) {
  const input = body && typeof body === 'object' ? body : {};
  const result = { ...value };
  for (const field of fields) {
    if (input[field] === undefined) delete result[field];
  }
  return result;
}

/** Dos rangos [entrada, salida) se superponen. La salida de uno el mismo día que la entrada del otro NO es superposición. */
export function rangesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

/**
 * Busca otra reserva de la misma cabaña que se superponga con `candidate`.
 * `excludeId` permite ignorar la propia reserva al editarla. Las filas con fechas inválidas se ignoran.
 * Si hay varias, devuelve la de entrada más temprana.
 */
export function findOverlap(candidate, guests, { excludeId } = {}) {
  const cabin = Number(candidate.cabin_number);
  const conflicts = (guests || []).filter(g => {
    if (!g || (excludeId !== undefined && g.id === excludeId)) return false;
    if (toCabinNumber(g.cabin_number) !== cabin) return false;
    const gIn = toDateKey(g.check_in_date);
    const gOut = toDateKey(g.check_out_date);
    if (!gIn || !gOut) return false;
    return rangesOverlap(candidate.check_in_date, candidate.check_out_date, gIn, gOut);
  });
  if (conflicts.length === 0) return null;
  return conflicts.reduce((first, g) => (toDateKey(g.check_in_date) < toDateKey(first.check_in_date) ? g : first));
}

/** Cuerpo de la respuesta 409 para una reserva superpuesta. */
export function buildOverlapResponse(conflict) {
  const guestName = toText(conflict.guest_name);
  const phone = toText(conflict.phone_number);
  const cabin = toCabinNumber(conflict.cabin_number);
  const checkIn = toDateKey(conflict.check_in_date) || toText(conflict.check_in_date);
  const checkOut = toDateKey(conflict.check_out_date) || toText(conflict.check_out_date);
  const who = guestName ? ` (${guestName})` : phone ? ` (tel. ${phone})` : '';
  return {
    message: `La Cabaña ${cabin} ya tiene una reserva del ${formatDateAR(checkIn)} al ${formatDateAR(checkOut)}${who}.`,
    code: 'OVERLAP',
    conflict: {
      id: toText(conflict.id),
      guest_name: guestName,
      check_in_date: checkIn,
      check_out_date: checkOut,
      cabin_number: cabin,
    },
  };
}

/** Normaliza una fila de la hoja Huespedes al formato que devuelve la API (incluye saldos calculados). */
export function computeBalances(guest) {
  const totalARS = parseFloat(guest.total_amount_ars) || 0;
  const depositARS = parseFloat(guest.deposit_ars) || 0;
  const totalUSD = parseFloat(guest.total_amount_usd) || 0;
  const depositUSD = parseFloat(guest.deposit_usd) || 0;
  const checkIn = toText(guest.check_in_date);
  const checkOut = toText(guest.check_out_date);
  const nights = computeNights(toDateKey(checkIn), toDateKey(checkOut));
  return {
    ...guest,
    id: toText(guest.id),
    guest_name: toText(guest.guest_name),
    source: normalizeSource(guest.source) ?? '',
    exchange_rate: parseFloat(guest.exchange_rate) || 0,
    check_in_date: checkIn,
    check_out_date: checkOut,
    phone_number: guest.phone_number === undefined || guest.phone_number === null ? '' : String(guest.phone_number),
    comments: guest.comments === undefined || guest.comments === null ? '' : String(guest.comments),
    total_amount_ars: totalARS,
    total_amount_usd: totalUSD,
    deposit_ars: depositARS,
    deposit_usd: depositUSD,
    balance_ars: totalARS - depositARS,
    balance_usd: totalUSD - depositUSD,
    num_guests: parseInt(guest.num_guests, 10) || 0,
    num_nights: nights !== null && nights > 0 ? nights : parseInt(guest.num_nights, 10) || 0,
    cabin_number: toCabinNumber(guest.cabin_number),
    created_at: toText(guest.created_at),
    updated_at: toText(guest.updated_at),
  };
}

// ── Gastos ──────────────────────────────────────────────────────────────────

/** Valida y normaliza el cuerpo de POST/PUT /api/expenses. Devuelve { value } o { error }. */
export function normalizeExpenseInput(body) {
  const input = body && typeof body === 'object' ? body : {};

  const expenseDate = toText(input.expense_date);
  if (!isValidDateString(expenseDate)) {
    return { error: 'La fecha del gasto no es válida (tiene que ser una fecha real con formato AAAA-MM-DD).' };
  }

  const category = toText(input.category);
  if (!category) {
    return { error: 'La categoría del gasto es obligatoria.' };
  }

  const amounts = {};
  const amountFields = [
    ['amount_ars', 'El monto en ARS'],
    ['amount_usd', 'El monto en USD'],
    ['exchange_rate', 'El tipo de cambio'],
  ];
  for (const [field, label] of amountFields) {
    const result = readNonNegativeNumber(input[field], label);
    if (result.error) return { error: result.error };
    amounts[field] = result.value;
  }

  return {
    value: {
      expense_date: expenseDate,
      category,
      amount_usd: amounts.amount_usd,
      amount_ars: amounts.amount_ars,
      exchange_rate: amounts.exchange_rate,
      description: isBlank(input.description) ? '' : String(input.description).trim(),
    },
  };
}

/** Normaliza una fila de la hoja Gastos al formato que devuelve la API. */
export function parseExpense(row) {
  return {
    ...row,
    id: toText(row.id),
    expense_date: toText(row.expense_date),
    category: row.category === undefined || row.category === null ? '' : String(row.category),
    description: row.description === undefined || row.description === null ? '' : String(row.description),
    amount_ars: parseFloat(row.amount_ars) || 0,
    amount_usd: parseFloat(row.amount_usd) || 0,
    exchange_rate: parseFloat(row.exchange_rate) || 0,
    created_at: toText(row.created_at),
  };
}

// ── Registro de usuarios ────────────────────────────────────────────────────

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** 'a@x.com, B@y.com' → ['a@x.com', 'b@y.com'] */
export function parseAllowedEmails(raw) {
  return String(raw || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

/**
 * El registro está permitido si todavía no hay ningún usuario (primera cuenta) o si el email
 * está en la lista ALLOWED_EMAILS.
 */
export function isRegistrationAllowed({ email, existingUserCount, allowedEmails }) {
  if (existingUserCount === 0) return true;
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && (allowedEmails || []).includes(normalized);
}
