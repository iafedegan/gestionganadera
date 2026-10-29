# Spike S0 · Resultados (29 oct 2026)

Código: `spikes/s0-offline-storage` (`pnpm --filter @ganaderia/spike-s0 dev`, puerto 5174).

**Entorno de la medición:** Chromium 152 embebido en el app de escritorio de Claude (macOS). **No es un dispositivo de campo.** Una sola ejecución por caso; son órdenes de magnitud, no benchmarks.

**Carga:** 5.000 animales, 20.000 eventos y 100 comandos en cola. Cada payload se cifra con AES-GCM antes de insertarse.

| Medida | Resultado |
|---|---|
| VFS de almacenamiento | `opfs-sahpool` (OPFS disponible, sin aislamiento cross-origin) |
| Cifrar 5.000 payloads de animal / 20.000 de evento | 29 ms / 111 ms |
| Insertar todo en una transacción | 389 ms |
| Encolar 100 comandos | 3 ms |
| Buscar por arete (prefijo, índice) | 1,5 ms en caliente; 46 ms tras recargar |
| Inventario por especie de una finca | 0,8 ms; 4 ms tras recargar |
| Último peso por animal (agregado sobre 20.000 eventos, sin índice por tipo) | 5,7 ms; 139 ms tras recargar |
| Descifrar 100 animales de una finca | 1,6 ms |
| **Persistencia tras recargar la página** | **Sí**: 5.000 / 20.000 / 100 filas intactas |

## Qué confirma

- SQLite en el navegador sobre OPFS soporta el volumen de la capacidad inicial con holgura en escritorio.
- Cifrar por payload no es un cuello de botella.
- Los datos sobreviven a recargas, requisito base del trabajo sin conexión.

## Qué NO está probado (pendiente antes de cerrar ADR-001)

1. Android de gama baja y media (el caso de uso real): memoria y tiempos pueden ser varias veces peores.
2. iOS Safari (OPFS, purga de almacenamiento por inactividad).
3. Dos pestañas simultáneas con `opfs-sahpool`.
4. SQLCipher-WASM como alternativa a cifrar por payload.
5. 48 horas sin red con service worker (todavía no hay app shell ni PWA).
6. Consultas en frío: la agregación tras recargar tardó 139 ms; conviene un índice `(type, animal_id, occurred_at)` y medir de nuevo.
