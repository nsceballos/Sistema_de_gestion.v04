import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_RECEIPT_NUMBER,
  getReceiptStartNumber,
  toReceiptNumber,
  formatReceiptNumber,
  normalizeReceiptInput,
  parseReceipt,
  sortReceipts,
  findLatestReceipt,
  nextReceiptNumber,
  findReceiptByNumber,
  buildDuplicateReceiptResponse,
} from './validation.js';

const validReceipt = {
  receipt_date: '2026-02-10',
  guest_name: '  María López  ',
  amount_ars: 100000,
  concept: ' Seña de reserva ',
  detail: ' Cabaña 1, del 14 al 20 de diciembre ',
  holder_name: ' Encantos del Valle ',
  holder_phone: ' 1122334455 ',
  holder_address: ' Camino del Valle 123 ',
  guest_id: 'abc-123',
};

describe('normalizeReceiptInput', () => {
  test('acepta un recibo válido y recorta los textos', () => {
    const { value, error } = normalizeReceiptInput(validReceipt);
    assert.equal(error, undefined);
    assert.deepEqual(value, {
      receipt_date: '2026-02-10',
      guest_name: 'María López',
      amount_ars: 100000,
      concept: 'Seña de reserva',
      detail: 'Cabaña 1, del 14 al 20 de diciembre',
      holder_name: 'Encantos del Valle',
      holder_phone: '1122334455',
      holder_address: 'Camino del Valle 123',
      guest_id: 'abc-123',
    });
  });

  test('sin número, el resultado no trae `number`', () => {
    const { value } = normalizeReceiptInput(validReceipt);
    assert.equal('number' in value, false);
  });

  test('los campos opcionales quedan en "" y el monto puede ser un string numérico', () => {
    const { value, error } = normalizeReceiptInput({
      receipt_date: '2026-02-10',
      guest_name: 'Juan',
      amount_ars: ' 2500.5 ',
      concept: 'Saldo',
    });
    assert.equal(error, undefined);
    assert.equal(value.amount_ars, 2500.5);
    for (const field of ['detail', 'holder_name', 'holder_phone', 'holder_address', 'guest_id']) {
      assert.equal(value[field], '', field);
    }
  });

  test('la fecha tiene que ser una fecha real AAAA-MM-DD', () => {
    for (const receipt_date of [undefined, '', '10/02/2026', '2026-02-30', '2026-13-01', '2026-2-1', 20260210]) {
      const result = normalizeReceiptInput({ ...validReceipt, receipt_date });
      assert.match(result.error, /fecha del recibo/, String(receipt_date));
    }
  });

  test('el huésped y el concepto son obligatorios', () => {
    for (const guest_name of [undefined, '', '   ', null]) {
      assert.match(normalizeReceiptInput({ ...validReceipt, guest_name }).error, /huésped/);
    }
    for (const concept of [undefined, '', '   ', null]) {
      assert.match(normalizeReceiptInput({ ...validReceipt, concept }).error, /concepto/);
    }
  });

  test('el monto tiene que ser un número mayor a 0', () => {
    for (const amount_ars of [undefined, null, '', 0, '0', -5, '-1', 'abc', '12abc', NaN, Infinity, true, {}, []]) {
      assert.match(normalizeReceiptInput({ ...validReceipt, amount_ars }).error, /monto/, String(amount_ars));
    }
    assert.equal(normalizeReceiptInput({ ...validReceipt, amount_ars: 0.01 }).value.amount_ars, 0.01);
  });

  test('number: acepta enteros >= 1 y strings numéricos como "0053"', () => {
    assert.equal(normalizeReceiptInput({ ...validReceipt, number: 53 }).value.number, 53);
    assert.equal(normalizeReceiptInput({ ...validReceipt, number: '0053' }).value.number, 53);
    assert.equal(normalizeReceiptInput({ ...validReceipt, number: ' 54 ' }).value.number, 54);
    assert.equal(normalizeReceiptInput({ ...validReceipt, number: 1 }).value.number, 1);
  });

  test('number: rechaza 0, negativos, decimales y texto', () => {
    for (const number of [0, '0', '0000', -1, '-3', 1.5, '1.5', '1e3', 'abc', '12abc', 'N° 0053', NaN, Infinity, true, {}]) {
      const result = normalizeReceiptInput({ ...validReceipt, number });
      assert.match(result.error, /número de recibo/, String(number));
    }
  });

  test('number vacío cuenta como omitido, salvo con requireNumber', () => {
    for (const number of [undefined, null, '', '  ']) {
      const result = normalizeReceiptInput({ ...validReceipt, number });
      assert.equal(result.error, undefined);
      assert.equal('number' in result.value, false);
    }
    for (const number of [undefined, null, '']) {
      const result = normalizeReceiptInput({ ...validReceipt, number }, { requireNumber: true });
      assert.match(result.error, /número de recibo es obligatorio/);
    }
    const ok = normalizeReceiptInput({ ...validReceipt, number: '0053' }, { requireNumber: true });
    assert.equal(ok.value.number, 53);
  });

  test('guest_id tiene que ser un texto', () => {
    assert.equal(normalizeReceiptInput({ ...validReceipt, guest_id: null }).value.guest_id, '');
    assert.equal(normalizeReceiptInput({ ...validReceipt, guest_id: '  ' }).value.guest_id, '');
    assert.match(normalizeReceiptInput({ ...validReceipt, guest_id: 12 }).error, /reserva/);
    assert.match(normalizeReceiptInput({ ...validReceipt, guest_id: {} }).error, /reserva/);
  });

  test('un cuerpo que no es un objeto da error en vez de romper', () => {
    for (const body of [undefined, null, 'texto', 5]) {
      assert.ok(normalizeReceiptInput(body).error);
    }
  });
});

