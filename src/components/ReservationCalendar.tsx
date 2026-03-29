import React, { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Settings, X, Copy, Check, RefreshCw } from 'lucide-react';
import { calendarApi, type CalendarConfig, type ExternalEvent } from '../lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Reservation {
  id: string;
  guest: {
    check_in_date: string;
    check_out_date: string;
    cabin_number: number;
  };
}

interface Props {
  reservations: Reservation[];
}

// Source metadata for display
const SOURCES = {
  cabin1_airbnb: { label: 'Airbnb · Cabaña 1', color: '#FF5A5F', border: '#e0393e' },
  cabin1_booking: { label: 'Booking · Cabaña 1', color: '#003580', border: '#002a66' },
  cabin2_airbnb: { label: 'Airbnb · Cabaña 2', color: '#ff8c00', border: '#e07b00' },
  cabin2_booking: { label: 'Booking · Cabaña 2', color: '#0077cc', border: '#005fa3' },
} as const;

type SourceKey = keyof typeof SOURCES;

// ─── Copy button ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="ml-2 p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
      title="Copiar"
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

// ─── Settings modal ────────────────────────────────────────────────────────

function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const exportBase = `${window.location.origin}/api/calendar`;
  const [config, setConfig] = useState<CalendarConfig>({
    cabin1_airbnb: '',
    cabin1_booking: '',
    cabin2_airbnb: '',
    cabin2_booking: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    calendarApi.getConfig()
      .then(setConfig)
      .catch(() => {/* start with empty */})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await calendarApi.saveConfig(config);
      setSavedOk(true);
      setTimeout(() => {
        setSavedOk(false);
        onSaved();
        onClose();
      }, 800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-800">Integración de calendarios</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Export section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">
              1. Exportar — pegá estas URLs en Airbnb / Booking
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Las plataformas las consultan periódicamente para bloquear fechas ocupadas.
            </p>
            {[1, 2].map((cabin) => (
              <div key={cabin} className="mb-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  Cabaña {cabin}
                </label>
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 break-all flex-1 font-mono">
                    {exportBase}/cabin/{cabin}.ics
                  </span>
                  <CopyButton text={`${exportBase}/cabin/${cabin}.ics`} />
                </div>
              </div>
            ))}
          </section>

          <hr className="border-gray-100" />

          {/* Import section */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">
              2. Importar — pegá las URLs de cada plataforma
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Encontrás estas URLs en la sección "Sincronizar calendario" de cada plataforma.
            </p>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
              </div>
            ) : (
              <div className="space-y-3">
                {(Object.keys(SOURCES) as SourceKey[]).map((key) => {
                  const { label, color } = SOURCES[key];
                  return (
                    <div key={key}>
                      <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ background: color }}
                        />
                        {label}
                      </label>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={config[key]}
                        onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {savedOk ? (
                <><Check className="h-4 w-4" /> Guardado</>
              ) : saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ReservationCalendar({ reservations }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [externalEvents, setExternalEvents] = useState<
    Array<{ id: string; title: string; start: string; end: string; backgroundColor: string; borderColor: string; extendedProps: { external: true } }>
  >([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const configRef = useRef<CalendarConfig | null>(null);

  const syncExternal = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const config = configRef.current ?? await calendarApi.getConfig();
      configRef.current = config;

      const sources: Array<{ key: SourceKey; url: string }> = (
        Object.entries(config) as Array<[SourceKey, string]>
      ).filter(([, url]) => url.trim() !== '').map(([key, url]) => ({ key, url }));

      if (sources.length === 0) {
        setExternalEvents([]);
        return;
      }

      const results = await Promise.allSettled(
        sources.map(({ url }) => calendarApi.getExternalEvents(url)),
      );

      const combined: typeof externalEvents = [];
      results.forEach((result, idx) => {
        if (result.status !== 'fulfilled') return;
        const { label, color, border } = SOURCES[sources[idx].key];
        result.value.forEach((ev: ExternalEvent) => {
          combined.push({
            id: `ext-${sources[idx].key}-${ev.id}`,
            title: label,
            start: ev.start,
            end: ev.end,
            backgroundColor: color,
            borderColor: border,
            extendedProps: { external: true },
          });
        });
      });

      setExternalEvents(combined);
    } catch (e) {
      setSyncError('No se pudieron sincronizar algunos calendarios externos.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    syncExternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myEvents = reservations.map((r) => ({
    id: r.id,
    title: `Cabaña ${r.guest.cabin_number}`,
    start: r.guest.check_in_date,
    end: r.guest.check_out_date,
    backgroundColor: r.guest.cabin_number === 1 ? '#818cf8' : '#f87171',
    borderColor: r.guest.cabin_number === 1 ? '#6366f1' : '#ef4444',
    extendedProps: { external: false },
  }));

  return (
    <>
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" /> Cabaña 1
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Cabaña 2
            </span>
            {externalEvents.length > 0 && (
              <span className="flex items-center gap-1.5 text-gray-400 italic">
                + {externalEvents.length} bloqueos externos
              </span>
            )}
          </div>

          {/* Sync + Settings */}
          <div className="flex gap-2">
            <button
              onClick={syncExternal}
              disabled={syncing}
              title="Sincronizar calendarios externos"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Integración</span>
            </button>
          </div>
        </div>

        {syncError && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            {syncError}
          </p>
        )}

        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="es"
          events={[...myEvents, ...externalEvents]}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek',
          }}
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana' }}
          height="auto"
          eventContent={(info) => (
            <div className="px-1 py-0.5 truncate text-xs font-semibold">
              {info.event.extendedProps.external && (
                <span className="opacity-75 mr-1">🔒</span>
              )}
              {info.event.title}
            </div>
          )}
        />
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={syncExternal}
        />
      )}
    </>
  );
}
