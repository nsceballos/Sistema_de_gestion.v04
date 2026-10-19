// Funciones puras para trabajar con filas y cabeceras de Google Sheets.
// No hablan con la API: así se pueden probar con tests unitarios.

/**
 * Convierte un índice de columna (base 0) en su letra A1: 0 → A, 25 → Z, 26 → AA, 701 → ZZ, 702 → AAA.
 */
export function columnLetter(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Índice de columna inválido: ${index}`);
  }
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Nombre de hoja entre comillas simples para usar en rangos A1 (las comillas internas se duplican).
 */
export function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

/** Nombre "lógico" de una cabecera: sin espacios alrededor. */
export function headerKey(header) {
  return header === undefined || header === null ? '' : String(header).trim();
}

/**
 * Combina la fila de cabeceras que ya tiene la hoja con las que necesita la app.
 *
 * - Nunca reordena, renombra, borra ni pisa celdas existentes (el usuario puede tener columnas propias).
 * - Las cabeceras que faltan se agregan DESPUÉS de la última celda no vacía de la fila 1, y nunca
 *   antes de `minStartIndex` (el ancho real de los datos): así no se adueña de columnas sin cabecera
 *   donde el usuario anotó cosas a mano.
 * - Si la fila 1 está vacía, el resultado son todas las cabeceras requeridas desde la columna A.
 *
 * Devuelve:
 *   headers    → cómo queda la fila 1 completa (lo que la app debe usar para mapear columnas)
 *   missing    → cabeceras a escribir
 *   startIndex → índice (base 0) de la columna donde se escribe la primera cabecera faltante
 */
export function mergeHeaders(existing, wanted, minStartIndex = 0) {
  const current = (existing || []).map(h => (h === undefined || h === null ? '' : String(h)));

  const present = new Set(current.map(headerKey).filter(Boolean));
  const missing = [];
  for (const name of wanted || []) {
    if (!present.has(name) && !missing.includes(name)) missing.push(name);
  }

  // Cualquier celda con contenido (aunque sean sólo espacios) cuenta como ocupada
  let lastNonEmpty = -1;
  current.forEach((h, i) => {
    if (h !== '') lastNonEmpty = i;
  });
  const startIndex = missing.length > 0 ? Math.max(lastNonEmpty + 1, minStartIndex) : lastNonEmpty + 1;

  // Las columnas sin cabecera que quedan en el medio se completan con '' para mantener los índices
  const kept = current.slice(0, startIndex);
  while (kept.length < startIndex) kept.push('');

  return {
    headers: kept.concat(missing),
    missing,
    startIndex,
  };
}

/**
 * Convierte una fila (array de celdas) en objeto usando la fila de cabeceras real de la hoja.
 * Las columnas sin cabecera se ignoran. Si una cabecera está repetida, gana la primera.
 */
export function rowToObject(headers, row) {
  const obj = {};
  (headers || []).forEach((header, index) => {
    const key = headerKey(header);
    if (!key || Object.prototype.hasOwnProperty.call(obj, key)) return;
    const cell = row ? row[index] : undefined;
    obj[key] = cell !== undefined && cell !== null ? cell : '';
  });
  return obj;
}

/** true si la fila no tiene ninguna celda con contenido. */
export function isEmptyRow(row) {
  return !row || row.every(cell => cell === undefined || cell === null || String(cell) === '');
}

function hasValue(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined;
}

function toCellValue(value) {
  return value === null ? '' : String(value);
}

/**
 * Arma una fila nueva para agregar al final de la hoja, ubicando cada valor según la cabecera
 * real de la hoja (por nombre, no por posición fija).
 *
 * Las columnas que la app no conoce (o que no vienen en `data`) quedan en `null`: la API de
 * Sheets las saltea y no escribe nada en esas celdas. Las del final se recortan.
 */
export function buildAppendRow(headers, data) {
  const row = (headers || []).map(header => {
    const key = headerKey(header);
    return key && hasValue(data, key) ? toCellValue(data[key]) : null;
  });
  while (row.length > 0 && row[row.length - 1] === null) row.pop();
  return row;
}

/**
 * Calcula qué celdas de una fila existente hay que escribir para actualizarla.
 * Sólo se tocan las columnas cuya cabecera viene en `data` (la columna `id` nunca se modifica);
 * el resto de la fila —incluidas las columnas propias del usuario— no se escribe.
 *
 * Devuelve tramos de columnas contiguas: [{ startIndex, values: [...] }].
 */
export function buildCellUpdates(headers, data) {
  const runs = [];
  let current = null;
  (headers || []).forEach((header, index) => {
    const key = headerKey(header);
    if (!key || key === 'id' || !hasValue(data, key)) {
      current = null;
      return;
    }
    const value = toCellValue(data[key]);
    if (current && current.startIndex + current.values.length === index) {
      current.values.push(value);
    } else {
      current = { startIndex: index, values: [value] };
      runs.push(current);
    }
  });
  return runs;
}

/**
 * Aplica los tramos de buildCellUpdates sobre una copia de la fila (para devolver el registro
 * tal como quedó en la hoja sin volver a leerla).
 */
export function applyCellUpdates(row, runs) {
  const updated = [...(row || [])];
  for (const run of runs) {
    run.values.forEach((value, offset) => {
      const index = run.startIndex + offset;
      while (updated.length < index) updated.push('');
      updated[index] = value;
    });
  }
  return updated;
}

/** Claves de `data` que no tienen columna en la hoja (se perderían al escribir). */
export function unknownKeys(headers, data) {
  const known = new Set((headers || []).map(headerKey).filter(Boolean));
  return Object.keys(data || {}).filter(key => hasValue(data, key) && !known.has(key));
}
