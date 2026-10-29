# ADR-003 · ERP 1: insumos y existencias (primera etapa)

Estado: **implementada** (29 oct 2026). Detalle funcional en [PLAN_ERP.md](../PLAN_ERP.md).

## Alcance entregado

Catálogo de insumos, recepción a bodega, consumo con descuento FEFO, existencias por lote y alertas. **No incluye** proveedores ni órdenes de compra, aprobaciones, valoración del inventario ni vínculo con retiros de Sanidad (siguiente etapa).

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Modelo | `supply` (catálogo por organización) y `stock_movement` **solo de agregar**; la existencia es una proyección (suma por finca, insumo y lote) | Igual que los eventos del animal: nada se edita, todo se corrige con un movimiento nuevo |
| Consumo | El cliente pide una cantidad; **el servidor reparte entre lotes** por vencimiento (FEFO) y crea un movimiento por lote | Evita que dos dispositivos descuenten el mismo lote; la regla vive en `packages/domain` |
| Lotes vencidos | **Nunca se consumen**, aunque sea lo único que hay; el rechazo lo explica | Seguridad sanitaria: un medicamento vencido no debe aplicarse |
| Existencia insuficiente | Conflicto `STOCK_INSUFICIENTE` (no error): el dato local puede estar desactualizado | El usuario decide cómo corregir |
| Offline | Recepción y consumo se encolan; el cliente valida contra lo conocido más lo pendiente; el servidor decide | Cumple «captura de campo» del plan ERP |
| Costo unitario | Es dato económico: lo registra y lo recibe solo quien tiene `economy.read` en la finca; al resto se le entrega `null` en la descarga | Segregación económica del TDR |
| Permisos | `supply.write` (catálogo): administrador y propietario con alcance de organización. `stock.write`: además el operario, por finca | El operario captura en bodega sin tocar catálogo ni costos |
| Feed de cambios | El catálogo usa una «finca» nula (`ORG_SCOPE_FARM_ID`) para llegar a todos los de la organización | Un usuario de una sola finca también necesita ver los insumos |
| Cola local | Se generalizó: `kind`, `label`, `supply_id`, `farm_id`, `qty_delta`; migración local con `PRAGMA user_version` (v2) que conserva los comandos pendientes anteriores | Un mismo motor para animales e insumos; verificado con una base local ya existente |

## Verificación

- 12 pruebas de API nuevas: permisos, nombre único, FEFO por lotes, consumo de más, lote vencido, reenvío idempotente, fechas, costos ocultos al operario, finca ajena, aislamiento entre organizaciones e inmutabilidad.
- 10 pruebas de dominio nuevas (FEFO, estados de existencia, validación de recepción).
- En navegador: crear insumo, recibir dos lotes, consumir 40 kg (salen 30 del lote que vence antes y 10 del otro), consumir sin conexión (cola, aviso, sincronización) y migración de la base local.

## Límites conocidos

- No hay baja por vencimiento ni ajuste de inventario: los lotes vencidos quedan con saldo hasta que exista esa función.
- La validación de existencia local suma todas las fincas; el servidor valida por finca y puede devolver conflicto.
- Un consumo que cruza lotes crea varios movimientos y por tanto varias versiones en el feed.
- Los alertas de existencia mínima se calculan en el dispositivo; aún no hay avisos fuera de la aplicación.
