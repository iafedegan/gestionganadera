# Plan de desarrollo — Sistema Integral de Gestión Ganadera

Versión 0.1 · 29 de octubre de 2026 · Borrador para aprobación

Fuentes: TDR versión liviana v1.0 (8 oct 2026), TDR ampliado FEDEGÁN–FNG (13 oct 2026), Manual de identidad CONtexto Ganadero v1.0, y las 20 imágenes de referencia de los módulos 1 a 8.

---

## 1. Qué vamos a construir

Una plataforma web instalable (PWA) para bovinos y bufalinos, **offline-first**, multi-finca y multi-organización, con seis módulos operativos y administración transversal (TDR liviano), preparada para crecer hacia los módulos avanzados del TDR ampliado (pasturas, nutrición, genética, economía, asistencia técnica, trazabilidad, API, IA).

Los 8 módulos de las imágenes y su fase:

| # | Módulo (imagen) | Fase 1 (liviana) | Fase 2+ (ampliada) |
|---|---|---|---|
| 1 | Inicio y seguimiento | Inventario, tareas, alertas con origen | Avance de planes, "apoyo para decidir" |
| 2 | Animales | Ficha, genealogía básica, movimientos, selección múltiple | Sesiones de manejo avanzadas, QR/RFID |
| 3 | Producción y crecimiento | Leche (L) y pesajes (kg), medido vs estimado | Conciliación de ordeño, crías y reemplazos, proyecciones |
| 4 | Reproducción y genética | Servicio, diagnóstico, parto, aborto, secado, vínculo madre-cría | Semen/embriones, apareamientos, protocolos |
| 5 | Sanidad y bienestar | Vacunación, tratamiento, retiros, registro trazable | Planes preventivos, bioseguridad, bienestar |
| 6 | Pasturas y alimentación | Solo catálogo de potreros (nombre + área) | Mapa, aforos, presupuesto forrajero, dietas |
| 7 | Economía | Ingresos/egresos manuales, "saldo de movimientos registrados" | Centros de costo, presupuesto, escenarios |
| 8 | Asistencia técnica | Perfil técnico con acceso vigente | Visitas, recomendaciones, compromisos, acceso compartido |

Las pantallas de los módulos 6, 7 y 8 que aparecen completas en las imágenes se construyen como **estructura y navegación** en Fase 1 y se activan por feature flag cuando llegue su fase. Así no se rehace nada (principio de la sección 13 del TDR liviano).

## 2. Decisiones que necesito de ti antes de la semana 1

1. **Offline: ¿alcance del TDR o el tuyo?** El TDR liviano limita lo offline a pesajes, leche y eventos sanitarios (RF L11) y exige conexión para altas, bajas, traslados, reproducción y economía. Tú pides que funcione sin internet. Mi recomendación: **construir el motor de sincronización genérico desde el día 1** (cualquier comando puede encolarse) y habilitar por módulo según se valide. Así el TDR se cumple y el producto llega más lejos sin rehacer.
2. **Identidad visual.** Las imágenes de referencia usan un layout claro con sidebar verde y botones azules; el manual de marca pide filetes dorados, radio de 0,25 rem y botones en mayúsculas. Propongo **layout de las imágenes + lenguaje visual del manual** (sección 6). ¿Confirmas?
3. **Nombre y marca del producto.** El manual es de CONtexto Ganadero (medio periodístico). ¿El software se presenta con esa marca, o es producto de FEDEGÁN–FNG con la paleta de CONtexto?
4. **Alojamiento.** Ley 1581 de 2012 pide definir ubicación de datos. Propongo región São Paulo (latencia a Colombia) en un proveedor con contenedores gestionados, o un VPS en Colombia. Define presupuesto y política.
5. **Tamaño del equipo.** El plan asume desarrollo asistido por IA con 1 a 3 personas humanas revisando. Si hay más gente, se paralelizan los módulos.

## 3. Arquitectura propuesta

