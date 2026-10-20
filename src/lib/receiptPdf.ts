import type { jsPDF } from 'jspdf';
import type { Receipt } from './api';
import {
  RECEIPT_FOOTER,
  RECEIPT_GREEN,
  RECEIPT_LOGO_URL,
  RECEIPT_TITLE,
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptNumber,
} from './receipts';

/** Lo que se imprime en el recibo */
export type ReceiptPdfData = Pick<
  Receipt,
  | 'number'
  | 'receipt_date'
  | 'guest_name'
  | 'amount_ars'
  | 'concept'
  | 'detail'
  | 'holder_name'
  | 'holder_phone'
  | 'holder_address'
>;

// ── Medidas en mm (página ≈ 1,18:1, como el recibo en papel de 828×704 px) ─────
const PAGE_W = 210;
const PAGE_H = 178;
const MARGIN_X = 12;
const HEADER_H = 23;
const FOOTER_H = 17;
const LOGO_H = 20;
/** Alto de las cajas de una línea */
const BOX_H = 9;
/** Ancho de las cajas de Fecha, Monto y Huésped */
const SHORT_BOX_W = 58;
/** Entre la etiqueta y su caja */
const LABEL_GAP = 3;
const PAD_X = 3;
const PAD_Y = 2.2;
/** Alto del título "Datos del hospedaje" más su separación de las cajas */
const SECTION_H = 9;
/** Separaciones verticales [ideal, mínima]: se achican si el detalle es largo */
const GAP = { top: [11, 7], row: [7, 4.5], section: [11, 7], bottom: [6, 3] } as const;

// ── Tipografía (puntos) ─────────────────────────────────────────────────────────
const FONT = 'helvetica';
const TITLE_PT = 26;
const NUMBER_PT = 14;
const LABEL_PT = 14;
const VALUE_PT = 14;
const FOOTER_PT = 10;
/** Letra más chica para un valor largo antes de cortarlo con "…" */
const MIN_LINE_PT = 8;
const MIN_DETAIL_PT = 9;
const DETAIL_MIN_LINES = 3;
const LINE_FACTOR = 1.25;
const MM_PER_PT = 25.4 / 72;
/** Altura de las mayúsculas de Helvetica, en em */
const CAP_HEIGHT = 0.718;

// ── Línea punteada ──────────────────────────────────────────────────────────────
const DOT_WIDTH = 0.3;
const DOT_PATTERN = [0.05, 0.65];

/**
 * Medidas del PDF que la vista previa en pantalla (ReceiptPreview) replica, para que no se
 * desfasen: mm para tamaños y separaciones (separaciones ideales), puntos para la letra.
 */
export const RECEIPT_LAYOUT = {
  pageW: PAGE_W,
  pageH: PAGE_H,
  marginX: MARGIN_X,
  headerH: HEADER_H,
  footerH: FOOTER_H,
  logoH: LOGO_H,
  boxH: BOX_H,
  shortBoxW: SHORT_BOX_W,
  labelGap: LABEL_GAP,
  padX: PAD_X,
  padY: PAD_Y,
  sectionH: SECTION_H,
  gapTop: GAP.top[0],
  gapRow: GAP.row[0],
  gapSection: GAP.section[0],
  gapBottom: GAP.bottom[0],
  detailMinLines: DETAIL_MIN_LINES,
  lineFactor: LINE_FACTOR,
  titlePt: TITLE_PT,
  numberPt: NUMBER_PT,
  labelPt: LABEL_PT,
  valuePt: VALUE_PT,
  footerPt: FOOTER_PT,
} as const;

const HOLDER_LABELS = ['Titular:', 'Teléfono:', 'Dirección:'] as const;
const WHITE = '#ffffff';
const BLACK = '#000000';

type FontStyle = 'normal' | 'bold';
type Align = 'left' | 'center';

const capHeight = (pt: number) => pt * MM_PER_PT * CAP_HEIGHT;
const lineHeight = (pt: number) => pt * MM_PER_PT * LINE_FACTOR;
const detailBoxHeight = (lines: number, pt: number) => 2 * PAD_Y + lines * lineHeight(pt);

