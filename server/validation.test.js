import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CABINS,
  isValidDateString,
  toDateKey,
  computeNights,
  formatDateAR,
  normalizeGuestInput,
  omitAbsentFields,
  GUEST_FIELDS_KEPT_IF_ABSENT,
  rangesOverlap,
  findOverlap,
  buildOverlapResponse,
  computeBalances,
  normalizeExpenseInput,
  parseExpense,
  parseAllowedEmails,
  isRegistrationAllowed,
} from './validation.js';
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

const validGuest = {
  guest_name: '  Juan Pérez  ',
  source: 'Booking',
  exchange_rate: 1200,
  check_in_date: '2026-12-14',
  check_out_date: '2026-12-20',
  num_guests: 2,
  num_nights: 99, // el servidor lo ignora
  phone_number: ' 1122334455 ',
  cabin_number: 1,
  total_amount_usd: 500,
  total_amount_ars: 600000,
  deposit_usd: 100,
  deposit_ars: 120000,
  comments: 'Llegan tarde',
  allow_overlap: true,
};

describe('fechas', () => {
  test('isValidDateString acepta sólo fechas reales YYYY-MM-DD', () => {
    assert.equal(isValidDateString('2026-12-14'), true);
    assert.equal(isValidDateString('2028-02-29'), true); // bisiesto
    assert.equal(isValidDateString('2026-02-29'), false);
    assert.equal(isValidDateString('2026-02-30'), false);
    assert.equal(isValidDateString('2026-13-01'), false);
    assert.equal(isValidDateString('2026-00-10'), false);
    assert.equal(isValidDateString('14/12/2026'), false);
    assert.equal(isValidDateString('2026-1-5'), false);
    assert.equal(isValidDateString('2026-12-14T00:00:00Z'), false);
    assert.equal(isValidDateString(''), false);
    assert.equal(isValidDateString(undefined), false);
    assert.equal(isValidDateString(20261214), false);
  });

  test('toDateKey toma la fecha de valores viejos con hora', () => {
    assert.equal(toDateKey('2026-12-14'), '2026-12-14');
    assert.equal(toDateKey(' 2026-12-14T03:00:00.000Z '), '2026-12-14');
    assert.equal(toDateKey('14/12/2026'), null);
    assert.equal(toDateKey(''), null);
    assert.equal(toDateKey(undefined), null);
  });

  test('computeNights usa la diferencia de días en UTC', () => {
    assert.equal(computeNights('2026-12-14', '2026-12-20'), 6);
    assert.equal(computeNights('2026-12-31', '2027-01-02'), 2);
    assert.equal(computeNights('2028-02-28', '2028-03-01'), 2);
    // cambio de horario en otros países: no afecta porque se calcula en UTC
    assert.equal(computeNights('2026-03-07', '2026-03-09'), 2);
    assert.equal(computeNights('2026-10-24', '2026-10-26'), 2);
    assert.equal(computeNights('2026-12-20', '2026-12-14'), -6);
    assert.equal(computeNights('2026-12-14', 'mal'), null);
  });

  test('formatDateAR', () => {
    assert.equal(formatDateAR('2026-12-14'), '14/12/2026');
    assert.equal(formatDateAR('cualquier cosa'), 'cualquier cosa');
  });
});