Principio rector: **monolito modular** (lo pide el TDR), **offline-first** (lo pides tú) y **registro de eventos inmutable** (lo exige la trazabilidad: "las correcciones no eliminan evidencia").

```
┌────────────────────────── Dispositivo (PWA) ───────────────────────────┐
│  React + Vite  →  Service Worker (Workbox: app shell + assets)         │
│  SQLite-WASM (OPFS)  ←  réplica local por finca autorizada             │
│  Outbox de comandos (UUIDv7 generado en el dispositivo)                │
│  Cifrado local (WebCrypto) · lease de autorización offline ≤ 72 h      │
└──────────────┬─────────────────────────────────────────────────────────┘
               │ HTTPS/TLS 1.3 · pull de cambios + push de comandos idempotentes
┌──────────────▼──────────────── Servidor ───────────────────────────────┐
│  API (NestJS/Fastify, TypeScript) — contrato OpenAPI 3.1               │
│  Módulos de dominio: identidad · fincas · animales · producción ·      │
│  reproducción · sanidad · economía · tareas · reportes · auditoría     │
│  PostgreSQL 16 + RLS por organización · migraciones versionadas        │
│  Cola de trabajos (pg-boss, sin Redis) · almacenamiento S3 compatible  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Stack

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript de punta a punta | Un solo modelo de tipos y validaciones compartido cliente/servidor |
| Monorepo | pnpm + Turborepo | `apps/web`, `apps/api`, `packages/domain`, `packages/ui`, `packages/contracts` |
| Frontend | React 19, Vite, TanStack Router y Query, React Hook Form + Zod | Maduro, PWA sencilla, formularios densos en móvil |
| UI | Tailwind + Radix primitives, tokens del manual de marca | Accesibilidad AA incluida, tokens centralizados |
| Datos locales | SQLite-WASM (wa-sqlite sobre OPFS; respaldo IndexedDB en iOS) | Permite correr localmente los mismos reportes (inventario a fecha, ganancia de peso) sin red |
| Sincronización | Propia, basada en **log de comandos + feed de cambios** | Los CA L08 piden idempotencia, cola visible y conflictos sin sobrescritura silenciosa; un CRDT genérico oculta justo eso |
| Backend | NestJS (módulos) o Fastify + estructura por dominio | Monolito modular con fronteras claras; elegiremos en el spike S0 |
| Base de datos | PostgreSQL 16, Drizzle ORM, RLS | Aislamiento por organización también a nivel de base, no solo de código |
| Autenticación | Argon2id, sesiones con refresh rotativo, TOTP y passkeys (WebAuthn) | MFA obligatorio para administradores; revocación inmediata |
| Archivos | S3 compatible (MinIO local, bucket gestionado en nube) | Soportes ≤ 10 MB, escaneo y verificación de tipo real |
| Observabilidad | OpenTelemetry + Grafana/Loki (o equivalente gestionado), Sentry autoalojable | Alertas de servicio y de sincronización |
| CI/CD | GitHub Actions, Docker, despliegue reproducible con IaC (OpenTofu) | Ambientes de prueba y producción separados |

### 3.2 Modelo de datos (núcleo)

- `organization`, `farm`, `lot`, `paddock` (solo nombre y área), `user`, `membership` (rol por organización/finca, con vigencia para técnicos).
- `animal` (id interno inmutable UUID, `tag_visible`, `species` obligatoria, sexo, categoría, `birth_date` + `birth_date_precision`, madre y padre opcionales, estado).
- `animal_event` **append-only**: tipo, fecha de ocurrencia, fecha de registro, zona horaria, usuario, finca, fuente, payload JSONB validado por esquema del tipo, `supersedes_event_id` para correcciones (nunca UPDATE/DELETE).
- Proyecciones derivadas (vistas materializadas o tablas): inventario por fecha, retiros activos, próximo control, estado reproductivo. Se pueden **reconstruir** desde los eventos; esto es lo que permite reproducir el inventario en tres fechas (CA L02).
- `milk_record` (nivel de captura: individual / colectivo, **sin sumar niveles**), `weighing` (medido/estimado), `reproductive_event`, `health_event` + `withdrawal`, `task`, `money_movement` (con reverso, no edición), `attachment`, `audit_log` (hash encadenado para detectar alteración).
- `species_parameter` versionado, con aprobador técnico: gestación, intervalos de diagnóstico, retiros por producto. **Nunca valores por defecto compartidos entre bovinos y bufalinos.**
- Distinción explícita **cero / desconocido / no medido** con tipo de dato propio (no `NULL` ambiguo).

### 3.3 Protocolo de sincronización

1. **Descarga**: por finca autorizada, delta con cursor (`since_version`). La réplica incluye solo lo necesario (privilegio mínimo; datos económicos solo con permiso).
2. **Captura**: cada acción genera un comando `{id UUIDv7, type, payload, device_id, client_ts, base_version}` en la outbox local y aplica un efecto optimista **marcado como pendiente**.
3. **Envío**: al abrir la app y con botón explícito; reintentos con backoff. El servidor **revalida todo** (permisos, fechas, secuencias, especie) y es idempotente por `id`.
4. **Resultado por comando**: `aceptado`, `rechazado (motivo)` o `conflicto (con el dato confirmado)`. Nunca se sobrescribe un dato confirmado; el usuario resuelve guiado.
5. **Reloj erróneo del dispositivo**: se guarda `client_ts` pero el orden lo dan la fecha de ocurrencia declarada y la versión del servidor; se avisa si la deriva supera un umbral.
6. **Seguridad offline**: lease de 72 h renovable en línea; datos locales cifrados con clave envuelta por contraseña/biometría; advertencia antes de cerrar sesión con pendientes; borrado remoto lógico al revocar (cuando haya red).

> **Spike S0 (semana 1):** probar cifrado de SQLite en WASM (SQLCipher-WASM vs cifrado de payloads con WebCrypto), rendimiento con 5.000 animales y 20.000 eventos en un Android de gama baja, y comportamiento de OPFS en iOS. De este spike depende la elección final de almacenamiento local.

### 3.4 Evolución sin rehacer

- Contratos públicos versionados (`/v1`), OpenAPI generado desde Zod. La **API externa no se abre** en Fase 1 (TDR) pero las interfaces ya existen internamente.
- Feature flags por organización para módulos 6 a 8 y para cualquier piloto de IA.
- Eventos de dominio publicados en un outbox transaccional → futuros conectores (básculas, RFID, SINIGAN, laboratorios) sin tocar el núcleo.
- Exportación íntegra (tablas, relaciones, auditoría, adjuntos con índice) desde el día 1, probada en un ambiente independiente (CA L09).

## 4. Seguridad (lo que se exige y cómo se prueba)

| Control | Implementación | Evidencia |
|---|---|---|
| Referencia | OWASP ASVS nivel 2 + OWASP MASVS-lite para la PWA | Lista de verificación por requisito |
| Autorización | Verificada en servidor + RLS en PostgreSQL; sin confiar en la interfaz | Pruebas de acceso cruzado con IDs conocidos (CA L01) |
| Autenticación | Argon2id, MFA para administradores, bloqueo por intentos, sesiones revocables | Pruebas de revocación y de sesión robada |
| Cifrado | TLS 1.3 en tránsito; en reposo en base y bucket; local cifrado | Informe de configuración |
| Secretos | Gestor de secretos, nunca en repositorio; escaneo con gitleaks | CI bloquea el merge |
| Archivos | Tipo real por magic bytes, límite 10 MB, antivirus, URLs firmadas de corta vida | Pruebas con archivos maliciosos |
| Cadena de suministro | Lockfile, `osv-scanner`, Dependabot, SBOM CycloneDX, inventario de licencias | Cero críticas/altas abiertas al arranque |
| Análisis | Semgrep (SAST), OWASP ZAP (DAST) en CI nocturno, revisión de pentest antes del piloto | Informe y cierre de hallazgos |
| Auditoría | Registro encadenado por hash, solo lectura desde la interfaz | Prueba de alteración |
| Respaldo | Diario, separado de producción, **restauración verificada** (RPO 24 h, RTO 8 h) | Ensayo documentado |
| Privacidad | Minimización, retención definida por la entidad, sin envío a terceros sin autorización (Ley 1581 de 2012) | Documento de tratamiento revisado por jurídico |

## 5. Calidad y pruebas (trazabilidad con los casos de aceptación)

- **Dominio puro** en `packages/domain` con pruebas unitarias y de propiedades (fast-check): el inventario por fecha siempre equivale a existencia inicial + entradas − salidas; traslado interno no cambia el consolidado; ciclos de genealogía imposibles.
- **Pruebas de aceptación ejecutables** que replican los números del TDR: 100 L individuales + 105 L colectivos ≠ 205 L; 200 kg → 230 kg en 30 días = 1 kg/día; $1.000.000 − $350.000 = $650.000.
- **E2E con Playwright** incluyendo modo avión: 48 h sin red, 100 eventos, reintentos y sin duplicados (CA L08).
- **Carga** con k6: 50 fincas, 5.000 animales activos, 50 usuarios concurrentes, p95 ≤ 3 s.
- **Accesibilidad**: axe en CI, pruebas manuales con teclado y lector de pantalla, contraste AA.
- **Matriz de dispositivos**: Android gama baja/media (captura), escritorio (administración), iOS (consulta y captura en línea).
- Cada evidencia guarda: requisito, versión, datos, pasos, esperado, obtenido, aprobador (formato del TDR, sección 11).

## 6. Diseño: cómo aplicar el manual de CONtexto Ganadero

### 6.1 Tokens

| Token | Valor | Uso en la app |
|---|---|---|
| `--verde-pasto` | #589120 | Logotipo, marca; texto solo grande sobre blanco |
| `--carmesi-cita` | #C21A3B | Alertas editoriales, logotipo, acciones destructivas de marca |
| `--obsidiana` | #05100B | Fondo del modo oscuro |
| `--esmeralda` | #2F9C62 | Acentos, estados activos, éxito |
| `--oro` | #D8B558 | Títulos, filetes, cifra destacada, botón principal |
| `--marfil` | #F4F2E9 | Texto sobre oscuro; lienzo claro derivado |
| `--niebla` | #9FB7A8 | Texto secundario y metadatos |
| `--marmol` / `--verde-botella` | #F5F4F0 / #0F3D2E | **Tema claro por defecto** (plantilla "Mármol & Verde Botella") |
| Estados | Error #C0392B · Éxito #2F9C62 · Aviso #D8B558 · Info #9FB7A8 | Etiquetas de estado |

Decisión práctica: los operarios usan el celular **al sol**, así que el **tema claro** es el predeterminado (derivado de "Mármol & Verde Botella", que el manual define para uso institucional) y el modo oscuro "Esmeralda Real" es opcional. El sidebar verde botella de las imágenes encaja con el manual.

### 6.2 Tipografía

Playfair Display (títulos y cifras destacadas) · Inter (interfaz, tablas, formularios) · Spectral (textos largos y ayudas) · JetBrains Mono (identificadores BOV-001, valores, etiquetas numéricas) · Montserrat Black solo en el logotipo. Fuentes autoalojadas (necesario para offline), con licencia OFL.

### 6.3 Componentes

- Radio **0,25 rem**; píldora solo en etiquetas de estado y buscador; filete de 1 px en oro al 22 % (reposo) y 50 % (foco/selección); espaciado en múltiplos de 4 px.
- Botones en **mayúsculas con tracking amplio**; principal en oro con texto oscuro (9,6:1), secundario con filete.
- Movimiento con curva `cubic-bezier(0.22, 1, 0.36, 1)` y respeto a `prefers-reduced-motion`.
- Etiquetas de estado de las imágenes (Programado, Pendiente, Confirmado, Dato observado, Proyección) con color **y** texto/ícono, nunca solo color.

### 6.4 Reglas de datos y voz (coinciden con el TDR)

- Título que afirma, no que etiqueta; **unidad, período y entidad** en cada cifra; un solo énfasis en oro.
- Formato colombiano: `3.250.969`, `19,8 %`, `$9.101`, `21 de octubre de 2026`.
- Cada indicador: fórmula, población, período y cobertura visibles ("¿cómo se calculó?"). Faltante ≠ cero.
- Voz: rigurosa, cercana, sobria; español de Colombia; sin exclamaciones. "No encontré fuentes para responder eso con seguridad" es el patrón para cualquier ayuda inteligente futura.
- Logotipo: usar la insignia redonda (círculo #F6F8F3) sobre fondos oscuros; zona libre x = altura de la "C" ÷ 4; mínimo 24 px. Iconos PWA 192/512 + maskable. **Necesito los archivos del emblema** (`contexto-ganadero-emblema.png` o SVG): el PDF solo trae una imagen de baja resolución.
- El toro y el ganadero (personajes del manual) quedan reservados para el futuro asistente y estados vacíos; siempre identificados como asistente con IA.

### 6.5 Diseño móvil de campo

Objetivo táctil ≥ 48 px, formularios de una columna, captura en máximo 3 toques para pesaje y leche, búsqueda por arete con teclado numérico, indicador permanente de estado de red y de pendientes, y "modo guante/sol" (contraste alto).

## 7. Propuestas de nuevas funcionalidades

**Nota de método:** la búsqueda web de esta sesión devolvió poca información verificable de cada producto (varias fuentes eran listados con puntajes de agregadores). Lo que sigue combina lo confirmado con conocimiento general del mercado. **Antes de presentarlo como benchmark formal conviene revisar los sitios oficiales y probar demos.**

### 7.1 Qué hace el mercado (resumen)

| Producto | Fortaleza conocida | Lo que nos enseña |
|---|---|---|
| DairyComp 305 (VAS) | Registro individual de reproducción, producción y salud en lechería; integración con salas de ordeño y centros de control lechero | Comandos de manejo rápidos, indicadores reproductivos con ventana y población definidas |
| DelPro (DeLaval), Lely Horizon, AfiFarm (Afimilk) | Captura automática desde equipos y sensores | Los conectores llegan después; el núcleo manual debe ser sólido |
| Herdwatch | Sincroniza con registros oficiales (BCMS, ScotEID, Nifais), conecta básculas y lectores EID por Bluetooth, informes para auditorías | El **cumplimiento regulatorio y la identificación electrónica** son el gancho |
| CattleMax, Farmbrite, Cattlytics | Registros sencillos para ganadería de carne y fincas pequeñas; Farmbrite destaca por líneas de tiempo de salud y tratamiento | Simplicidad y baja barrera de entrada |
| Apps nuevas offline (RanchOS, Ranchr, BarnsBook) | Captura sin conexión, voz, IA local en algunos casos | Offline y voz ya son esperados; Ranchr cobra offline como plan premium |
| Software ganadero latinoamericano (SG, Software + Ganadero) | Identificación electrónica, básculas, trazabilidad, costos | Mercado regional con foco en trazabilidad |

### 7.2 Brechas y oportunidades que proponemos

Ordenadas por valor para Colombia y encaje con los TDR. La columna *Fase* dice cuándo entraría sin romper el alcance contratado.

| # | Funcionalidad | Qué resuelve | Fase |
|---|---|---|---|
| N1 | **Asistente de movilización (GSMI)**: lista de animales a mover, validación previa de vacunación, retiros y estado del predio (RSPP), y paquete de datos listo para tramitar. El TDR deja una nota expresa sobre vincular las GSMI. Desde abril de 2024 el ICA expide las GSMI de bovinos y bufalinos desde SINIGAN; no presumimos integración, solo **preparar y vincular** el registro | Reduce errores y sanciones por movilizar sin guía; conecta traslados con cumplimiento | 1 (vínculo manual) → 3 (conector) |
| N2 | **Semáforo de retiros con bloqueo de venta**: leche y carne por animal y por lote, con revisión autorizada obligatoria | Inocuidad; ya está en el TDR, lo hacemos visible en todas las pantallas | 1 |
| N3 | **Inventario "a cualquier fecha"** con línea de tiempo y reconstrucción desde eventos | Auditoría y crédito; pocos competidores lo exponen de forma clara | 1 |
| N4 | **Cada cifra explica su origen**: clic en un indicador y se abren los registros que la componen, con cobertura | Confianza; coincide con la regla "un dato se firma" del manual | 1 |
| N5 | **Centro de sincronización**: cola de pendientes, rechazados y conflictos, y "última actualización" por finca | Confianza en el offline; casi ningún producto lo muestra | 1 |
| N6 | **Parámetros por especie con aprobación técnica** (bufalinos como ciudadano de primera) | Los productos globales casi siempre asumen bovino | 1 |
| N7 | **Sesión de manejo por escaneo** (QR/código de barras con la cámara; RFID por Bluetooth como conector) con pantalla "previstos / atendidos / pendientes" | Velocidad en manga; imagen del módulo 2 | 1 (cámara) → 2/3 (RFID) |
| N8 | **Nodo de finca**: un mini servidor en la finca con sincronización por red local cuando no hay internet en meses | Fincas sin conectividad real; el dispositivo sincroniza con el nodo y este con la nube cuando pueda | 3 |
| N9 | **Libro de finca / informe para crédito** en PDF firmado (inventario, producción, sanidad, movimientos) | Acceso a financiación (FNG, bancos), auditorías | 2 |
| N10 | **Estrés térmico (ITH) y alertas climáticas por finca**, con umbrales distintos para bovinos y búfalos | Producción lechera en trópico; pocos lo ofrecen localmente | 2 |
| N11 | **Recordatorios por WhatsApp** (opcional y con consentimiento) además de avisos internos | En Colombia casi todos usan WhatsApp; el TDR lo excluye de Fase 1 | 2 |
| N12 | **Captura por voz en español** (reconocimiento en el dispositivo cuando sea posible) con confirmación antes de guardar | Manos ocupadas en manga | 4 |
| N13 | **Calidad de datos**: tablero de huecos, duplicados, fechas imposibles, animales sin registro reciente | Datos confiables antes de analítica o IA | 2 |
| N14 | **Origen y sostenibilidad**: polígonos del predio, historial de movimientos y evidencias para mercados que exigen trazabilidad libre de deforestación (p. ej., reglamento europeo; verificar vigencia y alcance) | Acceso a mercados de exportación | 3 |
| N15 | **Condición corporal asistida por foto** y detección temprana de cojeras/anomalías con revisión humana | Bienestar; piloto con validación | 4 |
| N16 | **Benchmark anónimo entre fincas** con definiciones homogéneas y consentimiento | Valor para gremio y productor (RA11) | 3 |
| N17 | **Modo operario simple**: iconografía grande, lenguaje llano, audio de ayuda | Usuarios con baja alfabetización digital | 1 |

Líneas rojas (del TDR): la IA nunca prescribe, ordena descartes ni emite trámites; las alertas de Fase 1 son reglas y fechas explícitas; ningún dato sale a servicios externos sin autorización.

## 8. Hoja de ruta

Sigo la estructura de entregas del TDR (16 semanas) y la hago ejecutable. Cada semana cierra con una demostración y pruebas verdes.

| Semanas | Hito TDR | Qué se construye | Criterio de salida |
|---|---|---|---|
| **0** (previa) | — | Decisiones de la sección 2, archivos de marca, lista de fincas piloto, repositorio y CI vacío | Alcance y stack firmados |
| 1 | E1 | **Spike S0** (offline, cifrado, rendimiento). Monorepo, CI, linters, ambientes, tokens de diseño, Storybook | Spike con decisión documentada |
| 2–3 | E1 | Identidad, organizaciones, fincas, roles, RLS. Modelo de datos y diccionario. Prototipos fieles a las imágenes. Matriz RF L01–L12 y casos de prueba | CA L01 (permisos) en verde |
| 4–5 | E2 | Animales y genealogía, entradas/salidas/traslados, inventario por fecha | CA L02 y L03 |
| 6 | E2 | Producción: leche (niveles de captura) y pesajes (medido/estimado) | CA L04 |
| 7 | E2 | Reproducción: servicio, diagnóstico, parto con cría vinculada, parámetros por especie | CA L03 (parte reproductiva) |
| 8 | E2 | Sanidad y retiros, selección múltiple y campañas | CA L05 |
| 9–10 | E3 | Motor de sincronización completo + centro de sincronización; captura offline en pesajes, leche y sanidad | CA L08 |
| 11 | E3 | Tareas y alertas, ingresos/egresos simples, Inicio con origen de cada alerta | CA L06 |
| 12 | E3 | Reportes, exportaciones (CSV/Excel/PDF), exportación íntegra, auditoría, importación inicial | CA L07 y L09; ensayo de restauración |
| 13–14 | E4 | Carga conciliada, capacitación, pruebas de seguridad, carga y accesibilidad, piloto | CA L10 |
| 15 | E4 | Corrección de defectos, puesta en producción autorizada | Cero críticos/altos |
| 16 | E5 | Transferencia: manuales, diccionario, runbooks, formación técnica | Receptor restaura un respaldo y administra permisos |

Después: Fase 2 (visitas técnicas, pastoreo, dietas, insumos, costos básicos, ampliar offline) y siguientes, según la sección 13 del TDR liviano.

## 9. Estructura inicial del repositorio

```
GESTIONGANADERA/
├─ apps/
│  ├─ web/            PWA (React, Vite)
│  └─ api/            API modular
├─ packages/
│  ├─ domain/         Reglas puras: inventario, validaciones, parámetros por especie
│  ├─ contracts/      Esquemas Zod + OpenAPI generado
│  ├─ sync/           Outbox, cursor, resolución de conflictos (compartido cliente/servidor)
│  ├─ ui/             Componentes y tokens de marca
│  └─ db/             Migraciones y semillas (datos de prueba por especie)
├─ infra/             Docker, OpenTofu, scripts de respaldo y restauración
├─ docs/              Este plan, ADRs, diccionario de datos, runbooks, matriz de trazabilidad
└─ .github/workflows/ CI: tipos, pruebas, SAST, escaneo de dependencias y secretos
```

Cada decisión importante queda en `docs/adr/NNN-titulo.md` (registro de decisiones de arquitectura).

## 10. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Offline en iOS (límites de Safari, purga de almacenamiento) | Spike S0; iOS como consulta/captura en línea según TDR; avisos claros |
| Cifrado local en navegador con rendimiento aceptable | Alternativa de cifrado por payload; medir en gama baja |
| Reglas técnicas por especie sin validar | Profesional validador desde E1; parámetros versionados y firmados; nada por defecto |
| Alcance que crece (los 8 módulos de las imágenes) | Feature flags y congelamiento de alcance al aceptar E1 |
| Datos de piloto reales no disponibles | Ambiente de prueba con datos sintéticos de ambas especies |
| Falta de integración con SINIGAN u otros | No se presume acceso; se diseña el vínculo manual y el conector queda para Fase 3 |
| Marca: archivos de emblema incompletos | Solicitar SVG/PNG originales y las fuentes |

## 11. Primeros pasos concretos (una vez apruebes)

1. Responder las 5 decisiones de la sección 2 y enviarme el emblema en alta resolución.
2. Inicializar el repositorio (monorepo, CI, ADR-001 con el stack) y la guía de estilo con los tokens del manual.
3. Ejecutar el spike S0 y registrar resultados en `docs/adr/`.
4. Construir la primera porción vertical completa: **iniciar sesión → crear finca → registrar animal → verlo offline → sincronizar**. Con esto se prueban identidad, permisos, modelo de eventos, PWA y sincronización antes de multiplicar módulos.
