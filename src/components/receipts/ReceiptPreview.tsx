import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { RECEIPT_LAYOUT, toPdfText } from '../../lib/receiptPdf';
import {
  RECEIPT_FOOTER,
  RECEIPT_GREEN,
  RECEIPT_LOGO_URL,
  RECEIPT_TITLE,
  formatReceiptAmount,
  formatReceiptDate,
  formatReceiptNumber,
} from '../../lib/receipts';

/** Lo que se ve en el recibo; los valores vacíos o inválidos dejan la caja en blanco */
export interface ReceiptPreviewData {
  number: number | null;
  /** YYYY-MM-DD o '' */
  date: string;
  amount: number | null;
  guestName: string;
  concept: string;
  detail: string;
  holderName: string;
  holderPhone: string;
  holderAddress: string;
}

// Medidas del PDF (RECEIPT_LAYOUT, en src/lib/receiptPdf.ts): milímetros sobre una hoja de 210 × 178 mm.
// La vista previa las escala al ancho disponible, así que se ve igual en la compu y en el celular.
const L = RECEIPT_LAYOUT;
/** Etiqueta más ancha ("Concepto:" en negrita, aprox.) + la separación con la caja */
const LABEL_COL_W = 24.4 + L.labelGap;
const DOT_WIDTH = 0.3;

const PT = 25.4 / 72;
const TITLE_MM = L.titlePt * PT;
const NUMBER_MM = L.numberPt * PT;
const TEXT_MM = L.valuePt * PT;
const FOOTER_MM = L.footerPt * PT;

const FONT_FAMILY = 'Helvetica, Arial, "Liberation Sans", sans-serif';

let measureCanvas: CanvasRenderingContext2D | null | undefined;

/** Ancho en mm de un texto en la letra de los valores del recibo (estimado si no hay canvas) */
function valueWidthMm(text: string): number {
  if (measureCanvas === undefined) {
    try {
      measureCanvas = document.createElement('canvas').getContext('2d');
    } catch {
      measureCanvas = null;
    }
  }
  if (!measureCanvas) return text.length * TEXT_MM * 0.5;
  measureCanvas.font = `${L.valuePt}pt ${FONT_FAMILY}`;
  return (measureCanvas.measureText(text).width * 25.4) / 96;
}

/** Escribe una medida en mm como px para el ancho actual */
type Mm = (n: number) => string;

