import { useEffect, useState } from 'react';

const CACHE_KEY = 'exchange_rate_cache';
const RATE_URL = 'https://dolarapi.com/v1/dolares/oficial';

interface CachedRate {
  rate: number;
  fetchedAt: string;
}

/**
 * - live: cotización recién obtenida
 * - cached: falló la consulta, se usa la última cotización guardada
 * - unavailable: falló la consulta y no hay cotización guardada (cargarla a mano)
 */
export type ExchangeRateStatus = 'loading' | 'live' | 'cached' | 'unavailable';

function readCache(): CachedRate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRate;
    return parsed.rate > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Dólar oficial (venta) de dolarapi.com, con la última cotización guardada como respaldo */
export function useExchangeRate() {
  const [cached] = useState(readCache);
  const [rate, setRate] = useState<number | null>(cached?.rate ?? null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(cached?.fetchedAt ?? null);
  const [status, setStatus] = useState<ExchangeRateStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch(RATE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ venta?: number }>;
      })
      .then((data) => {
        if (typeof data.venta !== 'number' || data.venta <= 0) throw new Error('Cotización inválida');
        if (cancelled) return;
        const entry: CachedRate = { rate: data.venta, fetchedAt: new Date().toISOString() };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        } catch {
          // localStorage lleno o bloqueado: seguimos sin cache
        }
        setRate(entry.rate);
        setFetchedAt(entry.fetchedAt);
        setStatus('live');
      })
      .catch(() => {
        if (!cancelled) setStatus(readCache() ? 'cached' : 'unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rate, status, fetchedAt };
}

/** Convierte ARS a USD con 2 decimales; 0 si no hay tipo de cambio */
export function toUSD(ars: number, rate: number | null | undefined): number {
  if (!rate || rate <= 0) return 0;
  return Number((ars / rate).toFixed(2));
}

/**
 * Tipo de cambio con el que se guardó un registro existente: el almacenado o, en
 * registros viejos, el implícito en sus montos. Al editar se usa este y no el de hoy,
 * para no distorsionar los montos históricos en USD.
 */
export function rateFromRecord(exchangeRate: number | undefined, ars: number, usd: number): number | null {
  if (exchangeRate && exchangeRate > 0) return exchangeRate;
  if (ars > 0 && usd > 0) return Number((ars / usd).toFixed(2));
  return null;
}
