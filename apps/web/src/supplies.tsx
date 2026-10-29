import {
  StockConsumeCommand,
  StockReceiveCommand,
  type SupplyCategory,
  SupplyCreateCommand,
  type SupplyUnit,
} from "@ganaderia/contracts";
import { type StockStatus, can, stockStatus, uuidv7 } from "@ganaderia/domain";
import {
  AlertTriangle,
  Building2,
  Droplets,
  FlaskConical,
  Hammer,
  History,
  Leaf,
  PackageMinus,
  PackagePlus,
  PlusCircle,
  Search,
  SlidersHorizontal,
  Sprout,
  Wheat,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Segmented, useFarms } from "./animals";
import { Kpi, PageHead } from "./components";
import {
  STOCK_STATUS_LABEL,
  SUPPLY_CATEGORY_LABEL,
  UNIT_LABEL,
  fecha,
  num,
  todayLocal,
} from "./labels";
import { type StockRow, type SupplyOverview, localdb } from "./lib/localdb";
import { haptic, useMedia, useSwipeDismiss } from "./native";
import { useApp } from "./state";

const CATEGORY_ICON: Record<string, ReactNode> = {
  alimento: <Wheat size={18} aria-hidden="true" />,
  medicamento: <FlaskConical size={18} aria-hidden="true" />,
  suplemento: <Droplets size={18} aria-hidden="true" />,
  fertilizante: <Sprout size={18} aria-hidden="true" />,
  material: <Hammer size={18} aria-hidden="true" />,
};

/** Estado de un insumo contando lo pendiente de enviar, para no dar falsas alarmas al trabajar sin red. */
export function statusOf(s: SupplyOverview): StockStatus {
  return stockStatus({
    onHand: s.onHand + s.pending,
    minStock: s.minStock,
    nearestExpiry: s.nearestExpiry,
    today: todayLocal(),
  });
}

export const qtyText = (n: number, unit: string) => `${num(n)} ${UNIT_LABEL[unit] ?? unit}`;

/** Acepta coma o punto decimal, como se escribe en Colombia. */
const parseNum = (v: string): number => Number(v.trim().replace(",", "."));

