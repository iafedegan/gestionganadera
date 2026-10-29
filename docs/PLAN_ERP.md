# Plan de ERP ganadero

Versión 0.1 · 29 de octubre de 2026 · Borrador para aprobación. Extiende [PLAN_DESARROLLO.md](PLAN_DESARROLLO.md).

## 1. Qué significa «ERP ganadero» aquí

Un ERP une en un solo sistema lo que una finca compra, produce, vende, paga y cobra. En ganadería cambia el centro: **el animal y el lote** son la unidad que arrastra costos y genera ingresos. Por eso el ERP se construye **sobre** el núcleo ya existente (identidad animal, eventos inmutables, sincronización offline, auditoría) y no al lado.

Principio: una compra, un consumo, una venta o un jornal **nunca crea un dato productivo por sí solo** (igual que cerrar una tarea no crea un evento). Se vinculan por referencia explícita.

## 2. Mapa de módulos

| Grupo | Módulo | Estado |
|---|---|---|
| Operación del hato | Inicio, Animales | Disponible |
| | Producción, Reproducción, Sanidad | Planificado (semanas 6 a 8) |
| | Pasturas y alimentación, Economía, Asistencia técnica | Planificado (semana 11 y Fase 2) |
| **ERP** | **Compras e insumos** | ERP 1 |
| | **Ventas y clientes** | ERP 2 |
| | **Personal** · **Maquinaria y activos** | ERP 3 |
| | **Contabilidad y fiscal** (incluye costos y rentabilidad) | ERP 4 |

Los cinco módulos ERP ya aparecen en la navegación como vistas previas honestas («en construcción», sin datos inventados).

## 3. Funcionalidades por módulo

### ERP 1 · Compras e insumos
- Catálogo de insumos (alimentos, medicamentos, sales, fertilizantes, materiales) con unidad y categoría.
- Bodegas por finca; existencias con **lote de producto, vencimiento y costo promedio**; kardex.
- Proveedores; cotización → orden de compra → recepción → soporte. Aprobación por monto y rol.
- **Consumo trazable:** una aplicación sanitaria descuenta el lote del producto y hereda su período de retiro (enlaza con Sanidad). Un consumo de alimento se asigna a lote o actividad.
- Alertas por reglas: existencia mínima y vencimiento próximo.

### ERP 2 · Ventas y clientes
- Clientes (plantas de beneficio, subastas, acopiadores, queserías) y su historial.
- Venta de animales: selección de animales, **advertencia por retiro de carne**, paquete de datos para la guía de movilización (sin presumir integración con SINIGAN).
- Entrega de leche: volumen, calidad y **conciliación contra lo ordeñado**, sin duplicar totales individuales y colectivos.
- Cuentas por cobrar: saldos, vencimientos y recaudos vinculados a cada venta.

### ERP 3 · Personal y activos
- Trabajadores, turnos (p. ej. ordeño), asignación a fincas y labores por lote con su costo.
- Capacitaciones y certificados con vencimiento.
- Maquinaria y equipos: hoja de vida, horas, combustible, mantenimiento preventivo, infraestructura por potrero.

### ERP 4 · Contabilidad, fiscal y costos
- Centros de costo, cuentas por pagar y cobrar, cierres versionados, flujo de caja separado de utilidad.
- Costo por animal, lote, litro y kilogramo, **con fórmula, período y datos visibles**.
- Exportación para el contador. Facturación electrónica y nómina legal: **por integración con un proveedor autorizado**, no desarrollo propio.

## 4. Cómo se integra con lo ya construido

| Pieza existente | Uso en el ERP |
|---|---|
| `animal_event` inmutable | Costos y ventas se enlazan a eventos; las correcciones conservan la historia |
| Comandos idempotentes y sincronización | Mismo motor para compras, consumos y entregas capturadas en campo |
| RLS por organización y permisos por finca | Roles nuevos: responsable económico, comprador, bodeguero; permiso económico separado |
| Auditoría encadenada | Aprobaciones de compra y cierres contables quedan firmadas |
| Parámetros por especie | Retiros y precios no se comparten entre bovinos y bufalinos |

**Qué funciona sin conexión:** consumo de insumos, recepción de bodega, labores y entrega de leche (captura de campo). **Requiere conexión:** órdenes de compra, aprobaciones, facturación, cierres y exportaciones completas.

## 5. Conflicto con los TDR vigentes (decisión pendiente)

Los dos TDR dejan **fuera** parte de este alcance:

- TDR liviano: excluye inventario/control de insumos, contabilidad, facturación, cartera, nómina, valoración del inventario y costos por litro o kilogramo.
- TDR ampliado: incluye costos, márgenes y presupuestos, pero excluye nómina legal y contabilidad tributaria completa.

Por lo tanto: **los módulos ERP 1 a 4 requieren una ampliación formal de alcance** (control de cambios, sección 13 del TDR liviano) o una contratación separada. Mientras tanto se construyen como vistas previas y diseño, sin comprometer el cronograma de las 16 semanas.

## 6. Orden recomendado

1. **ERP 1** primero: depende de Sanidad (retiros) y desbloquea costos reales de alimentación y medicamentos.
2. **ERP 2**: cierra el ciclo producción → venta → cobro, y conecta con el asistente de movilización.
3. **ERP 3**: baja el costo de mano de obra y mantenimiento a cada lote.
4. **ERP 4** al final: necesita datos de los anteriores y la elección del proveedor de facturación.

## 7. Por validar antes de construir

- Requisitos vigentes de facturación electrónica y de nómina electrónica en Colombia (no verificados en esta sesión).
- Qué sistemas contables usa el cliente, para definir el formato de exportación.
- Reglas de valoración de inventario y de depreciación que aprobará el contador.
- Si FEDEGÁN–FNG quiere el ERP como módulo del mismo producto o como oferta separada.
