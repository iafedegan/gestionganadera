# Sistema Integral de Gestión Ganadera

Plataforma web instalable (PWA), offline-first, para bovinos y bufalinos. Plan completo en [docs/PLAN_DESARROLLO.md](docs/PLAN_DESARROLLO.md) y del ERP en [docs/PLAN_ERP.md](docs/PLAN_ERP.md); decisiones en [docs/adr](docs/adr).

## Requisitos

Node 22 y pnpm 10 (`corepack enable`). No se necesita Docker: en desarrollo la base es PGlite.

## Puesta en marcha

Todo sale por **un solo puerto**: la landing en `/`, la aplicación en `/app/` y la API en `/v1/`.

```bash
pnpm install
pnpm --filter @ganaderia/api seed   # crea datos y credenciales de desarrollo (una vez)
pnpm start                          # compila landing y app y las sirve en http://localhost:3000
```

Las credenciales de desarrollo quedan en `apps/api/.seed-credentials.json` (ignorado por git). El seed no corre con `NODE_ENV=production`.

Desarrollo con recarga (puertos separados): `pnpm --filter @ganaderia/web dev` (5173, en `/app/`) y `pnpm --filter @ganaderia/landing dev` (5175). El servicio worker solo existe en la versión compilada.

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