function setFont(doc: jsPDF, style: FontStyle, pt: number): void {
  doc.setFont(FONT, style);
  doc.setFontSize(pt);
}

/** Línea base que centra verticalmente un texto de una línea en [top, top + height] */
const centeredBaseline = (top: number, height: number, pt: number) =>
  top + height / 2 + capHeight(pt) / 2;

// Caracteres de WinAnsi fuera de Latin-1 que Helvetica sí puede dibujar
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/**
 * Deja sólo lo que Helvetica (WinAnsi) puede dibujar: si un texto tiene un solo
 * carácter fuera de esa tabla (un emoji, una "ğ"), jsPDF lo escribe todo ilegible.
 * Las letras con tildes raras pasan a su letra base y el resto se descarta.
 */
export function toPdfText(text: string): string {
  return Array.from(text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' '), (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return ch;
    if (WIN_ANSI_EXTRA.includes(ch)) return ch;
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /^[\x20-\x7e]+$/.test(base) ? base : '';
  })
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// ── Logo ────────────────────────────────────────────────────────────────────────

let logoCache: Promise<string> | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Logo como data URL; se descarga una sola vez (si falla, se reintenta la próxima) */
function loadLogo(): Promise<string> {
  if (!logoCache) {
    logoCache = fetch(RECEIPT_LOGO_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Logo: HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        return `data:image/png;base64,${bytesToBase64(bytes)}`;
      })
      .catch((err: unknown) => {
        logoCache = null;
        throw err;
      });
  }
  return logoCache;
}

// ── Dibujo ──────────────────────────────────────────────────────────────────────

/** Línea punteada; siempre de izquierda a derecha / de arriba abajo para que los bordes compartidos coincidan */
function dottedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number): void {
  doc.setDrawColor(BLACK);
  doc.setLineWidth(DOT_WIDTH);
  doc.setLineCap('round');
  doc.setLineDashPattern(DOT_PATTERN, 0);
  doc.line(x1, y1, x2, y2);
  doc.setLineDashPattern([], 0);
  doc.setLineCap('butt');
}

function dottedRect(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  dottedLine(doc, x, y, x + w, y);
  dottedLine(doc, x, y + h, x + w, y + h);
  dottedLine(doc, x, y, x, y + h);
  dottedLine(doc, x + w, y, x + w, y + h);
}

/** Achica la letra hasta que el texto entre en una línea; si ni así entra, lo corta con "…" */
function fitLine(doc: jsPDF, text: string, maxW: number): { text: string; pt: number } {
  setFont(doc, 'normal', VALUE_PT);
  const width = doc.getTextWidth(text);
  if (width <= maxW) return { text, pt: VALUE_PT };
  const pt = Math.max(MIN_LINE_PT, Math.floor(((VALUE_PT * maxW) / width) * 2) / 2);
  doc.setFontSize(pt);
  if (doc.getTextWidth(text) <= maxW) return { text, pt };
  let cut = text;
  while (cut && doc.getTextWidth(`${cut}…`) > maxW) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, pt };
}

/** Caja punteada de una línea con el texto centrado o alineado a la izquierda */
function dottedField(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  w: number,
  align: Align,
): void {
  dottedRect(doc, x, y, w, BOX_H);
  if (!value) return;
  const fit = fitLine(doc, value, w - 2 * PAD_X);
  setFont(doc, 'normal', fit.pt);
  doc.setTextColor(BLACK);
  const baseline = centeredBaseline(y, BOX_H, fit.pt);
  if (align === 'center') doc.text(fit.text, x + w / 2, baseline, { align: 'center' });
  else doc.text(fit.text, x + PAD_X, baseline);
}

/** Etiqueta centrada verticalmente en una fila de alto BOX_H */
function label(doc: jsPDF, text: string, x: number, rowTop: number, style: FontStyle = 'bold'): void {
  setFont(doc, style, LABEL_PT);
  doc.setTextColor(BLACK);
  doc.text(text, x, centeredBaseline(rowTop, BOX_H, LABEL_PT));
}

function textWidth(doc: jsPDF, text: string, style: FontStyle, pt: number): number {
  setFont(doc, style, pt);
  return doc.getTextWidth(text);
}

interface DetailFit {
  lines: string[];
  pt: number;
  height: number;
}