describe('normalizeGuestInput', () => {
  test('normaliza un payload válido y calcula las noches en el servidor', () => {
    const { error, value } = normalizeGuestInput(validGuest);
    assert.equal(error, undefined);
    assert.equal(value.guest_name, 'Juan Pérez');
    assert.equal(value.phone_number, '1122334455');
    assert.equal(value.num_nights, 6);
    assert.equal(value.source, 'Booking');
    assert.equal(value.exchange_rate, 1200);
    assert.equal(value.balance_ars, 480000);
    assert.equal(value.balance_usd, 400);
    assert.equal('allow_overlap' in value, false);
    assert.equal('id' in value, false);
  });

  test('acepta números como string y completa valores por defecto', () => {
    const { error, value } = normalizeGuestInput({
      check_in_date: '2026-12-14',
      check_out_date: '2026-12-15',
      num_guests: '3',
      cabin_number: '2',
      total_amount_ars: '1000.5',
      deposit_ars: '',
    });
    assert.equal(error, undefined);
    assert.equal(value.cabin_number, 2);
    assert.equal(value.num_guests, 3);
    assert.equal(value.total_amount_ars, 1000.5);
    assert.equal(value.deposit_ars, 0);
    assert.equal(value.total_amount_usd, 0);
    assert.equal(value.exchange_rate, 0);
    assert.equal(value.guest_name, '');
    assert.equal(value.source, '');
    assert.equal(value.comments, '');
    assert.equal(value.num_nights, 1);
  });

  test('normaliza el canal sin importar mayúsculas', () => {
    assert.equal(normalizeGuestInput({ ...validGuest, source: 'airbnb' }).value.source, 'Airbnb');
    assert.equal(normalizeGuestInput({ ...validGuest, source: ' Directo ' }).value.source, 'Directo');
    assert.equal(normalizeGuestInput({ ...validGuest, source: null }).value.source, '');
  });

  const invalidCases = [
    ['entrada inválida', { check_in_date: '2026-02-30' }, /fecha de entrada/],
    ['entrada vacía', { check_in_date: '' }, /fecha de entrada/],
    ['salida con otro formato', { check_out_date: '20/12/2026' }, /fecha de salida/],
    ['salida igual a la entrada', { check_out_date: '2026-12-14' }, /posterior/],
    ['salida anterior a la entrada', { check_out_date: '2026-12-10' }, /posterior/],
    ['cabaña 3', { cabin_number: 3 }, /cabaña/],
    ['cabaña vacía', { cabin_number: '' }, /cabaña/],
    ['cabaña booleana', { cabin_number: true }, /cabaña/],
    ['huéspedes 0', { num_guests: 0 }, /huéspedes/],
    ['huéspedes decimal', { num_guests: 1.5 }, /huéspedes/],
    ['huéspedes faltante', { num_guests: undefined }, /huéspedes/],
    ['total negativo', { total_amount_ars: -1 }, /total en ARS/],
    ['total no numérico', { total_amount_ars: '12abc' }, /total en ARS/],
    ['seña USD negativa', { deposit_usd: -5 }, /seña en USD/],
    ['tipo de cambio negativo', { exchange_rate: -1 }, /tipo de cambio/],
    ['seña mayor al total', { deposit_ars: 700000 }, /seña no puede ser mayor/],
    ['canal inválido', { source: 'Expedia' }, /canal/],
  ];
  for (const [name, patch, pattern] of invalidCases) {
    test(`rechaza: ${name}`, () => {
      const { error, value } = normalizeGuestInput({ ...validGuest, ...patch });
      assert.equal(value, undefined);
      assert.match(error, pattern);
    });
  }

  test('rechaza un cuerpo vacío', () => {
    assert.ok(normalizeGuestInput(undefined).error);
    assert.ok(normalizeGuestInput(null).error);
  });

  test('las cabañas válidas son 1 y 2', () => {
    assert.deepEqual(CABINS, [1, 2]);
  });

  test('omitAbsentFields conserva nombre/canal/tipo de cambio si el cliente no los manda', () => {
    const body = { ...validGuest };
    delete body.guest_name;
    delete body.exchange_rate;
    const { value } = normalizeGuestInput(body);
    const changes = omitAbsentFields(value, body, GUEST_FIELDS_KEPT_IF_ABSENT);
    assert.equal('guest_name' in changes, false);
    assert.equal('exchange_rate' in changes, false);
    assert.equal(changes.source, 'Booking');
    assert.equal(changes.check_in_date, '2026-12-14');
    // si los manda vacíos, sí se guardan vacíos
    const explicit = omitAbsentFields(value, { ...body, guest_name: '' }, GUEST_FIELDS_KEPT_IF_ABSENT);
    assert.equal(explicit.guest_name, '');
  });
});

