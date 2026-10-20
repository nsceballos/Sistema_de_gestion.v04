export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'blocked';

/** Descarga un archivo generado en el navegador */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Abre el menú de compartir del celular con el PDF (para elegir WhatsApp).
 * Si el navegador no puede compartir archivos (p. ej. en la compu), lo descarga.
 *
 * - 'cancelled': el usuario cerró el menú de compartir.
 * - 'blocked': el navegador exige un toque reciente (Safari, si generar el PDF tardó):
 *   mostrar un botón "Compartir" que vuelva a llamar a esta función con el mismo blob.
 */
export async function sharePdf(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      // InvalidStateError: ya hay un menú de compartir abriéndose (doble toque en Android)
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'InvalidStateError')) {
        return 'cancelled';
      }
      if (err instanceof DOMException && err.name === 'NotAllowedError') return 'blocked';
      // Cualquier otro error: se descarga como alternativa
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}
