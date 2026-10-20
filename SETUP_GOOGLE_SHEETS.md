# Configuración de Google Sheets como Base de Datos

Esta aplicación usa **Google Sheets** como base de datos para almacenar usuarios, reservas, gastos y recibos. Sigue estos pasos para configurarla.

---

## 1. Crear el proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto (o usa uno existente)
3. En el menú lateral, ve a **APIs y servicios → Biblioteca**
4. Busca **Google Sheets API** y habilítala

---

## 2. Crear la Cuenta de Servicio

1. Ve a **APIs y servicios → Credenciales**
2. Haz clic en **Crear credenciales → Cuenta de servicio**
3. Asigna un nombre (ej: `gestion-encantos-service`)
4. Continúa sin asignar roles por ahora
5. En la lista de cuentas de servicio, haz clic en la que acabas de crear
6. Ve a la pestaña **Claves** → **Agregar clave → Crear clave nueva → JSON**
7. Descarga el archivo JSON — guárdalo en un lugar seguro

---

## 3. Crear la Hoja de Cálculo de Google Sheets

1. Ve a [Google Sheets](https://sheets.google.com/) y crea una hoja de cálculo nueva
2. Nómbrala (ej: `Gestión Encantos DB`)
3. Copia el **ID** de la URL: `https://docs.google.com/spreadsheets/d/**<SPREADSHEET_ID>**/edit`

---

## 4. Compartir la hoja con la Cuenta de Servicio

1. En la hoja de cálculo, haz clic en **Compartir**
2. Agrega el email de la cuenta de servicio (ej: `gestion-encantos-service@tu-proyecto.iam.gserviceaccount.com`)
3. Asígnale el rol **Editor**
4. Haz clic en **Enviar**

La aplicación creará automáticamente las hojas necesarias (`Usuarios`, `Huespedes`, `Gastos`, `Reservas` y `Recibos`) la primera vez que arranque.

---

## 5. Configurar variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

Edita `.env`:

```env
# ID de la hoja (de la URL de Google Sheets)
GOOGLE_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms

# Contenido del JSON de la cuenta de servicio (en una sola línea)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"mi-proyecto",...}

# Secreto JWT (obligatorio en producción): generá uno largo y aleatorio con `openssl rand -hex 32`
JWT_SECRET=pegá_acá_el_valor_generado

# Emails que pueden crear una cuenta (además de la primera). Separados por comas.
ALLOWED_EMAILS=socio@ejemplo.com,otra.persona@ejemplo.com

# Número del primer recibo cuando todavía no hay ninguno cargado (opcional; por defecto 53)
RECEIPT_START_NUMBER=53

PORT=3001
FRONTEND_URL=http://localhost:5173
```

**Consejo:** Para convertir el JSON de la cuenta de servicio a una sola línea, puedes usar:
```bash
cat tu-archivo-de-clave.json | tr -d '\n'
```

### `JWT_SECRET` (obligatorio en producción)

Es la clave con la que se firman las sesiones. En Vercel (o con `NODE_ENV=production`) el servidor
**no permite iniciar sesión** si `JWT_SECRET` no está configurado o tiene un valor de ejemplo
(como el de `.env.example`): responde un error que explica cómo configurarlo.
En desarrollo local, si falta, se usa un secreto de prueba y se muestra un aviso en la consola.

Para generarlo:
```bash
openssl rand -hex 32
```

Si lo cambiás, las sesiones abiertas dejan de valer y hay que volver a iniciar sesión.

### `ALLOWED_EMAILS` (quién puede registrarse)

- La **primera cuenta** se puede crear sin restricciones (cuando la hoja `Usuarios` todavía no tiene usuarios).
- Después, sólo pueden registrarse los emails que estén en `ALLOWED_EMAILS`
  (separados por comas; no importan las mayúsculas ni los espacios). Si está vacía, el registro queda cerrado.
- Los usuarios que ya existen siempre pueden iniciar sesión.

Para sumar a alguien: agregá su email a `ALLOWED_EMAILS`, volvé a desplegar, pedile que se registre
y después podés sacarlo de la lista.

### `RECEIPT_START_NUMBER` (numeración de recibos)

Es opcional. Define con qué número arranca la numeración de los recibos **mientras la hoja `Recibos`
todavía está vacía** (por defecto, **53**: el N° 0053). Tiene que ser un número entero mayor o igual a 1;
si falta o no es válido, se usa 53.

Una vez que hay recibos cargados, el próximo número siempre es **el más alto + 1** (aunque falten
números intermedios), así que cambiar esta variable después no altera la numeración ya empezada.
Si necesitás saltar a otro número, cargá un recibo indicando ese número a mano.

---

## 6. Variables de entorno en Vercel

En el proyecto de Vercel, andá a **Settings → Environment Variables** y cargá las mismas variables
(`GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `JWT_SECRET` y, si hace falta, `ALLOWED_EMAILS` y `RECEIPT_START_NUMBER`).
Después de cambiarlas, volvé a desplegar (**Deployments → Redeploy**) para que se apliquen.

---

## 7. Instalar dependencias y correr la aplicación

```bash
npm install
npm run dev
```

Esto arrancará simultáneamente:
- El servidor backend en `http://localhost:3001`
- El frontend en `http://localhost:5173`

Para correr los tests del servidor:

```bash
npm test
```

---

## Estructura de la Base de Datos en Google Sheets

La aplicación crea y gestiona automáticamente estas hojas:

| Hoja | Descripción |
|------|-------------|
| **Usuarios** | Credenciales de acceso al sistema (email + contraseña hasheada) |
| **Huespedes** | Datos completos de cada reserva (fechas, montos, cabaña, etc.) |
| **Gastos** | Registro de gastos operativos por categoría |
| **Reservas** | Estado de las reservas vinculadas a huéspedes |
| **Recibos** | Recibos de reserva emitidos: número correlativo, fecha, huésped, monto, concepto y datos del hospedaje |

### Columnas nuevas (se agregan solas)

Cuando la app necesita columnas nuevas, las agrega **automáticamente** al arrancar, a la derecha de la
última columna que ya tenga cabecera. No se mueven, renombran ni borran las columnas existentes, así que
podés agregar columnas propias en la planilla (por ejemplo notas internas): la app las respeta y no las pisa.

Columnas agregadas en esta versión:

| Hoja | Columna | Contenido |
|------|---------|-----------|
| **Huespedes** | `guest_name` | Nombre del huésped |
| **Huespedes** | `source` | Canal de la reserva: `Directo`, `Booking`, `Airbnb` o vacío |
| **Huespedes** | `exchange_rate` | Pesos por dólar usados al calcular los montos en USD (0 = desconocido, reservas viejas) |
| **Gastos** | `exchange_rate` | Pesos por dólar usados al calcular el monto en USD |

### Hoja `Recibos`

Se crea **sola** la primera vez que arranca la versión con recibos, también en una planilla que ya
tiene datos (no hace falta crearla a mano, y las demás hojas no se tocan). Sus columnas son:
`id`, `number`, `receipt_date`, `guest_name`, `amount_ars`, `concept`, `detail`, `holder_name`,
`holder_phone`, `holder_address`, `guest_id`, `created_at`, `updated_at`.

- Cada recibo guarda los datos del hospedaje (`holder_*`), así no quedan escritos en el código:
  al emitir uno nuevo, la app precarga los del último recibo.
- `number` es el número correlativo (el N° 0053 se guarda como `53`) y no se puede repetir: la app
  rechaza un recibo con un número que ya existe.
- Si editás la hoja a mano, no repitas números ni cambies los nombres de las cabeceras.

**Importante:** la app identifica cada columna por el **nombre de su cabecera** (fila 1).
No cambies el nombre de esas cabeceras ni borres la fila 1.

---

## Seguridad

- Las contraseñas se almacenan con **bcrypt** (hash + salt), nunca en texto plano
- Los tokens de sesión son **JWT** firmados con `JWT_SECRET` y expiran en 7 días; cuando vencen, la app vuelve a la pantalla de inicio de sesión
- El registro está cerrado salvo para la primera cuenta y los emails de `ALLOWED_EMAILS`
- La cuenta de servicio solo tiene acceso a la hoja de cálculo específica compartida con ella
- El `GOOGLE_SERVICE_ACCOUNT_JSON` **nunca debe exponerse al cliente** — solo vive en el servidor