describe('superposición de reservas', () => {
  const existing = [
    { id: 'a', cabin_number: '1', check_in_date: '2026-12-14', check_out_date: '2026-12-20', guest_name: 'Juan Pérez' },
    { id: 'b', cabin_number: '2', check_in_date: '2026-12-10', check_out_date: '2026-12-31', guest_name: 'Ana' },
    { id: 'c', cabin_number: '1', check_in_date: '2026-12-25', check_out_date: '2026-12-28', guest_name: '' },
  ];
  const candidate = (cabin, checkIn, checkOut) => ({ cabin_number: cabin, check_in_date: checkIn, check_out_date: checkOut });

  test('rangesOverlap', () => {
    assert.equal(rangesOverlap('2026-12-14', '2026-12-20', '2026-12-19', '2026-12-22'), true);
    assert.equal(rangesOverlap('2026-12-14', '2026-12-20', '2026-12-20', '2026-12-22'), false);
    assert.equal(rangesOverlap('2026-12-20', '2026-12-22', '2026-12-14', '2026-12-20'), false);
    assert.equal(rangesOverlap('2026-12-14', '2026-12-20', '2026-12-15', '2026-12-16'), true);
    assert.equal(rangesOverlap('2026-12-15', '2026-12-16', '2026-12-14', '2026-12-20'), true);
  });

  test('detecta superposición en la misma cabaña', () => {
    assert.equal(findOverlap(candidate(1, '2026-12-18', '2026-12-22'), existing)?.id, 'a');
    assert.equal(findOverlap(candidate(1, '2026-12-10', '2026-12-15'), existing)?.id, 'a');
    assert.equal(findOverlap(candidate(1, '2026-12-15', '2026-12-16'), existing)?.id, 'a'); // contenida
    assert.equal(findOverlap(candidate(1, '2026-12-01', '2026-12-31'), existing)?.id, 'a'); // la que entra primero
  });

  test('salida el mismo día que la entrada siguiente no es superposición', () => {
    assert.equal(findOverlap(candidate(1, '2026-12-20', '2026-12-25'), existing), null);
    assert.equal(findOverlap(candidate(1, '2026-12-10', '2026-12-14'), existing), null);
  });

  test('otra cabaña no es superposición', () => {
    assert.equal(findOverlap(candidate(2, '2026-12-14', '2026-12-20'), [existing[0]]), null);
    assert.equal(findOverlap(candidate(2, '2027-01-01', '2027-01-05'), existing), null);
  });

  test('al editar se excluye la propia reserva', () => {
    assert.equal(findOverlap(candidate(1, '2026-12-14', '2026-12-21'), existing, { excludeId: 'a' }), null);
    assert.equal(findOverlap(candidate(1, '2026-12-14', '2026-12-26'), existing, { excludeId: 'a' })?.id, 'c');
  });

  test('filas viejas: fechas con hora cuentan, fechas inválidas se ignoran, sin cabaña = cabaña 1', () => {
    const legacy = [
      { id: 'x', cabin_number: '', check_in_date: '2026-11-01T00:00:00.000Z', check_out_date: '2026-11-05T00:00:00.000Z' },
      { id: 'y', cabin_number: '1', check_in_date: 'basura', check_out_date: '2026-11-30' },
    ];
    assert.equal(findOverlap(candidate(1, '2026-11-03', '2026-11-04'), legacy)?.id, 'x');
    assert.equal(findOverlap(candidate(1, '2026-11-20', '2026-11-25'), legacy), null);
  });

  test('buildOverlapResponse arma el 409 del contrato', () => {
    const body = buildOverlapResponse({ ...existing[0], phone_number: '123', extra: 'no va' });
    assert.deepEqual(body, {
      message: 'La Cabaña 1 ya tiene una reserva del 14/12/2026 al 20/12/2026 (Juan Pérez).',
      code: 'OVERLAP',
      conflict: {
        id: 'a',
        guest_name: 'Juan Pérez',
        check_in_date: '2026-12-14',
        check_out_date: '2026-12-20',
        cabin_number: 1,
      },
    });
    assert.equal(
      buildOverlapResponse({ ...existing[2], phone_number: '1122' }).message,
      'La Cabaña 1 ya tiene una reserva del 25/12/2026 al 28/12/2026 (tel. 1122).'
    );
    assert.equal(
      buildOverlapResponse(existing[2]).message,
      'La Cabaña 1 ya tiene una reserva del 25/12/2026 al 28/12/2026.'
    );
  });
});

