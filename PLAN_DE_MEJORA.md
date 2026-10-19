# Plan de mejora — Gestión Encantos

Análisis completo de la app (frontend React + API Express + Google Sheets) y plan de trabajo
ejecutado con subagentes, alternando modelos según el tipo de tarea.

## 1. Diagnóstico

### Seguridad
| # | Problema | Impacto |
|---|----------|---------|
| S1 | El registro está abierto: cualquiera con la URL puede crear una cuenta y ver **todas** las reservas y teléfonos de los huéspedes. | Alto |
| S2 | `JWT_SECRET` tiene un valor por defecto en el código. Si no está configurado en Vercel, cualquiera puede fabricar un token válido. | Alto |
| S3 | Cuando el token vence (7 días) la app no vuelve al login: todas las pantallas muestran errores. | Medio |

### Datos y bugs
| # | Problema |
|---|----------|
| D1 | Al editar una reserva vieja se recalcula el USD con el dólar **de hoy** → se distorsionan los ingresos históricos en USD. |
| D2 | Si falla dolarapi.com se usa un dólar fijo de 850 sin avisar. |
| D3 | No hay validación: se puede guardar una salida anterior a la entrada o una seña mayor al total. |
| D4 | No se detectan reservas superpuestas en la misma cabaña (riesgo de doble reserva entre Booking, Airbnb y directas). |
| D5 | La columna de acciones no entra en pantalla ("Enviar Recordatorio" queda cortado, se ve en la captura). |
| D6 | "Editar" abre el formulario arriba, fuera de la vista; "Nueva reserva" con una edición abierta queda en un estado inconsistente. |
| D7 | Gastos: la API permite editar, pero la pantalla no. |
| D8 | El panel vuelve a pedir todo al servidor cada vez que se cambia USD/ARS. |
| D9 | Cada operación crea un cliente de Google nuevo (se vuelve a autenticar en cada request → lento). |
| D10 | No se pueden agregar columnas nuevas a la planilla: las cabeceras sólo se escriben si la fila 1 está vacía, y las filas se escriben en un orden fijo. |
| D11 | `https-proxy-agent` se usa pero no está declarado en `package.json`. |
| D12 | El calendario importa el idioma español pero no lo usa (los días y meses salen en inglés). |

### Calidad de código
| # | Problema |
|---|----------|
| Q1 | Código muerto de Supabase (`supabase.ts`, `ical.ts`, `src/api/ical`, `GuestRegistration.tsx`) → 13 errores de TypeScript y 12 de lint. |
| Q2 | Lógica duplicada: tipo de cambio ×3, formato de montos ×2, cálculo de "en curso" sólo en el panel. |

### Funcionalidad que falta
| # | Mejora |
|---|--------|
| F1 | **Color por estado en el listado de reservas**: gris = finalizada, verde = en curso, blanco = próxima (pedido). |
| F2 | Nombre del huésped y canal de la reserva (Booking / Airbnb / Directo). |
| F3 | Filtros en el listado (Todas / Próximas / En curso / Pasadas). |
| F4 | Vista en tarjetas para el celular. |
| F5 | Ocupación del mes por cabaña en el panel. |

## 2. Equipo y asignación de modelos

| # | Tarea | Agente | Modelo | Por qué ese modelo |
|---|-------|--------|--------|--------------------|
| 0 | Contratos compartidos: tipos de la API, helper de estado de reserva, hook de tipo de cambio, sesión vencida | Orquestador | Opus | Define las interfaces que usan todos los demás |
| 1 | Backend: S1, S2, S3, D3, D4, D9, D10, D11 + tests del servidor | `backend` | **Opus** | Seguridad e integridad de datos sobre la planilla real: un error acá puede romper datos |
| 2 | Reservas: F1, F2, F3, F4, D1, D2, D5, D6, D12 | `frontend-reservas` | **Sonnet** | Trabajo de interfaz bien especificado |
| 3 | Gastos, Panel y limpieza: D7, D8, F5, Q1, Q2 | `frontend-gastos-panel` | **Sonnet** | Cambios de rutina con reglas claras |
| 4 | QA visual con datos de prueba y capturas | `qa` | **Sonnet** | Tarea mecánica |
| 5 | Revisión final del cambio completo | `reviewer` | **Opus** | Encontrar bugs sutiles (fechas, zonas horarias, migración de la planilla) |

Las tareas 1, 2 y 3 corren en paralelo, cada agente sobre sus propios archivos. La 4 y la 5 corren al final.

## 3. Contrato de la API (acordado antes de paralelizar)

**Reserva (`Huespedes`)** — campos nuevos:
- `guest_name: string` — nombre del huésped (opcional).
- `source: '' | 'Directo' | 'Booking' | 'Airbnb'` — canal.
- `exchange_rate: number` — ARS por USD usado al calcular los montos en USD (0 = desconocido, reservas viejas).

**Gasto (`Gastos`)** — campo nuevo: `exchange_rate: number`.

**POST/PUT `/api/guests`**
- `400 { message }` si los datos son inválidos (fechas, salida ≤ entrada, cabaña, montos negativos, seña > total).
- `409 { message, code: 'OVERLAP', conflict }` si se superpone con otra reserva de la misma cabaña.
  Reenviar con `allow_overlap: true` para guardar de todos modos. Que una salida coincida con la entrada siguiente **no** cuenta como superposición.
- Las noches (`num_nights`) las calcula el servidor a partir de las fechas.
- Devuelve la reserva completa con los saldos calculados.

**Auth**
- Registro permitido sólo si todavía no hay usuarios (primer usuario) o si el email está en `ALLOWED_EMAILS`.
- Token inválido o vencido → `401` (el frontend vuelve al login).

**Estado de una reserva** (`src/lib/reservations.ts`), con la fecha local de hoy:
- `past` (finalizada): salida < hoy
- `ongoing` (en curso): entrada ≤ hoy ≤ salida (el día de salida todavía cuenta como en curso)
- `upcoming` (próxima): entrada > hoy

## 4. Fase siguiente (propuesta, no incluida en este cambio)

1. **Sincronización iCal con Booking y Airbnb**: exportar un calendario por cabaña para que los canales bloqueen las fechas, e importar sus reservas. Es lo que más reduce el riesgo de doble reserva.
2. **Cobro del saldo**: botón "Marcar saldo cobrado" con fecha de cobro (hoy el saldo sólo baja editando la seña).
3. **Comisiones por canal** (Booking / Airbnb) e ingreso neto real.
4. **Métricas**: tarifa promedio por noche, ocupación anual y comparación interanual.
5. **Plantillas de WhatsApp editables**: bienvenida, recordatorio de saldo, pedido de reseña.
6. **Exportar a Excel/CSV**.
7. Dividir el bundle (832 kB) en partes más chicas, endurecer CORS (hoy acepta cualquier `*.vercel.app`) y limitar los intentos de login.