describe('toReceiptNumber y formatReceiptNumber', () => {
  test('toReceiptNumber', () => {
    assert.equal(toReceiptNumber(53), 53);
    assert.equal(toReceiptNumber('0053'), 53);
    assert.equal(toReceiptNumber(' 7 '), 7);
    for (const raw of [0, '0', -2, 2.5, '2.5', '', '  ', 'abc', null, undefined, NaN, Infinity, 2 ** 60, {}]) {
      assert.ok(Number.isNaN(toReceiptNumber(raw)), String(raw));
    }
  });

  test('formatReceiptNumber rellena con ceros a 4 dígitos', () => {
    assert.equal(formatReceiptNumber(53), '0053');
    assert.equal(formatReceiptNumber(1), '0001');
    assert.equal(formatReceiptNumber(1234), '1234');
    assert.equal(formatReceiptNumber(12345), '12345');
  });
});

describe('getReceiptStartNumber', () => {
  test('usa RECEIPT_START_NUMBER sólo si es un entero positivo', () => {
    assert.equal(FIRST_RECEIPT_NUMBER, 53);
    assert.equal(getReceiptStartNumber('120'), 120);
    assert.equal(getReceiptStartNumber('0054'), 54);
    assert.equal(getReceiptStartNumber(' 7 '), 7);
    for (const raw of [undefined, '', '0', '-4', '1.5', 'abc', '12abc', null]) {
      assert.equal(getReceiptStartNumber(raw), 53, String(raw));
    }
  });
});

describe('nextReceiptNumber', () => {
  test('sin recibos devuelve el número inicial', () => {
    assert.equal(nextReceiptNumber([], 53), 53);
    assert.equal(nextReceiptNumber(undefined, 53), 53);
    assert.equal(nextReceiptNumber([], 120), 120);
    assert.equal(nextReceiptNumber([]), FIRST_RECEIPT_NUMBER);
  });

  test('es el número más alto + 1, aunque haya huecos o desorden', () => {
    assert.equal(nextReceiptNumber([{ number: 53 }, { number: 54 }], 53), 55);
    assert.equal(nextReceiptNumber([{ number: 60 }, { number: 53 }, { number: 57 }], 53), 61);
    assert.equal(nextReceiptNumber([{ number: 80 }], 53), 81);
  });

  test('acepta números como texto ("0054" o "54") e ignora los inválidos', () => {
    assert.equal(nextReceiptNumber([{ number: '0054' }, { number: '53' }], 53), 55);
    const garbage = [{ number: NaN }, { number: 'abc' }, { number: '' }, { number: null }, {}, { number: -9 }, { number: 0 }, { number: 2.5 }, null];
    assert.equal(nextReceiptNumber(garbage, 53), 53);
    assert.equal(nextReceiptNumber([...garbage, { number: 56 }], 53), 57);
  });
});