/**
 * Reparte el detalle en líneas: la caja crece con el texto y, si no alcanza
 * el alto disponible, achica la letra (y como último recurso corta con "…").
 */
function fitDetail(doc: jsPDF, text: string, maxW: number, maxH: number): DetailFit {
  const minHeight = detailBoxHeight(DETAIL_MIN_LINES, VALUE_PT);
  let lines: string[] = [];
  for (let pt = VALUE_PT; pt >= MIN_DETAIL_PT; pt -= 0.5) {
    setFont(doc, 'normal', pt);
    lines = text ? doc.splitTextToSize(text, maxW) : [];
    const height = detailBoxHeight(lines.length, pt);
    if (height <= maxH) return { lines, pt, height: Math.max(height, minHeight) };
  }
  // Ni con la letra más chica: se muestran las líneas que entran
  setFont(doc, 'normal', MIN_DETAIL_PT);
  const maxLines = Math.max(1, Math.floor((maxH - 2 * PAD_Y) / lineHeight(MIN_DETAIL_PT)));
  const kept = lines.slice(0, maxLines);
  let last = kept[kept.length - 1] ?? '';
  while (last && doc.getTextWidth(`${last}…`) > maxW) last = last.slice(0, -1);
  kept[kept.length - 1] = `${last.trimEnd()}…`;
  return {
    lines: kept,
    pt: MIN_DETAIL_PT,
    height: Math.max(detailBoxHeight(kept.length, MIN_DETAIL_PT), minHeight),
  };
}

function drawHeader(doc: jsPDF, number: string, logo: string | null): void {
  doc.setFillColor(RECEIPT_GREEN);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

  // Título y número apilados, centrados en la franja
  const titleCap = capHeight(TITLE_PT);
  const numberCap = capHeight(NUMBER_PT);
  const gap = 3.2;
  const top = (HEADER_H - (titleCap + gap + numberCap)) / 2;
  doc.setTextColor(WHITE);
  setFont(doc, 'bold', TITLE_PT);
  doc.text(RECEIPT_TITLE, MARGIN_X, top + titleCap);
  setFont(doc, 'bold', NUMBER_PT);
  doc.text(`N° ${number}`, MARGIN_X, top + titleCap + gap + numberCap);

  if (!logo) return;
  try {
    const { width, height } = doc.getImageProperties(logo);
    const w = (LOGO_H * width) / height;
    doc.addImage(logo, 'PNG', PAGE_W - MARGIN_X - w, (HEADER_H - LOGO_H) / 2, w, LOGO_H, 'logo');
  } catch {
    // Sin logo: el recibo sigue siendo válido
  }
}

function drawFooter(doc: jsPDF): void {
  doc.setFillColor(RECEIPT_GREEN);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, 'F');
  setFont(doc, 'bold', FOOTER_PT);
  doc.setTextColor(BLACK);
  doc.text(RECEIPT_FOOTER, PAGE_W / 2, PAGE_H - 4.5, { align: 'center' });
}

