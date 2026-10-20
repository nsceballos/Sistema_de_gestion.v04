import { Fragment } from 'react';
import { Download, Edit2, MessageCircle, Trash2 } from 'lucide-react';
import type { Receipt } from '../../lib/api';
import { formatReceiptAmount, formatReceiptDate, formatReceiptNumber } from '../../lib/receipts';
import { receiptLabel } from './utils';

interface Props {
  receipts: Receipt[];
  /** Recibo cuyo PDF se está generando (deshabilita sus botones de PDF) */
  busyId: string | null;
  /** Recibo cuyo PDF ya está listo pero el navegador pidió un toque nuevo para compartir */
  retryId: string | null;
  /** Deshabilita eliminar mientras hay una baja en curso */
  deleting: boolean;
  onShare: (receipt: Receipt) => void;
  onRetryShare: (receipt: Receipt) => void;
  onDownload: (receipt: Receipt) => void;
  onEdit: (receipt: Receipt) => void;
  onDelete: (receipt: Receipt) => void;
}

const BASE =
  'inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';

type Handlers = Pick<Props, 'onShare' | 'onDownload' | 'onEdit' | 'onDelete'>;

interface ActionsProps extends Handlers {
  receipt: Receipt;
  pdfBusy: boolean;
  deleting: boolean;
  large?: boolean;
}

/** Compartir, descargar, editar y eliminar: botones de sólo ícono */
function ReceiptActions({ receipt, pdfBusy, deleting, large = false, onShare, onDownload, onEdit, onDelete }: ActionsProps) {
  const label = receiptLabel(receipt.number);
  const size = large ? 'h-10 w-10' : 'h-8 w-8';
  const icon = large ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onShare(receipt)}
        disabled={pdfBusy}
        title="Compartir por WhatsApp"
        aria-label={`Compartir recibo ${label}`}
        className={`${BASE} ${
          large ? 'mr-1 h-10 gap-1.5 px-3 text-sm font-medium' : size
        } text-green-600 hover:bg-black/5 hover:text-green-800`}
      >
        <MessageCircle className={icon} aria-hidden="true" />
        {large && 'Compartir'}
      </button>
      <button
        type="button"
        onClick={() => onDownload(receipt)}
        disabled={pdfBusy}
        title="Descargar PDF"
        aria-label={`Descargar PDF del recibo ${label}`}
        className={`${BASE} ${size} text-gray-600 hover:bg-black/5 hover:text-gray-800`}
      >
        <Download className={icon} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onEdit(receipt)}
        title="Editar recibo"
        aria-label={`Editar recibo ${label}`}
        className={`${BASE} ${size} text-indigo-600 hover:bg-black/5 hover:text-indigo-800`}
      >
        <Edit2 className={icon} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(receipt)}
        disabled={deleting}
        title="Eliminar recibo"
        aria-label={`Eliminar recibo ${label}`}
        className={`${BASE} ${size} text-red-600 hover:bg-black/5 hover:text-red-800`}
      >
        <Trash2 className={icon} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Aviso con botón para reintentar compartir: el PDF ya está listo, sólo falta un toque nuevo */
function RetryShare({ receipt, onRetryShare }: { receipt: Receipt; onRetryShare: (receipt: Receipt) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span role="status">Tocá Compartir de nuevo</span>
      <button
        type="button"
        onClick={() => onRetryShare(receipt)}
        className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Compartir
      </button>
    </div>
  );
}

const HEADERS: { label: string; align?: 'right' }[] = [
  { label: 'N°' },
  { label: 'Fecha' },
  { label: 'Huésped' },
  { label: 'Concepto' },
  { label: 'Monto (ARS)', align: 'right' },
  { label: 'Acciones', align: 'right' },
];

/** Recibos emitidos: tabla en escritorio (md en adelante) y tarjetas en el celular */
export default function ReceiptList({ receipts, busyId, retryId, deleting, onRetryShare, ...handlers }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {HEADERS.map(({ label, align }) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-3 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${
                    align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {receipts.map((receipt) => (
              <Fragment key={receipt.id}>
                <tr className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums">
                    {formatReceiptNumber(receipt.number)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatReceiptDate(receipt.receipt_date)}</td>
                  <td className="px-3 py-3">
                    <div className="max-w-[14rem] truncate" title={receipt.guest_name}>
                      {receipt.guest_name || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="max-w-[18rem] truncate" title={receipt.concept}>
                      {receipt.concept}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {formatReceiptAmount(receipt.amount_ars)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <ReceiptActions
                      receipt={receipt}
                      pdfBusy={busyId === receipt.id}
                      deleting={deleting}
                      {...handlers}
                    />
                  </td>
                </tr>
                {retryId === receipt.id && (
                  <tr>
                    <td colSpan={HEADERS.length} className="px-3 pb-3">
                      <RetryShare receipt={receipt} onRetryShare={onRetryShare} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p>
                  <span className="font-bold tabular-nums">{receiptLabel(receipt.number)}</span>
                  <span className="ml-2 text-sm text-gray-500 tabular-nums">{formatReceiptDate(receipt.receipt_date)}</span>
                </p>
                <p className="mt-1 truncate text-sm text-gray-900">{receipt.guest_name || '—'}</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums text-gray-900">{formatReceiptAmount(receipt.amount_ars)}</p>
            </div>
            <p className="mt-1 break-words text-sm text-gray-600">{receipt.concept}</p>

            <div className="mt-2 flex items-center justify-end border-t border-gray-100 pt-2">
              <ReceiptActions
                receipt={receipt}
                pdfBusy={busyId === receipt.id}
                deleting={deleting}
                large
                {...handlers}
              />
            </div>
            {retryId === receipt.id && (
              <div className="mt-2">
                <RetryShare receipt={receipt} onRetryShare={onRetryShare} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