describe('computeBalances', () => {
  test('completa los campos nuevos en filas viejas', () => {
    const legacyRow = {
      id: 'g1', check_in_date: '2026-01-10', check_out_date: '2026-01-13', num_guests: '2',
      phone_number: '11', num_nights: '3', cabin_number: '2', total_amount_usd: '100',
      total_amount_ars: '100000', deposit_usd: '20', deposit_ars: '20000', balance_usd: '',
      balance_ars: '', comments: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '',
      mi_columna: 'dato propio',
    };
    const guest = computeBalances(legacyRow);
    assert.equal(guest.guest_name, '');
    assert.equal(guest.source, '');
    assert.equal(guest.exchange_rate, 0);
    assert.equal(guest.balance_ars, 80000);
    assert.equal(guest.balance_usd, 80);
    assert.equal(guest.cabin_number, 2);
    assert.equal(guest.num_guests, 2);
    assert.equal(guest.num_nights, 3);
    assert.equal(guest.created_at, '2026-01-01T00:00:00.000Z');
    assert.equal(guest.mi_columna, 'dato propio');
  });

  test('las noches salen de las fechas; si no son válidas, del valor guardado', () => {
    assert.equal(computeBalances({ check_in_date: '2026-01-10', check_out_date: '2026-01-15', num_nights: '2' }).num_nights, 5);
    assert.equal(computeBalances({ check_in_date: 'x', check_out_date: '', num_nights: '2' }).num_nights, 2);
    assert.equal(computeBalances({}).cabin_number, 1);
  });

  test('un canal inválido guardado a mano se devuelve vacío', () => {
    assert.equal(computeBalances({ source: 'booking' }).source, 'Booking');
    assert.equal(computeBalances({ source: 'Expedia' }).source, '');
  });
});

describe('gastos', () => {
  const validExpense = {
    expense_date: '2026-10-01',
    category: ' Limpieza ',
    amount_ars: 15000,
    amount_usd: 12.5,
    exchange_rate: 1200,
    description: ' Productos ',
  };

  test('normaliza un gasto válido', () => {
    const { error, value } = normalizeExpenseInput(validExpense);
    assert.equal(error, undefined);
    assert.deepEqual(value, {
      expense_date: '2026-10-01',
      category: 'Limpieza',
      amount_usd: 12.5,
      amount_ars: 15000,
      exchange_rate: 1200,
      description: 'Productos',
    });
  });

  test('rechaza datos inválidos', () => {
    assert.match(normalizeExpenseInput({ ...validExpense, expense_date: '2026-02-31' }).error, /fecha del gasto/);
    assert.match(normalizeExpenseInput({ ...validExpense, expense_date: undefined }).error, /fecha del gasto/);
    assert.match(normalizeExpenseInput({ ...validExpense, category: '   ' }).error, /categoría/);
    assert.match(normalizeExpenseInput({ ...validExpense, amount_ars: -1 }).error, /monto en ARS/);
    assert.match(normalizeExpenseInput({ ...validExpense, amount_ars: 'mil' }).error, /monto en ARS/);
    assert.match(normalizeExpenseInput({ ...validExpense, exchange_rate: -3 }).error, /tipo de cambio/);
  });

  test('parseExpense completa exchange_rate en filas viejas', () => {
    const expense = parseExpense({ id: 'e1', expense_date: '2026-01-01', category: 'Luz', amount_usd: '1', amount_ars: '1000', description: '', created_at: '' });
    assert.equal(expense.exchange_rate, 0);
    assert.equal(expense.amount_ars, 1000);
  });
});