function drawBody(doc: jsPDF, data: ReceiptPdfData): void {
  const right = PAGE_W - MARGIN_X;
  /** Valor de una caja de una línea */
  const value = (text: string | null | undefined) => toPdfText(text ?? '').replace(/\s*\n\s*/g, ' ');
  doc.setTextColor(BLACK);

  // Las cajas de una línea arrancan todas en la misma columna, después de la etiqueta más ancha
  const boxX =
    MARGIN_X +
    Math.max(
      ...['Fecha:', 'Huésped:', 'Concepto:'].map((t) => textWidth(doc, t, 'bold', LABEL_PT)),
      ...HOLDER_LABELS.map((t) => textWidth(doc, t, 'normal', LABEL_PT)),
    ) +
    LABEL_GAP;
  const fullW = right - boxX;
  const detailX = MARGIN_X + textWidth(doc, 'Detalle de reserva:', 'bold', LABEL_PT) + LABEL_GAP;
  const detailW = right - detailX;

  // Alto disponible: lo fijo + el detalle + separaciones (que se achican si el detalle es largo)
  const bodyH = PAGE_H - HEADER_H - FOOTER_H;
  const fixedH = 3 * BOX_H + SECTION_H + HOLDER_LABELS.length * BOX_H;
  const gapSum = (i: 0 | 1) => GAP.top[i] + 3 * GAP.row[i] + GAP.section[i] + GAP.bottom[i];
  const detail = fitDetail(doc, toPdfText(data.detail ?? ''), detailW - 2 * PAD_X, bodyH - fixedH - gapSum(1));
  const spare = bodyH - fixedH - detail.height;
  const t = Math.min(1, Math.max(0, (spare - gapSum(1)) / (gapSum(0) - gapSum(1))));
  const gap = (g: readonly [number, number]) => g[1] + t * (g[0] - g[1]);

  let y = HEADER_H + gap(GAP.top);

  // Fecha y Monto
  label(doc, 'Fecha:', MARGIN_X, y);
  dottedField(doc, formatReceiptDate(data.receipt_date), boxX, y, SHORT_BOX_W, 'center');
  const amountX = right - SHORT_BOX_W;
  label(doc, 'Monto:', amountX - LABEL_GAP - textWidth(doc, 'Monto:', 'bold', LABEL_PT), y);
  dottedField(doc, formatReceiptAmount(data.amount_ars), amountX, y, SHORT_BOX_W, 'center');
  y += BOX_H + gap(GAP.row);

  // Huésped: si el nombre no entra, la caja ocupa todo el ancho (como Concepto)
  const guest = value(data.guest_name);
  const guestFits = textWidth(doc, guest, 'normal', VALUE_PT) <= SHORT_BOX_W - 2 * PAD_X;
  const guestW = guestFits ? SHORT_BOX_W : fullW;
  label(doc, 'Huésped:', MARGIN_X, y);
  dottedField(doc, guest, boxX, y, guestW, 'center');
  y += BOX_H + gap(GAP.row);

  label(doc, 'Concepto:', MARGIN_X, y);
  dottedField(doc, value(data.concept), boxX, y, fullW, 'center');
  y += BOX_H + gap(GAP.row);

  // Detalle de reserva: varias líneas alineadas a la izquierda
  const lh = lineHeight(detail.pt);
  setFont(doc, 'bold', LABEL_PT);
  doc.text('Detalle de reserva:', MARGIN_X, y + PAD_Y + lh / 2 + capHeight(LABEL_PT) / 2);
  dottedRect(doc, detailX, y, detailW, detail.height);
  setFont(doc, 'normal', detail.pt);
  detail.lines.forEach((line, i) => {
    doc.text(line, detailX + PAD_X, y + PAD_Y + i * lh + lh / 2 + capHeight(detail.pt) / 2);
  });
  y += detail.height + gap(GAP.section);

  // Datos del hospedaje
  const sectionTitle = 'Datos del hospedaje';
  setFont(doc, 'bold', LABEL_PT);
  const titleBaseline = y + capHeight(LABEL_PT);
  doc.text(sectionTitle, MARGIN_X, titleBaseline);
  dottedLine(doc, MARGIN_X + doc.getTextWidth(sectionTitle) + 2.5, titleBaseline, right, titleBaseline);
  y += SECTION_H;

  const holder = [data.holder_name, data.holder_phone, data.holder_address];
  HOLDER_LABELS.forEach((text, i) => {
    label(doc, text, MARGIN_X, y, 'normal');
    dottedField(doc, value(holder[i]), boxX, y, fullW, 'left');
    y += BOX_H;
  });
}

/**
 * Genera el PDF del recibo con el diseño de Encantos del Valle (dibujo vectorial con jsPDF).
 * jsPDF se carga recién acá para no agrandar el bundle principal.
 */
export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Blob> {
  const [{ jsPDF }, logo] = await Promise.all([
    import('jspdf'),
    loadLogo().catch(() => null),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_W, PAGE_H], compress: true });
  const number = formatReceiptNumber(data.number);
  doc.setDocumentProperties({
    title: `Recibo N° ${number}`,
    author: 'Encantos del Valle',
    subject: RECEIPT_TITLE,
    creator: 'Encantos del Valle',
  });

  drawHeader(doc, number, logo);
  drawFooter(doc);
  drawBody(doc, data);
  return doc.output('blob');
}
