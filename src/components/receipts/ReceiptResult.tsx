import { Download, MessageCircle, X } from 'lucide-react';
import type { Receipt } from '../../lib/api';
import { formatReceiptAmount, formatReceiptDate } from '../../lib/receipts';
import { receiptLabel } from './utils';

/** Estado del PDF del recibo que se acaba de guardar */
export interface ReceiptResultState {
  receipt: Receipt;
  status: 'generating' | 'ready' | 'error';
  /** Mensaje de error si falló la generación del PDF (el recibo ya quedó guardado) */
  error: string | null;
  /** El navegador pidió un toque nuevo para compartir: se muestra "Tocá Compartir de nuevo" */
  blocked: boolean;
}

interface Props {
  result: ReceiptResultState;
  /** Se llama directo desde el toque, con el PDF ya listo (Safari exige un toque reciente) */
  onShare: () => void;
  onDownload: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** Panel que aparece al guardar un recibo: compartir por WhatsApp o descargar el PDF */
export default function ReceiptResult({ result, onShare, onDownload, onRetry, onClose }: Props) {
  const { receipt, status, error, blocked } = result;
  const ready = status === 'ready';

  return (
    <section aria-label="Recibo generado" className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-green-900">Recibo {receiptLabel(receipt.number)} listo</h3>
          <p className="mt-0.5 break-words text-sm text-green-800">
            {receipt.guest_name} · {formatReceiptAmount(receipt.amount_ars)} · {formatReceiptDate(receipt.receipt_date)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-green-700 hover:bg-green-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {status === 'generating' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-green-800" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-green-700" aria-hidden="true" />
          Preparando el PDF…
        </p>
      )}

      {status === 'error' && (
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>No se pudo generar el PDF{error ? `: ${error}` : '.'}</p>
          <p className="mt-1 text-red-600">
            El recibo quedó guardado: podés volver a generarlo desde el listado.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-50"
          >
            Reintentar
          </button>
        </div>
      )}

      {blocked && (
        <p className="mt-3 text-sm font-medium text-amber-800" role="status">
          Tocá Compartir de nuevo
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onShare}
          disabled={!ready}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Compartir por WhatsApp
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!ready}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-5 w-5" aria-hidden="true" />
          Descargar PDF
        </button>
      </div>
    </section>
  );
}