describe('registro de usuarios', () => {
  test('parseAllowedEmails', () => {
    assert.deepEqual(parseAllowedEmails(' Ana@Mail.com, ,pepe@x.com '), ['ana@mail.com', 'pepe@x.com']);
    assert.deepEqual(parseAllowedEmails(undefined), []);
    assert.deepEqual(parseAllowedEmails(''), []);
  });

  test('isRegistrationAllowed', () => {
    const allowedEmails = parseAllowedEmails('ana@mail.com');
    // primer usuario: siempre
    assert.equal(isRegistrationAllowed({ email: 'cualquiera@x.com', existingUserCount: 0, allowedEmails: [] }), true);
    // con usuarios: sólo emails autorizados (sin importar mayúsculas ni espacios)
    assert.equal(isRegistrationAllowed({ email: ' ANA@mail.com ', existingUserCount: 1, allowedEmails }), true);
    assert.equal(isRegistrationAllowed({ email: 'otro@mail.com', existingUserCount: 1, allowedEmails }), false);
    assert.equal(isRegistrationAllowed({ email: 'otro@mail.com', existingUserCount: 3, allowedEmails: [] }), false);
    assert.equal(isRegistrationAllowed({ email: '', existingUserCount: 1, allowedEmails: [''] }), false);
  });
});