function DottedBox({
  mm,
  children,
  align = 'center',
  style,
}: {
  mm: Mm;
  children: ReactNode;
  align?: 'center' | 'left';
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        boxSizing: 'border-box',
        minHeight: mm(L.boxH),
        minWidth: 0,
        padding: `${mm(L.padY)} ${mm(L.padX)}`,
        border: `max(1px, ${mm(DOT_WIDTH)}) dotted #000`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        lineHeight: L.lineFactor,
        overflowWrap: 'anywhere',
        whiteSpace: 'pre-wrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ mm, children, bold = true }: { mm: Mm; children: ReactNode; bold?: boolean }) {
  return (
    <span style={{ flex: 'none', width: mm(LABEL_COL_W), fontWeight: bold ? 700 : 400 }}>{children}</span>
  );
}

/**
 * Vista previa del recibo en HTML: replica el diseño del PDF (encabezado verde, cajas punteadas,
 * datos del hospedaje y pie verde) con los mismos formatos y textos que se imprimen.
 */
export default function ReceiptPreview({ data }: { data: ReceiptPreviewData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.6);

  // El ancho disponible define la escala (px por mm); en el celular el recibo se ve más chico, sin cortarse
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.max(0.3, el.clientWidth / L.pageW));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mm: Mm = (n) => `${(n * scale).toFixed(2)}px`;
  const text = (value: string) => toPdfText(value);
  /** Valor de una caja de una línea: los saltos de línea pasan a espacios, como en el PDF */
  const line = (value: string) => text(value).replace(/\s*\n\s*/g, ' ');
  const guestName = line(data.guestName);
  // Como en el PDF: si el nombre no entra en la caja corta, la caja ocupa todo el ancho (como Concepto)
  const guestFits = valueWidthMm(guestName) <= L.shortBoxW - 2 * L.padX;
  const number = data.number !== null ? formatReceiptNumber(data.number) : '----';
  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center' };

  return (
    <div ref={ref} className="mx-auto w-full max-w-[44rem]">
      <article
        aria-label={`Vista previa del recibo N° ${number}`}
        className="shadow-md ring-1 ring-black/10"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: mm(L.pageH),
          background: '#fff',
          color: '#000',
          fontFamily: FONT_FAMILY,
          fontSize: mm(TEXT_MM),
          WebkitTextSizeAdjust: '100%',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            flex: 'none',
            height: mm(L.headerH),
            padding: `0 ${mm(L.marginX)}`,
            background: RECEIPT_GREEN,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: mm(4),
          }}
        >
          <div style={{ fontWeight: 700, minWidth: 0 }}>
            <div style={{ fontSize: mm(TITLE_MM), lineHeight: 1, whiteSpace: 'nowrap' }}>{RECEIPT_TITLE}</div>
            <div style={{ fontSize: mm(NUMBER_MM), lineHeight: 1, marginTop: mm(3.2) }}>N° {number}</div>
          </div>
          <img
            src={RECEIPT_LOGO_URL}
            alt="Encantos del Valle"
            draggable={false}
            style={{ height: mm(L.logoH), width: 'auto', flex: 'none' }}
          />
        </header>

        <div style={{ flex: 1, padding: `${mm(L.gapTop)} ${mm(L.marginX)} ${mm(L.gapBottom)}` }}>
          <div style={rowStyle}>
            <Label mm={mm}>Fecha:</Label>
            <DottedBox mm={mm} style={{ width: mm(L.shortBoxW) }}>
              {data.date ? formatReceiptDate(data.date) : ''}
            </DottedBox>
            <span style={{ flex: 1 }} />
            <span style={{ fontWeight: 700, marginRight: mm(L.labelGap) }}>Monto:</span>
            <DottedBox mm={mm} style={{ width: mm(L.shortBoxW) }}>
              {data.amount !== null && data.amount > 0 ? formatReceiptAmount(data.amount) : ''}
            </DottedBox>
          </div>

          <div style={{ ...rowStyle, marginTop: mm(L.gapRow) }}>
            <Label mm={mm}>Huésped:</Label>
            <DottedBox mm={mm} style={guestFits ? { width: mm(L.shortBoxW) } : { flex: 1 }}>
              {guestName}
            </DottedBox>
          </div>

          <div style={{ ...rowStyle, marginTop: mm(L.gapRow) }}>
            <Label mm={mm}>Concepto:</Label>
            <DottedBox mm={mm} style={{ flex: 1 }}>
              {line(data.concept)}
            </DottedBox>
          </div>

          <div style={{ ...rowStyle, alignItems: 'flex-start', gap: mm(L.labelGap), marginTop: mm(L.gapRow) }}>
            <span
              style={{
                flex: 'none',
                fontWeight: 700,
                paddingTop: mm(L.padY),
                lineHeight: L.lineFactor,
              }}
            >
              Detalle de reserva:
            </span>
            <DottedBox
              mm={mm}
              align="left"
              style={{
                flex: 1,
                minHeight: mm(2 * L.padY + L.detailMinLines * TEXT_MM * L.lineFactor),
                alignItems: 'flex-start',
              }}
            >
              {text(data.detail)}
            </DottedBox>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: mm(2.5),
              marginTop: mm(L.gapSection),
              height: mm(L.sectionH),
              lineHeight: 1,
            }}
          >
            <span style={{ flex: 'none', fontWeight: 700 }}>Datos del hospedaje</span>
            <span
              aria-hidden="true"
              style={{ flex: 1, height: mm(3.9), borderBottom: `max(1px, ${mm(DOT_WIDTH)}) dotted #000` }}
            />
          </div>

          {(
            [
              ['Titular:', data.holderName],
              ['Teléfono:', data.holderPhone],
              ['Dirección:', data.holderAddress],
            ] as const
          ).map(([label, value], index) => (
            <div key={label} style={{ ...rowStyle, marginTop: index === 0 ? 0 : `max(-1px, ${mm(-DOT_WIDTH)})` }}>
              <Label mm={mm} bold={false}>
                {label}
              </Label>
              <DottedBox mm={mm} align="left" style={{ flex: 1 }}>
                {line(value)}
              </DottedBox>
            </div>
          ))}
        </div>

        <footer
          style={{
            flex: 'none',
            height: mm(L.footerH),
            background: RECEIPT_GREEN,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: mm(4.5 - FOOTER_MM * 0.21),
            fontSize: mm(FOOTER_MM),
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {RECEIPT_FOOTER}
        </footer>
      </article>
    </div>
  );
}
