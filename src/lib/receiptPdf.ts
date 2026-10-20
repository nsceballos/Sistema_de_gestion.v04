import type { Receipt } from './api';

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

/**
 * Genera el PDF del recibo con el diseño de Encantos del Valle.
 * PENDIENTE: lo implementa el agente de PDF (ver PLAN_DE_MEJORA.md, sección 5).
 */
export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Blob> {
  void data;
  throw new Error('La generación de PDF todavía no está implementada');
}
