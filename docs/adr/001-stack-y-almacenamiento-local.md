# ADR-001 · Stack y almacenamiento local

Estado: **aceptada provisionalmente** (29 oct 2026) · Revisión obligatoria tras probar en Android de gama baja e iOS.

## Contexto

El TDR liviano pide monolito modular, PWA y operación sin conexión acotada; el propietario pide que todo funcione sin internet. Ver `docs/PLAN_DESARROLLO.md`.

## Decisiones

| Tema | Decisión |
|---|---|
| Lenguaje y monorepo | TypeScript, pnpm 10 + Turborepo, Node 22 |
| Calidad | Biome (lint y formato), Vitest, `tsc --noEmit`, CI en GitHub Actions con gitleaks y osv-scanner |
| Almacenamiento local | `@sqlite.org/sqlite-wasm` con VFS **opfs-sahpool** dentro de un Worker |
| Cifrado local | **Cifrado de payloads con AES-GCM (WebCrypto)**; columnas de búsqueda (arete, especie, fechas) quedan en claro. SQLCipher-WASM no evaluado aún |
| Sincronización | Propia: outbox de comandos con UUID generado en el dispositivo + feed de cambios por cursor |
| Tema visual | Tema claro por defecto, tokens del manual de marca en `packages/ui` |

`opfs-sahpool` se eligió porque **no exige** los encabezados COOP/COEP (`crossOriginIsolated` fue `false` en la prueba y funcionó), lo que simplifica el despliegue y la compatibilidad con Safari.

## Supuestos tomados por falta de respuesta (sección 2 del plan)

El usuario aprobó el plan sin responder las cinco decisiones. Se asume lo recomendado, reversible:

1. Motor de sincronización genérico desde el inicio; módulos offline habilitados según se validen (el TDR se cumple como mínimo).
2. Layout de las imágenes de referencia con lenguaje visual del manual.
3. Marca: paleta e identidad de CONtexto Ganadero; sujeto a confirmación.
4. Alojamiento: sin decidir; no bloquea el desarrollo local.
5. Equipo: desarrollo asistido por IA con revisión humana.

## Consecuencias y riesgos abiertos

- Un payload cifrado no se puede filtrar ni ordenar con SQL; lo que se consulta con frecuencia debe estar en columnas en claro. Hay que clasificar cada campo (sensible / consultable).
- `opfs-sahpool` mantiene acceso exclusivo al archivo: **no probado** el comportamiento con dos pestañas. Posible solución: coordinar con un Web Lock y un único Worker compartido.
- La clave de la prueba fue efímera. La clave real debe derivarse/envolverse con la contraseña o biometría y renovarse con el lease de 72 h (diseño pendiente, ADR-002).