describe('findLatestReceipt', () => {
  test('devuelve el recibo con el número más alto', () => {
    const a = { id: 'a', number: '53', holder_name: 'A' };
    const b = { id: 'b', number: 55, holder_name: 'B' };
    const c = { id: 'c', number: 'xx', holder_name: 'C' };
    assert.equal(findLatestReceipt([a, c, b]), b);
    assert.equal(findLatestReceipt([c]), null);
    assert.equal(findLatestReceipt([]), null);
    assert.equal(findLatestReceipt(undefined), null);
  });
});

describe('findReceiptByNumber', () => {
  const receipts = [
    { id: 'a', number: '53' },
    { id: 'b', number: 54 },
    { id: 'c', number: 'basura' },
  ];

  test('encuentra por número aunque esté guardado como texto', () => {
    assert.equal(findReceiptByNumber(receipts, 53).id, 'a');
    assert.equal(findReceiptByNumber(receipts, 54).id, 'b');
    assert.equal(findReceiptByNumber(receipts, 55), null);
    assert.equal(findReceiptByNumber([], 1), null);
  });

  test('excludeId ignora el propio recibo', () => {
    assert.equal(findReceiptByNumber(receipts, 53, { excludeId: 'a' }), null);
    assert.equal(findReceiptByNumber(receipts, 53, { excludeId: 'b' }).id, 'a');
  });

  test('con números repetidos gana la primera fila de la hoja', () => {
    const dup = [
      { id: 'x', number: '55', created_at: '2026-02-10T10:00:00.000Z' },
      { id: 'y', number: '55', created_at: '2026-02-10T09:59:59.000Z' },
    ];
    assert.equal(findReceiptByNumber(dup, 55).id, 'x');
  });
});

describe('buildDuplicateReceiptResponse', () => {
  test('mensaje en español con el número a 4 dígitos y código', () => {
    assert.deepEqual(buildDuplicateReceiptResponse(53), {
      message: 'Ya existe el recibo N° 0053.',
      code: 'DUPLICATE_NUMBER',
    });
    assert.equal(buildDuplicateReceiptResponse(1234).message, 'Ya existe el recibo N° 1234.');
  });
});

describe('parseReceipt', () => {
  test('convierte números y deja la fila completa', () => {
    const parsed = parseReceipt({
      id: ' r1 ',
      number: '0053',
      receipt_date: '2026-02-10',
      guest_name: 'María',
      amount_ars: '100000',
      concept: 'Seña',
      detail: 'Cabaña 1',
      holder_name: 'Encantos',
      holder_phone: '11',
      holder_address: 'Calle 1',
      guest_id: 'g1',
      created_at: '2026-02-10T00:00:00.000Z',
      updated_at: '2026-02-11T00:00:00.000Z',
      mi_nota: 'columna propia',
    });
    assert.equal(parsed.id, 'r1');
    assert.equal(parsed.number, 53);
    assert.equal(typeof parsed.number, 'number');
    assert.equal(parsed.amount_ars, 100000);
    assert.equal(parsed.guest_name, 'María');
    assert.equal(parsed.guest_id, 'g1');
    assert.equal(parsed.mi_nota, 'columna propia');
  });

  test('los textos que faltan quedan en "" y los números inválidos en 0', () => {
    const parsed = parseReceipt({ id: 'r2', number: 'abc', amount_ars: 'x' });
    assert.equal(parsed.number, 0);
    assert.equal(parsed.amount_ars, 0);
    for (const field of ['receipt_date', 'guest_name', 'concept', 'detail', 'holder_name', 'holder_phone', 'holder_address', 'guest_id', 'created_at', 'updated_at']) {
      assert.equal(parsed[field], '', field);
    }
    assert.equal(parseReceipt({}).id, '');
    assert.equal(parseReceipt({ number: 7 }).number, 7);
  });
});

describe('sortReceipts', () => {
  test('ordena del número más alto al más bajo, sin tocar el arreglo original', () => {
    const input = [
      { id: 'a', number: 53 },
      { id: 'c', number: 0 },
      { id: 'b', number: 55 },
      { id: 'd', number: 54 },
    ];
    const sorted = sortReceipts(input);
    assert.deepEqual(sorted.map(r => r.id), ['b', 'd', 'a', 'c']);
    assert.deepEqual(input.map(r => r.id), ['a', 'c', 'b', 'd']);
  });
});