describe('sheetUtils', () => {
  test('columnLetter soporta más de 26 columnas', () => {
    assert.equal(columnLetter(0), 'A');
    assert.equal(columnLetter(18), 'S');
    assert.equal(columnLetter(25), 'Z');
    assert.equal(columnLetter(26), 'AA');
    assert.equal(columnLetter(27), 'AB');
    assert.equal(columnLetter(51), 'AZ');
    assert.equal(columnLetter(52), 'BA');
    assert.equal(columnLetter(701), 'ZZ');
    assert.equal(columnLetter(702), 'AAA');
    assert.throws(() => columnLetter(-1), RangeError);
    assert.throws(() => columnLetter(1.5), RangeError);
  });

  test('quoteSheetName', () => {
    assert.equal(quoteSheetName('Huespedes'), "'Huespedes'");
    assert.equal(quoteSheetName("Hoja de Ana's"), "'Hoja de Ana''s'");
  });

  test('mergeHeaders: fila 1 vacía → todas las cabeceras desde A', () => {
    assert.deepEqual(mergeHeaders([], ['id', 'a']), { headers: ['id', 'a'], missing: ['id', 'a'], startIndex: 0 });
    assert.deepEqual(mergeHeaders(undefined, ['id']), { headers: ['id'], missing: ['id'], startIndex: 0 });
  });

  test('mergeHeaders: sin cambios si ya están todas', () => {
    const existing = ['id', 'b', 'a'];
    assert.deepEqual(mergeHeaders(existing, ['id', 'a', 'b']), { headers: ['id', 'b', 'a'], missing: [], startIndex: 3 });
  });

  test('mergeHeaders: agrega sólo las faltantes después de la última celda no vacía, sin tocar columnas propias', () => {
    const existing = ['id', 'check_in_date', '', 'mi_columna', 'comments'];
    const result = mergeHeaders(existing, ['id', 'check_in_date', 'comments', 'guest_name', 'source']);
    assert.deepEqual(result.missing, ['guest_name', 'source']);
    assert.equal(result.startIndex, 5);
    assert.deepEqual(result.headers, ['id', 'check_in_date', '', 'mi_columna', 'comments', 'guest_name', 'source']);
    // las celdas existentes quedan exactamente igual
    assert.deepEqual(result.headers.slice(0, existing.length), existing);
  });

  test('mergeHeaders: ignora celdas vacías al final y reconoce cabeceras con espacios', () => {
    const result = mergeHeaders(['id', ' source ', '', ''], ['id', 'source', 'exchange_rate']);
    assert.deepEqual(result.missing, ['exchange_rate']);
    assert.equal(result.startIndex, 2);
    assert.deepEqual(result.headers, ['id', ' source ', 'exchange_rate']);
  });

  test('mergeHeaders: una celda con sólo espacios cuenta como ocupada (no se pisa)', () => {
    const result = mergeHeaders(['id', ' '], ['id', 'x']);
    assert.equal(result.startIndex, 2);
  });

  test('mergeHeaders: no se adueña de columnas con datos pero sin cabecera', () => {
    // Fila 1 con 3 cabeceras, pero hay notas escritas a mano en las columnas D y E (ancho 5)
    const result = mergeHeaders(['id', 'a', 'b'], ['id', 'a', 'b', 'guest_name'], 5);
    assert.equal(result.startIndex, 5);
    assert.deepEqual(result.missing, ['guest_name']);
    assert.deepEqual(result.headers, ['id', 'a', 'b', '', '', 'guest_name']);
    // las columnas sin cabecera no mapean a ningún campo
    assert.deepEqual(rowToObject(result.headers, ['1', 'x', 'y', 'nota', 'otra nota']), { id: '1', a: 'x', b: 'y', guest_name: '' });
  });

  test('mergeHeaders: el ancho de los datos no cambia nada si no faltan cabeceras', () => {
    assert.deepEqual(mergeHeaders(['id', 'a'], ['id', 'a'], 4), { headers: ['id', 'a'], missing: [], startIndex: 2 });
  });

  test('mergeHeaders: no duplica cabeceras requeridas repetidas', () => {
    assert.deepEqual(mergeHeaders(['id'], ['id', 'x', 'x']).missing, ['x']);
  });

  test('rowToObject mapea por nombre de cabecera', () => {
    const headers = ['id', ' guest_name ', '', 'mi_columna', 'id'];
    assert.deepEqual(rowToObject(headers, ['1', 'Ana', 'sin cabecera', 'propio', 'otro']), {
      id: '1',
      guest_name: 'Ana',
      mi_columna: 'propio',
    });
    assert.deepEqual(rowToObject(['id', 'a', 'b'], ['1']), { id: '1', a: '', b: '' });
  });

  test('isEmptyRow', () => {
    assert.equal(isEmptyRow([]), true);
    assert.equal(isEmptyRow(['', '']), true);
    assert.equal(isEmptyRow(['', 'x']), false);
  });

  test('buildAppendRow ubica cada valor según la cabecera real y deja vacías las columnas desconocidas', () => {
    const headers = ['mi_columna', 'id', 'check_in_date', 'otra_mia', 'guest_name', 'notas'];
    const row = buildAppendRow(headers, { id: 'g1', guest_name: 'Ana', check_in_date: '2026-12-14', num_guests: 2, comments: null });
    assert.deepEqual(row, [null, 'g1', '2026-12-14', null, 'Ana']);
  });

  test('buildAppendRow convierte a texto y escribe vacío para null', () => {
    assert.deepEqual(buildAppendRow(['id', 'n', 'c'], { id: 'x', n: 0, c: null }), ['x', '0', '']);
  });

  test('buildCellUpdates sólo escribe columnas conocidas, en tramos contiguos y nunca el id', () => {
    const headers = ['id', 'a', 'b', 'mia', 'c', '', 'd'];
    const runs = buildCellUpdates(headers, { id: 'cambiado', a: 1, b: 'x', c: 3, d: 4, desconocida: 9 });
    assert.deepEqual(runs, [
      { startIndex: 1, values: ['1', 'x'] },
      { startIndex: 4, values: ['3'] },
      { startIndex: 6, values: ['4'] },
    ]);
  });

  test('applyCellUpdates conserva las columnas no tocadas', () => {
    const headers = ['id', 'a', 'mia', 'b'];
    const row = ['1', 'viejo', 'dato propio'];
    const runs = buildCellUpdates(headers, { a: 'nuevo', b: 'agregado' });
    const updated = applyCellUpdates(row, runs);
    assert.deepEqual(updated, ['1', 'nuevo', 'dato propio', 'agregado']);
    assert.deepEqual(row, ['1', 'viejo', 'dato propio']); // no muta la original
    assert.deepEqual(rowToObject(headers, updated), { id: '1', a: 'nuevo', mia: 'dato propio', b: 'agregado' });
  });

  test('unknownKeys', () => {
    assert.deepEqual(unknownKeys(['id', 'a'], { id: 1, a: 2, b: 3, c: undefined }), ['b']);
  });
});
