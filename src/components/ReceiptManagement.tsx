import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  ApiError,
  guestsApi,
  receiptsApi,
  type Guest,
  type NextReceiptInfo,
  type Receipt,
  type ReceiptPayload,
} from '../lib/api';
import { errorMessage } from '../lib/format';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { receiptFileName } from '../lib/receipts';
import { downloadBlob, sharePdf, type ShareResult } from '../lib/share';
import ReceiptForm, { type ReceiptSubmitFailure } from './receipts/ReceiptForm';
import ReceiptList from './receipts/ReceiptList';
import ReceiptResult, { type ReceiptResultState } from './receipts/ReceiptResult';
import { pdfKey, receiptLabel } from './receipts/utils';

interface Props {
  /** Reserva desde la que se llegó con "Generar recibo": abre el formulario con esa reserva elegida */
  initialGuest?: Guest | null;
  /** Se llama una vez que initialGuest ya se usó, para que App lo olvide */
  onInitialGuestConsumed?: () => void;
}

export default function ReceiptManagement({ initialGuest = null, onInitialGuestConsumed }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(true);
  const [guestsError, setGuestsError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [opening, setOpening] = useState(false);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [formGuest, setFormGuest] = useState<Guest | null>(null);
  const [next, setNext] = useState<NextReceiptInfo | null>(null);
  /** Cambia cada vez que se abre el formulario: lo remonta con valores limpios y dispara el scroll */
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [result, setResult] = useState<ReceiptResultState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ receipt: Receipt; blob: Blob } | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  /** Evita que un doble toque en "Generar recibo" emita dos números antes de que React deshabilite el botón */
  const savingRef = useRef(false);
  const consumedGuest = useRef<Guest | null>(null);
  /** PDFs ya generados (por contenido del recibo): al tocar Compartir de nuevo no hay que esperar */
  const pdfCache = useRef(new Map<string, Blob>());

  const fetchReceipts = useCallback(async () => {
    try {
      const list = await receiptsApi.getAll();
      setReceipts([...list].sort((a, b) => b.number - a.number));
    } catch (err) {
      setError(errorMessage(err, 'Error al cargar los recibos. Por favor intente nuevamente.'));
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReceipts();
    guestsApi
      .getAll()
      .then(setGuests)
      .catch((err: unknown) => setGuestsError(errorMessage(err, 'No se pudieron cargar las reservas.')))
      .finally(() => setGuestsLoading(false));
  }, [fetchReceipts]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Al abrir el formulario (nuevo / editar) se lleva la vista hasta él; scroll-mt deja lugar al header fijo
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm, formKey]);

  /** Abre el formulario de un recibo nuevo con el próximo número y los datos del hospedaje recordados */
  const openNew = useCallback(async (guest: Guest | null = null) => {
    setOpening(true);
    setError(null);
    setFormError(null);
    setResult(null);
    let info: NextReceiptInfo | null = null;
    try {
      info = await receiptsApi.getNext();
    } catch (err) {
      setError(
        errorMessage(err, 'No se pudo consultar el próximo número') +
          '. Podés dejar el número vacío y se asigna solo.',
      );
    }
    setNext(info);
    setEditing(null);
    setFormGuest(guest);
    setShowForm(true);
    setFormKey((key) => key + 1);
    setOpening(false);
  }, []);

  // Llegada desde una reserva: se consume una sola vez (StrictMode ejecuta los efectos dos veces)
  useEffect(() => {
    if (!initialGuest || consumedGuest.current === initialGuest) return;
    consumedGuest.current = initialGuest;
    void openNew(initialGuest);
    onInitialGuestConsumed?.();
  }, [initialGuest, onInitialGuestConsumed, openNew]);

  const openEdit = (receipt: Receipt) => {
    setError(null);
    setFormError(null);
    setResult(null);
    setEditing(receipt);
    setFormGuest(null);
    setShowForm(true);
    setFormKey((key) => key + 1);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormGuest(null);
    setFormError(null);
  };

  const refreshNext = async () => {
    try {
      setNext(await receiptsApi.getNext());
    } catch {
      // Sin el sugerido, el usuario igual puede corregir el número a mano
    }
  };

  // ── PDF ────────────────────────────────────────────────────────────────────

  const cachedPdf = (receipt: Receipt): Blob | undefined => pdfCache.current.get(pdfKey(receipt));

  const buildPdf = async (receipt: Receipt): Promise<Blob> => {
    const cached = cachedPdf(receipt);
    if (cached) return cached;
    const blob = await generateReceiptPdf(receipt);
    pdfCache.current.set(pdfKey(receipt), blob);
    return blob;
  };

  /** Abre el menú de compartir. Se llama con el PDF ya generado para no perder el toque del usuario */
  const shareBlob = async (receipt: Receipt, blob: Blob): Promise<ShareResult> => {
    const outcome = await sharePdf(blob, receiptFileName(receipt), `Recibo ${receiptLabel(receipt.number)}`);
    if (outcome === 'downloaded') setToast('PDF descargado: adjuntalo en WhatsApp');
    return outcome;
  };

  /** Genera el PDF del recibo recién guardado y lo deja en el panel de resultado */
  const prepareResult = async (receipt: Receipt) => {
    setResult({ receipt, status: 'generating', error: null, blocked: false });
    const isCurrent = (prev: ReceiptResultState | null) => prev !== null && prev.receipt.id === receipt.id;
    try {
      await buildPdf(receipt);
      setResult((prev) => (isCurrent(prev) ? { ...prev!, status: 'ready' } : prev));
    } catch (err) {
      const message = errorMessage(err, 'error desconocido');
      setResult((prev) => (isCurrent(prev) ? { ...prev!, status: 'error', error: message } : prev));
    }
  };

  const handleResultShare = async () => {
    if (!result) return;
    const blob = cachedPdf(result.receipt);
    if (!blob) return;
    const outcome = await shareBlob(result.receipt, blob);
    setResult((prev) => (prev ? { ...prev, blocked: outcome === 'blocked' } : prev));
  };

  const handleResultDownload = () => {
    if (!result) return;
    const blob = cachedPdf(result.receipt);
    if (blob) downloadBlob(blob, receiptFileName(result.receipt));
  };

  const handleListShare = async (receipt: Receipt) => {
    if (busyId) return;
    setRetry(null);
    let blob = cachedPdf(receipt);
    if (!blob) {
      setBusyId(receipt.id);
      try {
        blob = await buildPdf(receipt);
      } catch (err) {
        setError(errorMessage(err, 'No se pudo generar el PDF del recibo.'));
        return;
      } finally {
        setBusyId(null);
      }
    }
    const outcome = await shareBlob(receipt, blob);
    // Safari pide un toque nuevo si generar el PDF tardó: se ofrece un botón Compartir con el PDF ya listo
    if (outcome === 'blocked') setRetry({ receipt, blob });
  };

  const handleRetryShare = async () => {
    if (!retry) return;
    const outcome = await shareBlob(retry.receipt, retry.blob);
    if (outcome !== 'blocked') setRetry(null);
  };

  const handleListDownload = async (receipt: Receipt) => {
    if (busyId) return;
    setError(null);
    let blob = cachedPdf(receipt);
    if (!blob) {
      setBusyId(receipt.id);
      try {
        blob = await buildPdf(receipt);
      } catch (err) {
        setError(errorMessage(err, 'No se pudo generar el PDF del recibo.'));
        return;
      } finally {
        setBusyId(null);
      }
    }
    downloadBlob(blob, receiptFileName(receipt));
  };

  // ── Guardar / eliminar ─────────────────────────────────────────────────────

  const handleSave = async (payload: ReceiptPayload): Promise<ReceiptSubmitFailure | void> => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    const wasEditing = editing !== null;
    try {
      const saved = editing ? await receiptsApi.update(editing.id, payload) : await receiptsApi.create(payload);
      setSuccessMessage(`Recibo ${receiptLabel(saved.number)} ${wasEditing ? 'actualizado' : 'generado'}`);
      setRetry(null);
      closeForm();
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      void fetchReceipts();
      void prepareResult(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_NUMBER') {
        void refreshNext();
        return { field: 'number', message: err.message };
      }
      setFormError(errorMessage(err, 'Error al guardar el recibo. Por favor intente nuevamente.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (receipt: Receipt) => {
    if (deleteInProgress) return;
    const label = receiptLabel(receipt.number);
    if (!window.confirm(`¿Eliminar el recibo ${label}? El número no se reutiliza salvo que sea el último.`)) return;

    setDeleteInProgress(true);
    setError(null);
    try {
      await receiptsApi.delete(receipt.id);
      setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
      if (editing?.id === receipt.id) closeForm();
      if (result?.receipt.id === receipt.id) setResult(null);
      if (retry?.receipt.id === receipt.id) setRetry(null);
      setSuccessMessage(`Recibo ${label} eliminado`);
    } catch (err) {
      setError(errorMessage(err, 'Error al eliminar el recibo'));
      await fetchReceipts();
    } finally {
      setDeleteInProgress(false);
    }
  };

  return (
    <div ref={topRef} className="scroll-mt-20 rounded-lg bg-white p-4 shadow sm:p-6">
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4">
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold">Recibos</h2>
        <button
          type="button"
          onClick={() => void openNew()}
          disabled={opening}
          className="flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Plus className="mr-2 h-5 w-5" />
          Nuevo recibo
        </button>
      </div>

      {result && (
        <ReceiptResult
          result={result}
          onShare={() => void handleResultShare()}
          onDownload={handleResultDownload}
          onRetry={() => void prepareResult(result.receipt)}
          onClose={() => setResult(null)}
        />
      )}

      {showForm && (
        <div ref={formRef} className="scroll-mt-20">
          <ReceiptForm
            key={formKey}
            editing={editing}
            next={next}
            guests={guests}
            guestsLoading={guestsLoading}
            guestsError={guestsError}
            initialGuest={formGuest}
            saving={saving}
            error={formError}
            onSubmit={handleSave}
            onCancel={closeForm}
          />
        </div>
      )}

      <h3 className="mb-3 text-lg font-semibold">Recibos emitidos</h3>
      {receipts.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          {receiptsLoading ? 'Cargando recibos...' : 'Todavía no generaste recibos'}
        </p>
      ) : (
        <ReceiptList
          receipts={receipts}
          busyId={busyId}
          retryId={retry?.receipt.id ?? null}
          deleting={deleteInProgress}
          onShare={(receipt) => void handleListShare(receipt)}
          onRetryShare={() => void handleRetryShare()}
          onDownload={(receipt) => void handleListDownload(receipt)}
          onEdit={openEdit}
          onDelete={(receipt) => void handleDelete(receipt)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg md:bottom-6"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
