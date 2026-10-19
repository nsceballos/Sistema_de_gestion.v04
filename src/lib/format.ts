/** Formato de montos es-AR: 290.000,00 */
export const formatMoney = (value: number, decimals = 2): string =>
  value.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Mensaje legible de un error desconocido (para catch sin `any`) */
export const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;
