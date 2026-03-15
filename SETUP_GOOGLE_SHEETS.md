# Configuración de Google Sheets como Base de Datos

Esta aplicación usa **Google Sheets** como base de datos para almacenar usuarios, reservas y gastos. Sigue estos pasos para configurarla.

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

La aplicación creará automáticamente las hojas necesarias (`Usuarios`, `Huespedes`, `Gastos`, `Reservas`) la primera vez que arranque.

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

# Secreto JWT (genera uno aleatorio largo)
JWT_SECRET=mi_secreto_super_seguro_2024

PORT=3001
FRONTEND_URL=http://localhost:5173
```

**Consejo:** Para convertir el JSON de la cuenta de servicio a una sola línea, puedes usar:
```bash
cat tu-archivo-de-clave.json | tr -d '\n'
```

---

## 6. Instalar dependencias y correr la aplicación

```bash
npm install
npm run dev
```

Esto arrancará simultáneamente:
- El servidor backend en `http://localhost:3001`
- El frontend en `http://localhost:5173`

---

## Estructura de la Base de Datos en Google Sheets

La aplicación crea y gestiona automáticamente estas hojas:

| Hoja | Descripción |
|------|-------------|
| **Usuarios** | Credenciales de acceso al sistema (email + contraseña hasheada) |
| **Huespedes** | Datos completos de cada reserva (fechas, montos, cabaña, etc.) |
| **Gastos** | Registro de gastos operativos por categoría |
| **Reservas** | Estado de las reservas vinculadas a huéspedes |

---

## Seguridad

- Las contraseñas se almacenan con **bcrypt** (hash + salt), nunca en texto plano
- Los tokens de sesión son **JWT** firmados con `JWT_SECRET` y expiran en 7 días
- La cuenta de servicio solo tiene acceso a la hoja de cálculo específica compartida con ella
- El `GOOGLE_SERVICE_ACCOUNT_JSON` **nunca debe exponerse al cliente** — solo vive en el servidor