export function SuppliesScreen() {
  const { orgId, role, dataVersion, lastSync } = useApp();
  const farms = useFarms();
  const wide = useMedia("(min-width: 1500px)");
  const [overview, setOverview] = useState<SupplyOverview[] | null>(null);
  const [farmId, setFarmId] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "new" | "receive" | "consume">(null);
  const [dialogSupply, setDialogSupply] = useState<string | undefined>();
  const mobile = useMedia("(max-width: 900px)");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterSwipe = useSwipeDismiss<HTMLElement>(() => setFiltersOpen(false));
  const activeFilters = [category, farmId].filter(Boolean).length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.supplyOverview({ orgId, ...(farmId ? { farmId } : {}) }).then(setOverview);
  }, [orgId, farmId, dataVersion]);

  const canCatalog = role !== null && can(role, "supply.write");
  const canMove = role !== null && can(role, "stock.write");
  const list = (overview ?? []).filter(
    (s) =>
      (!category || s.category === category) &&
      (!q || s.name.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const counts = { low: 0, soon: 0, expired: 0 };
  for (const s of overview ?? []) {
    const st = statusOf(s);
    if (st === "bajo_minimo" || (st === "sin_existencia" && s.minStock > 0)) counts.low++;
    if (st === "vence_pronto") counts.soon++;
    if (st === "vencido") counts.expired++;
  }
  const open = (kind: "new" | "receive" | "consume", supplyId?: string) => {
    setDialogSupply(supplyId);
    setDialog(kind);
  };
  const noFarms = farms.length === 0;

  return (
    <section className="page">
      <PageHead
        kicker="Compras e insumos · ERP"
        title="Inventario de insumos"
        lead="Alimentos, medicamentos, sales y materiales, con lote y vencimiento. Cada consumo sale primero del lote que vence antes."
        actions={
          <>
            {canMove && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={noFarms || !overview?.length}
                onClick={() => open("receive")}
              >
                <PackagePlus size={18} aria-hidden="true" /> Recibir insumo
              </button>
            )}
            {canMove && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={noFarms || !overview?.length}
                onClick={() => open("consume")}
              >
                <PackageMinus size={18} aria-hidden="true" /> Registrar consumo
              </button>
            )}
            {canCatalog && (
              <button type="button" className="btn btn-ghost" onClick={() => open("new")}>
                <PlusCircle size={18} aria-hidden="true" /> Nuevo insumo
              </button>
            )}
          </>
        }
      />

      <div className="quick-actions">
        {canMove && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={noFarms || !overview?.length}
            onClick={() => open("receive")}
          >
            <PackagePlus size={18} aria-hidden="true" /> Recibir
          </button>
        )}
        {canMove && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={noFarms || !overview?.length}
            onClick={() => open("consume")}
          >
            <PackageMinus size={18} aria-hidden="true" /> Consumir
          </button>
        )}
        {canCatalog && (
          <button type="button" className="btn btn-ghost qa-wide" onClick={() => open("new")}>
            <PlusCircle size={18} aria-hidden="true" /> Nuevo insumo
          </button>
        )}
      </div>

      <section className="statstrip" aria-label="Resumen de insumos">
        <div>
          <strong>{num(overview?.length ?? 0)}</strong>
          <span>Insumos</span>
        </div>
        <div>
          <strong>{num(counts.low)}</strong>
          <span>Bajo mínimo</span>
        </div>
        <div>
          <strong>{num(counts.soon + counts.expired)}</strong>
          <span>Vencimientos</span>
        </div>
      </section>

      <div className="kpis kpis-3">
        <Kpi
          tone="verde"
          icon={<Leaf size={20} aria-hidden="true" />}
          label="Insumos en catálogo"
          value={num(overview?.length ?? 0)}
          meta="productos registrados"
          source={`Fuente: registros de este dispositivo${lastSync ? "" : " · aún sin sincronizar"}`}
        />
        <Kpi
          tone="ambar"
          icon={<PackageMinus size={20} aria-hidden="true" />}
          label="Bajo el mínimo"
          value={num(counts.low)}
          meta="insumos para reponer"
        />
        <Kpi
          tone="violeta"
          icon={<AlertTriangle size={20} aria-hidden="true" />}
          label="Vencimientos"
          value={num(counts.soon + counts.expired)}
          meta={`${counts.expired} vencidos · ${counts.soon} vencen en 30 días`}
        />
      </div>

      {counts.expired > 0 && (
        <div className="banner banner-error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            Hay lotes vencidos en bodega. No se pueden consumir; retírelos físicamente y regístrelos
            como baja cuando esa función esté disponible.
          </span>
        </div>
      )}

      {noFarms && (
        <div className="banner banner-info">
          <Building2 size={18} aria-hidden="true" />
          <span>
            Este dispositivo aún no tiene fincas. Conéctese y sincronice para descargar las fincas
            autorizadas.
          </span>
        </div>
      )}

      <div className="card filters">
        <label className="search grow">
          <span className="sr-only">Buscar insumo</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar insumo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {mobile ? (
          <button
            type="button"
            className="btn btn-ghost filter-btn"
            aria-label={`Filtros${activeFilters ? `, ${activeFilters} activos` : ""}`}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            {activeFilters > 0 && <span className="dot dot-inline">{activeFilters}</span>}
          </button>
        ) : (
          <>
            <label>
              Categoría
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(SUPPLY_CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finca (existencia)
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="">Todas</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className={wide ? "split" : undefined}>
        <div className="card table-card">
          {overview === null ? (
            <div className="skeleton-list" aria-busy="true">
              <span />
              <span />
              <span />
            </div>
          ) : list.length === 0 ? (
            <div className="empty-state">
              <Leaf size={28} aria-hidden="true" />
              <p>
                {overview.length === 0
                  ? "Todavía no hay insumos. Cree el primero para empezar a controlar la bodega."
                  : "Ningún insumo coincide con los filtros."}
              </p>
              {overview.length === 0 && canCatalog && (
                <button type="button" className="btn btn-primary" onClick={() => open("new")}>
                  <PlusCircle size={18} aria-hidden="true" /> Crear el primer insumo
                </button>
              )}
            </div>
          ) : (
            <table>
              <caption className="sr-only">Insumos</caption>
              <thead>
                <tr>
                  <th scope="col">Insumo</th>
                  <th scope="col">Existencia</th>
                  <th scope="col">Mínimo</th>
                  <th scope="col">Próximo vencimiento</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const st = statusOf(s);
                  return (
                    <tr key={s.id} className={s.id === selected ? "selected" : ""}>
                      <th scope="row">
                        <button type="button" className="row-btn" onClick={() => setSelected(s.id)}>
                          <span
                            className={`sp-badge cat-badge cat-${s.category}`}
                            style={{ width: 36, height: 36 }}
                          >
                            {CATEGORY_ICON[s.category]}
                          </span>
                          <span className="row-main">
                            <span>{s.name}</span>
                            <span className="row-sub">
                              {qtyText(s.onHand + s.pending, s.unit)}
                              {s.nearestExpiry ? ` · vence ${fecha(s.nearestExpiry)}` : ""}
                            </span>
                          </span>
                        </button>
                      </th>
                      <td data-label="Existencia" className="col-x">
                        <strong>{qtyText(s.onHand, s.unit)}</strong>
                        {s.pending !== 0 && (
                          <small className="pend">
                            {" "}
                            ({s.pending > 0 ? "+" : "−"}
                            {num(Math.abs(s.pending))} sin enviar)
                          </small>
                        )}
                      </td>
                      <td data-label="Mínimo" className="col-x">
                        {s.minStock > 0 ? qtyText(s.minStock, s.unit) : "—"}
                      </td>
                      <td data-label="Vencimiento" className="col-x">
                        {s.nearestExpiry ? fecha(s.nearestExpiry) : "—"}
                      </td>
                      <td data-label="Estado" className="col-sync">
                        <span className={`chip chip-${st}`}>{STOCK_STATUS_LABEL[st]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {wide ? (
          <SupplyDetail
            supply={overview?.find((s) => s.id === selected) ?? null}
            farmName={(id) => farms.find((f) => f.id === id)?.name ?? "—"}
            onAction={open}
            canMove={canMove}
          />
        ) : (
          selected && (
            <>
              <button
                type="button"
                className="backdrop"
                aria-label="Cerrar detalle"
                tabIndex={-1}
                onClick={() => setSelected(null)}
              />
              <SupplyDetail
                supply={overview?.find((s) => s.id === selected) ?? null}
                farmName={(id) => farms.find((f) => f.id === id)?.name ?? "—"}
                onAction={open}
                canMove={canMove}
                onClose={() => setSelected(null)}
              />
            </>
          )
        )}
      </div>

      {mobile && filtersOpen && (
        <>
          <button
            type="button"
            className="backdrop"
            aria-label="Cerrar filtros"
            tabIndex={-1}
            onClick={() => setFiltersOpen(false)}
          />
          <aside
            className="sheet-panel filter-sheet"
            aria-label="Filtros"
            ref={filterSwipe.ref}
            {...filterSwipe.bind}
          >
            <span className="grabber" aria-hidden="true" />
            <div className="drawer-head">
              <h2>Filtros</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => setFiltersOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Categoría
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(SUPPLY_CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finca (existencia)
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="">Todas</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCategory("");
                  setFarmId("");
                }}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFiltersOpen(false)}
              >
                Ver resultados
              </button>
            </div>
          </aside>
        </>
      )}

      <p className="principle">
        <Leaf size={16} aria-hidden="true" /> Próxima etapa del ERP: proveedores y órdenes de compra
        con aprobación por monto.
      </p>

      {dialog === "new" && <NewSupplyDialog onClose={() => setDialog(null)} />}
      {dialog === "receive" && (
        <MoveDialog
          mode="receive"
          overview={overview ?? []}
          {...(dialogSupply ? { supplyId: dialogSupply } : {})}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "consume" && (
        <MoveDialog
          mode="consume"
          overview={overview ?? []}
          {...(dialogSupply ? { supplyId: dialogSupply } : {})}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function SupplyDetail(props: {
  supply: SupplyOverview | null;
  farmName(id: string): string;
  onAction(kind: "receive" | "consume", supplyId: string): void;
  canMove: boolean;
  onClose?: () => void;
}) {
  const { orgId, dataVersion } = useApp();
  const [rows, setRows] = useState<StockRow[]>([]);
  const swipe = useSwipeDismiss<HTMLElement>(() => props.onClose?.());
  const s = props.supply;

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    if (!s) return;
    void localdb.stockMovements({ orgId, supplyId: s.id }).then(setRows);
  }, [orgId, s?.id, dataVersion]);

  if (!s) {
    return (
      <aside className="card sheet">
        <div className="empty-state">
          <Search size={28} aria-hidden="true" />
          <h2>Detalle del insumo</h2>
          <p>Seleccione un insumo para ver sus lotes y movimientos.</p>
        </div>
      </aside>
    );
  }
  const st = statusOf(s);
  return (
    <aside
      className={props.onClose ? "drawer sheet-drawer" : "card sheet"}
      aria-label="Detalle del insumo"
      ref={swipe.ref}
      {...(props.onClose ? swipe.bind : {})}
    >
      {props.onClose && (
        <button
          type="button"
          className="icon-btn drawer-close"
          aria-label="Cerrar detalle"
          onClick={props.onClose}
        >
          <X size={20} />
        </button>
      )}
      <header className="sheet-head">
        <span className={`sp-badge cat-badge cat-${s.category}`} style={{ width: 56, height: 56 }}>
          {CATEGORY_ICON[s.category]}
        </span>
        <div>
          <p className="card-label">{SUPPLY_CATEGORY_LABEL[s.category]}</p>
          <p className="sheet-name">{s.name}</p>
        </div>
      </header>
      <span className={`chip chip-${st}`}>{STOCK_STATUS_LABEL[st]}</span>
      <p className="figure on-hand">{qtyText(s.onHand + s.pending, s.unit)}</p>
      <p className="hint">
        Existencia{s.pending !== 0 ? " incluyendo registros sin enviar" : ""}
        {s.minStock > 0 ? ` · mínimo ${qtyText(s.minStock, s.unit)}` : ""}
      </p>
      {props.canMove && (
        <div className="detail-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => props.onAction("receive", s.id)}
          >
            <PackagePlus size={16} aria-hidden="true" /> Recibir
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => props.onAction("consume", s.id)}
          >
            <PackageMinus size={16} aria-hidden="true" /> Consumir
          </button>
        </div>
      )}

      <h3>Lotes con existencia</h3>
      {s.lots.length === 0 ? (
        <p className="empty">Sin lotes con saldo.</p>
      ) : (
        <ul className="lots">
          {s.lots.map((l) => {
            const vencido = l.expiresOn !== null && l.expiresOn < todayLocal();
            return (
              <li key={`${l.lotCode}-${l.expiresOn}`} className={vencido ? "lot expired" : "lot"}>
                <span className="mono">{l.lotCode ?? "Sin lote"}</span>
                <span>{l.expiresOn ? `vence ${fecha(l.expiresOn)}` : "sin vencimiento"}</span>
                <strong>{qtyText(l.balance, s.unit)}</strong>
                {vencido && <span className="chip chip-vencido">Vencido</span>}
              </li>
            );
          })}
        </ul>
      )}

      <h3>
        <History size={16} aria-hidden="true" /> Movimientos
      </h3>
      {rows.length === 0 ? (
        <p className="empty">Todavía no hay movimientos.</p>
      ) : (
        <ul className="timeline moves">
          {rows.map((r) => (
            <li key={r.id}>
              <span
                className={r.kind === "entrada" ? "tl-dot in" : "tl-dot out"}
                aria-hidden="true"
              >
                {r.kind === "entrada" ? <PackagePlus size={14} /> : <PackageMinus size={14} />}
              </span>
              <div>
                <strong>
                  {r.kind === "entrada" ? "+" : "−"}
                  {qtyText(r.quantity, s.unit)}
                  {r.pending && <span className="chip chip-pendiente"> Sin enviar</span>}
                </strong>
                <span>
                  {fecha(r.occurredOn)} · {props.farmName(r.farmId)}
                </span>
                <small>
                  {r.kind === "entrada"
                    ? [r.lotCode && `Lote ${r.lotCode}`, r.supplier].filter(Boolean).join(" · ") ||
                      "Recepción"
                    : [
                        r.target?.kind === "general" ? "Uso general" : r.target?.label,
                        r.lotCode && `lote ${r.lotCode}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Consumo"}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/* ───────────── Diálogos ───────────── */

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return {
    ref,
    close: () => {
      ref.current?.close();
      onClose();
    },
  };
}

function Head({ title, onClose }: { title: string; onClose(): void }) {
  const { online } = useApp();
  return (
    <header className="dialog-head">
      <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
        <X size={22} />
      </button>
      <h2>{title}</h2>
      {!online && <span className="pill pill-warn">Sin conexión</span>}
    </header>
  );
}

function NewSupplyDialog({ onClose }: { onClose(): void }) {
  const { orgId, refresh, syncNow, online, notify } = useApp();
  const { ref, close } = useDialog(onClose);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SupplyCategory>("suplemento");
  const [unit, setUnit] = useState<SupplyUnit>("kg");
  const [min, setMin] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const minStock = min.trim() ? parseNum(min) : 0;
    if (Number.isNaN(minStock)) return setError("El mínimo debe ser un número.");
    const parsed = SupplyCreateCommand.safeParse({
      id: uuidv7(),
      type: "supply.create",
      clientTs: new Date().toISOString(),
      payload: {
        id: uuidv7(),
        name,
        category,
        unit,
        ...(minStock > 0 ? { minStock } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revise los datos.");
    setBusy(true);
    try {
      const res = await localdb.enqueueSupplyCreate({ orgId, command: parsed.data });
      if (!res.ok) return setError(res.message);
      await refresh();
      haptic(30);
      notify(
        online
          ? `Insumo «${name.trim()}» guardado. Enviando…`
          : `Insumo «${name.trim()}» guardado en este dispositivo. Se enviará al reconectar.`,
      );
      close();
      if (online) void syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog dialog-form" onClose={onClose} aria-label="Nuevo insumo">
      <form onSubmit={(e) => void submit(e)}>
        <Head title="Nuevo insumo" onClose={close} />
        <div className="dialog-body">
          <label>
            Nombre
            <input
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              placeholder="Ej. Sal mineralizada"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Segmented
            legend="Categoría"
            value={category}
            wrap
            onChange={(v) => setCategory(v as SupplyCategory)}
            options={Object.entries(SUPPLY_CATEGORY_LABEL).map(([value, label]) => ({
              value: value as SupplyCategory,
              label,
            }))}
          />
          <Segmented
            legend="Unidad de medida"
            value={unit}
            wrap
            onChange={(v) => setUnit(v as SupplyUnit)}
            options={(["kg", "L", "dosis", "bulto", "unidad"] as SupplyUnit[]).map((value) => ({
              value,
              label: UNIT_LABEL[value] ?? value,
            }))}
          />
          <label>
            Existencia mínima (opcional)
            <input
              inputMode="decimal"
              placeholder="0"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </label>
          <label>
            Observaciones (opcional)
            <textarea
              maxLength={300}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Guardar insumo
          </button>
        </div>
      </form>
    </dialog>
  );
}

function MoveDialog(props: {
  mode: "receive" | "consume";
  overview: SupplyOverview[];
  supplyId?: string;
  onClose(): void;
}) {
  const { orgId, role, refresh, syncNow, online, notify } = useApp();
  const farms = useFarms();
  const { ref, close } = useDialog(props.onClose);
  const receive = props.mode === "receive";
  const mayCost = role !== null && can(role, "economy.read");

  const [farmId, setFarmId] = useState("");
  const [supplyId, setSupplyId] = useState(props.supplyId ?? props.overview[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [lot, setLot] = useState("");
  const [expires, setExpires] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [targetKind, setTargetKind] = useState<"lote" | "actividad" | "general">("lote");
  const [targetLabel, setTargetLabel] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!farmId && farms.length === 1 && farms[0]) setFarmId(farms[0].id);
  }, [farms, farmId]);

  const supply = props.overview.find((s) => s.id === supplyId);
  const unit = supply ? (UNIT_LABEL[supply.unit] ?? supply.unit) : "";
  const farmOne = farms.length === 1 ? farms[0] : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supply) return setError("Seleccione un insumo.");
    const quantity = parseNum(qty);
    if (!(quantity > 0)) return setError("La cantidad debe ser mayor que cero.");
    const unitCost = cost.trim() ? parseNum(cost) : undefined;
    if (unitCost !== undefined && Number.isNaN(unitCost))
      return setError("El costo debe ser un número.");
    const base = { id: uuidv7(), clientTs: new Date().toISOString() };

    const parsed = receive
      ? StockReceiveCommand.safeParse({
          ...base,
          type: "stock.receive",
          payload: {
            supplyId,
            farmId,
            quantity,
            occurredOn: date,
            ...(lot.trim() ? { lotCode: lot.trim() } : {}),
            ...(expires ? { expiresOn: expires } : {}),
            ...(mayCost && unitCost !== undefined ? { unitCost } : {}),
            ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        })
      : StockConsumeCommand.safeParse({
          ...base,
          type: "stock.consume",
          payload: {
            supplyId,
            farmId,
            quantity,
            occurredOn: date,
            target: {
              kind: targetKind,
              ...(targetKind !== "general" && targetLabel.trim()
                ? { label: targetLabel.trim() }
                : {}),
            },
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revise los datos.");
    if (receive && expires && expires < date)
      return setError("El producto ya estaba vencido al recibirlo.");
    if (date > todayLocal()) return setError("La fecha es futura.");

    setBusy(true);
    try {
      const label = `${supply.name} · ${receive ? "+" : "−"}${num(quantity)} ${unit}`;
      const res = await localdb.enqueueStock({
        orgId,
        label,
        command: parsed.data as StockReceiveCommand | StockConsumeCommand,
      });
      if (!res.ok) return setError(res.message);
      await refresh();
      haptic(30);
      notify(
        online
          ? `${receive ? "Recepción" : "Consumo"} guardado. Enviando…`
          : `${receive ? "Recepción" : "Consumo"} guardado en este dispositivo. Se enviará al reconectar.`,
      );
      close();
      if (online) void syncNow();
    } finally {
      setBusy(false);
    }
  }

  const available = supply ? supply.onHand + supply.pending : 0;

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-label={receive ? "Recibir insumo" : "Registrar consumo"}
    >
      <form onSubmit={(e) => void submit(e)}>
        <Head title={receive ? "Recibir insumo" : "Registrar consumo"} onClose={close} />
        <div className="dialog-body">
          {farmOne ? (
            <p className="farm-chip">
              <Building2 size={16} aria-hidden="true" /> {farmOne.name}
            </p>
          ) : (
            <label>
              Finca
              <select required value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="" disabled>
                  Seleccione
                </option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Insumo
            <select required value={supplyId} onChange={(e) => setSupplyId(e.target.value)}>
              {props.overview.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {!receive && supply && (
            <p className="hint">
              Disponible en el dispositivo: <strong>{qtyText(available, supply.unit)}</strong>{" "}
              (todas las fincas; el servidor valida por finca).
            </p>
          )}
          <label>
            Cantidad {unit && `(${unit})`}
            <input
              required
              inputMode="decimal"
              placeholder="0"
              className="input-lg"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </label>

          {receive ? (
            <>
              <div className="grid">
                <label>
                  Lote del producto (opcional)
                  <input
                    autoComplete="off"
                    maxLength={60}
                    className="mono"
                    value={lot}
                    onChange={(e) => setLot(e.target.value)}
                  />
                </label>
                <label>
                  Vencimiento (opcional)
                  <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                </label>
              </div>
              {mayCost && (
                <label>
                  Costo por {unit || "unidad"} en pesos (opcional)
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </label>
              )}
              <label>
                Proveedor (opcional)
                <input
                  maxLength={120}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <Segmented
                legend="¿Para qué se usó?"
                value={targetKind}
                onChange={(v) => setTargetKind(v as "lote" | "actividad" | "general")}
                options={[
                  { value: "lote", label: "Un lote" },
                  { value: "actividad", label: "Actividad" },
                  { value: "general", label: "General" },
                ]}
              />
              {targetKind !== "general" && (
                <label>
                  {targetKind === "lote" ? "Nombre del lote" : "Actividad"} (opcional)
                  <input
                    maxLength={80}
                    placeholder={
                      targetKind === "lote" ? "Ej. Lote de levante" : "Ej. Vacunación de aftosa"
                    }
                    value={targetLabel}
                    onChange={(e) => setTargetLabel(e.target.value)}
                  />
                </label>
              )}
            </>
          )}

          <label>
            Fecha
            <input
              type="date"
              required
              max={todayLocal()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Observaciones (opcional)
            <textarea
              maxLength={300}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {receive ? "Guardar recepción" : "Guardar consumo"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
