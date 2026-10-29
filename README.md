# Sistema Integral de Gestión Ganadera

Plataforma web instalable (PWA), offline-first, para bovinos y bufalinos. Plan completo en [docs/PLAN_DESARROLLO.md](docs/PLAN_DESARROLLO.md) y del ERP en [docs/PLAN_ERP.md](docs/PLAN_ERP.md); decisiones en [docs/adr](docs/adr).

## Requisitos

Node 22 y pnpm 10 (`corepack enable`). No se necesita Docker: en desarrollo la base es PGlite.

## Puesta en marcha

```bash
pnpm install
pnpm --filter @ganaderia/api seed      # crea datos y credenciales de desarrollo
pnpm --filter @ganaderia/api start     # API en http://127.0.0.1:3000
pnpm --filter @ganaderia/web build     # el service worker solo existe en el build
pnpm --filter @ganaderia/web preview   # app en http://localhost:4173
```

Las credenciales de desarrollo quedan en `apps/api/.seed-credentials.json` (ignorado por git). El seed no corre con `NODE_ENV=production`.

Para desarrollo con recarga: `pnpm --filter @ganaderia/web dev` (puerto 5173, sin service worker).

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
