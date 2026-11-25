# Sistema Integral de Gestión Ganadera

Plataforma web instalable (PWA), offline-first, para bovinos y bufalinos. Plan completo en [docs/PLAN_DESARROLLO.md](docs/PLAN_DESARROLLO.md) y del ERP en [docs/PLAN_ERP.md](docs/PLAN_ERP.md); decisiones en [docs/adr](docs/adr).

## Requisitos

Node 22 y pnpm 10 (`corepack enable`). No se necesita Docker: en desarrollo la base es PGlite.

## Puesta en marcha

Todo sale por **un solo puerto**: la landing en `/`, la aplicación en `/app/` y la API en `/v1/`.

```bash
pnpm install
pnpm --filter @ganaderia/api seed   # crea datos y credenciales de desarrollo (una vez)
pnpm start                          # compila landing y app y las sirve en http://localhost:4173
```

Las credenciales de desarrollo quedan en `apps/api/.seed-credentials.json` (ignorado por git). El seed no corre con `NODE_ENV=production`.

Desarrollo con recarga (puertos separados): `pnpm --filter @ganaderia/web dev` (5173, en `/app/`) y `pnpm --filter @ganaderia/landing dev` (5175). El servicio worker solo existe en la versión compilada.

## Ecosistema FEDEGÁN 5.0

La app conecta lo que ya existe en el gremio en vez de duplicarlo:

| Módulo | Fuente | Cómo se conecta |
|---|---|---|
| Noticias (y franja en Inicio) | CONtexto Ganadero | Feed RSS público `/feed.xml` |
| Capacitación | Escuela Virtual FEDEGÁN–FNG | Catálogo leído de su sitio. Con la clave de aliado (abajo) la persona se inscribe, ve las lecciones, presenta evaluaciones y obtiene su certificado dentro de la app |
| Tienda TvGan (y «Comprar en TvGan» en Compras e insumos) | TvGan (Odoo) | Búsqueda pública de productos; la compra y el pago se hacen en TvGan |
| Asistente de la finca | CONtexto Ganadero | `/api/assistant` devuelve notas del archivo que el asistente cita como [n] |
| Comunidad | Propia (tablas `community_*`) | Preguntas y experiencias entre productores, con reportes y ocultamiento |

El servidor guarda en memoria cada respuesta externa un tiempo y, si una fuente falla, sirve la última buena. Variables opcionales: `CONTEXTO_URL`, `ESCUELA_URL`, `TVGAN_URL` (otros ambientes) y `ECOSISTEMA=0` (apaga los conectores, p. ej. sin salida a internet).

### Estudiar los cursos dentro de la app (API de aliados de la Escuela)

La Escuela Virtual guarda cuentas, inscripciones, avance y evaluaciones en su propio servidor, así que Gestión Ganadera habla con una API de aliados que se agrega a ese portal (`/api/aliados/v1`; el cambio está en `docs/escuela/0001-api-aliados.patch`, un `git am` sobre el repositorio `fedegan`). La app nunca llama a la Escuela desde el celular: lo hace el servidor con una clave de aliado.

- **Escuela (repo `fedegan`)**: variable `ALIADO_GESTIONGANADERA_CLAVE` (mínimo 24 caracteres). Cada aliado tiene la suya: `ALIADO_<NOMBRE>_CLAVE`.
- **Esta app (servidor)**: `ESCUELA_API_KEY` (la misma clave) y, si la Escuela no está en `fedegan.vercel.app`, `ESCUELA_API_URL` (p. ej. `https://escuela.fedegan.org.co/api/aliados/v1`). Sin la clave, las tarjetas siguen mostrando el curso y el enlace a la Escuela.
- **Identidad**: la persona se identifica con el id de su usuario aquí; en la Escuela queda como estudiante `gestionganadera:<id>`, que no puede coincidir con ninguna cuenta del portal ni suplantar a nadie por su correo. Lo estudiado aquí no aparece en «Mis cursos» del portal, sino en la app.
- **Seguridad**: clave comparada en tiempo constante, sin clave configurada nadie entra, video y contenido solo de las lecciones que la persona puede abrir (inscrita o vista previa) y evaluaciones calificadas en el servidor de la Escuela.


## Calidad

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Estructura

| Ruta | Contenido |
|---|---|
| `apps/api` | API Fastify, migraciones SQL, RLS, auditoría, sincronización |
| `apps/landing` | Página de presentación (Vite, estática). `VITE_APP_URL` y `VITE_CONTACT_EMAIL` configuran los enlaces |
| `apps/web` | PWA React; base local cifrada en un Worker (SQLite-WASM) |
| `packages/contracts` | Esquemas Zod y tipos compartidos |
| `packages/domain` | Reglas puras: arete, genealogía, categorías, permisos, UUID v7 |
| `packages/ui` | Tokens del manual de marca y pruebas de contraste |
| `spikes/s0-offline-storage` | Prueba de almacenamiento local (resultados en `docs/spikes`) |
