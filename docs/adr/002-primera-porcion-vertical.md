# ADR-002 · Primera porción vertical: acceso → finca → animal → sin conexión → sincronización

Estado: **implementada** (29 oct 2026) · Cubre parcialmente RF L01, L02, L03 (solo entrada), L11, L12 y los CA L01 y L08.

## Qué hace

1. **Acceso** con correo y contraseña (Argon2id). Sesión por cookie `httpOnly` + `SameSite=Strict`, bloqueo tras 5 fallos, respuesta idéntica para usuario inexistente y contraseña errónea.
2. **Fincas** por organización (alta en línea, como exige el TDR) y **animales** con especie, sexo, categoría, genealogía opcional y evento de entrada.
3. **Alta de animales sin conexión**: se guarda en una base SQLite local cifrada y se encola como comando con UUID v7.
4. **Sincronización explícita**: al entrar, al recuperar red y con botón. Envía comandos (idempotentes) y descarga cambios por cursor. Centro de sincronización con pendientes, rechazados y conflictos, y acciones *Corregir* y *Descartar*.
5. **Arranque en frío sin servidor**: el service worker precachea la aplicación, las fuentes y el motor SQLite; con web y API detenidas la app abre, desbloquea con contraseña y muestra los datos.

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Base de datos en desarrollo | PGlite (PostgreSQL real en WASM) en `apps/api/.data`; PostgreSQL con `DATABASE_URL` en producción. Misma capa `Db`, mismas migraciones | No hay Docker ni PostgreSQL instalados; RLS y triggers funcionan igual |
| Acceso a datos | SQL directo con migraciones versionadas (`apps/api/migrations`) | Menos piezas por ahora; el plan mencionaba Drizzle y puede adoptarse después |
| UI | CSS propio sobre `packages/ui/tokens.css` | El plan mencionaba Tailwind; no hacía falta para esta porción |
| Aislamiento | RLS por organización (`app_rw` + `app.org_id`) y permisos por finca en el servidor | Defensa en profundidad |
| Cursor de sincronización | Contador por organización, incrementado bajo un bloqueo asesor por organización | Orden de commit = orden de versión; evita el salto de filas de las secuencias globales |
| Cambio de fincas autorizadas | El servidor envía `scope` (huella de fincas); si cambia, el cliente descarga desde cero | Sin esto, una finca asignada después nunca llegaría al dispositivo |
| Respuestas 5xx | Se tratan como «sin conexión» | Un servidor caído detrás de un proxy responde 500/502; los datos locales siguen seguros |
| Clave local | Clave de datos aleatoria, envuelta con PBKDF2 (600.000 iteraciones) derivado de la contraseña; solo existe en memoria del Worker | Recargar la página pide la contraseña de nuevo, también con sesión válida |
| Permiso offline | 72 h desde el último inicio en línea; se renueva en cada sincronización exitosa | TDR RF L11 |
| Auditoría | Cadena de hashes por organización + triggers que impiden UPDATE/DELETE | TDR RF L12 |
| Alta de animal offline | Habilitada, aunque el TDR liviano la deja solo en línea (RF L11) | Decisión del propietario: todo debe funcionar sin internet; ver `PLAN_DESARROLLO.md` §2 |

## Verificación

- `pnpm test`: 46 pruebas (contraste de marca 9, dominio 15, API 22) más lint y tipos.
- Pruebas de API: idempotencia, conflicto de arete en la misma organización y no entre organizaciones, aislamiento (HTTP y RLS), usuario restringido a una finca, paginación por cursor, inmutabilidad, cadena de auditoría y permisos.
- Prueba manual en navegador (Chromium del app de escritorio): registro en línea, registro con API detenida, recarga + desbloqueo con contraseña incorrecta y correcta sin servidor, reconexión y sincronización, arranque con web y API detenidas.

## Límites conocidos (por hacer)

- Solo existe el comando `animal.register`; no hay bajas, traslados, edición ni reingreso.
- Los conflictos de arete que el cliente no ve (animal creado por otro dispositivo aún no descargado) llegan como `conflicto` del servidor; hoy se resuelven corrigiendo el arete.
- Sin MFA, sin recuperación de contraseña, sin administración de usuarios (los usuarios salen del seed).
- La pestaña única es obligatoria: `opfs-sahpool` bloquea el archivo y una segunda pestaña no abre la base (la app lo avisa al desbloquear). Pendiente coordinar con Web Locks.
- Solo probado en Chromium de escritorio. Faltan Android de gama baja, iOS y 48 h sin red reales.
- Sin límite de intentos persistente ni rate limiting global (el bloqueo vive en memoria del proceso).
- El ícono de la PWA es provisional; falta el emblema oficial.
- Si la contraseña cambia en el servidor, la copia local se reinicia al iniciar sesión en línea (y se pierden pendientes no enviados). Falta advertir antes.
- Cambiar de organización y la selección de varias organizaciones no están en la interfaz (se usa la primera).
