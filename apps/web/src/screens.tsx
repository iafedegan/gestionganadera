import type { AnimalRegisterPayload } from "@ganaderia/contracts";
import { ROLE_LABEL } from "@ganaderia/domain";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  CloudOff,
  Database,
  KeyRound,
  LogOut,
  Menu,
  PawPrint,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Pasture } from "./Pasture";
import { RegisterDialog } from "./animals";
import { Kpi, PageHead } from "./components";
import { CODE_LABEL, SPECIES_LABEL, fecha, fechaHora, num } from "./labels";
import { type OutboxItem, localdb } from "./lib/localdb";
import { lastEmail } from "./lib/session";
import { MODULES, type ModuleDef, type ModuleKey, moduleByKey } from "./modules";
import { useApp } from "./state";

export type { ModuleKey } from "./modules";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function ModIcon({ k, size = 20 }: { k: ModuleKey; size?: number }) {
  const Icon = moduleByKey(k).icon;
  return <Icon size={size} aria-hidden="true" />;
}

/* ───────────── Acceso ───────────── */

export function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState(lastEmail());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await login(email, password);
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  return (
    <main className="login">
      <section className="login-hero">
        <div className="login-hero-top">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Gestión Ganadera</span>
        </div>
        <div className="login-hero-body">
          <p className="kicker kicker-light">Bovinos y bufalinos</p>
          <h2>Su finca ordenada, con o sin internet.</h2>
          <ul className="login-points">
            <li>
              <WifiOff size={18} aria-hidden="true" />
              <span>Registre en el potrero sin señal; todo se envía al reconectar.</span>
            </li>
            <li>
              <KeyRound size={18} aria-hidden="true" />
              <span>Los datos del dispositivo quedan cifrados con su contraseña.</span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>Cada cifra indica de dónde sale y qué registros la componen.</span>
            </li>
          </ul>
        </div>
        <Pasture className="login-pasture" />
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit} aria-labelledby="login-title">
          <p className="kicker">Sistema Integral de Gestión Ganadera</p>
          <h1 id="login-title">Ingrese a su finca</h1>
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              <AlertTriangle size={16} aria-hidden="true" /> {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Verificando…" : "Ingresar"}
          </button>
          <p className="hint">
            <CloudOff size={14} aria-hidden="true" /> Sin conexión puede ingresar con su contraseña
            hasta 72 horas después del último inicio de sesión en línea.
          </p>
        </form>
      </section>
    </main>
  );
}

/* ───────────── Estructura ───────────── */

function NavList(props: {
  active: ModuleKey;
  onPick(m: ModuleKey): void;
  variant?: "side" | "sheet";
}) {
  return (
    <ul className={props.variant === "sheet" ? "nav-list nav-sheet" : "nav-list"}>
      {MODULES.map((m) => (
        <li key={m.key}>
          <button
            type="button"
            className={m.key === props.active ? "nav active" : "nav"}
            aria-current={m.key === props.active ? "page" : undefined}
            onClick={() => props.onPick(m.key)}
          >
            <ModIcon k={m.key} />
            <span className="nav-label">{m.label}</span>
            {m.phase && <small title={`Planificado: ${m.phase}`}>Pronto</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const BOTTOM: ModuleKey[] = ["inicio", "animales", "produccion", "reproduccion"];

export function Shell(props: {
  module: ModuleKey;
  onModule(m: ModuleKey): void;
  syncOpen: boolean;
  onSyncOpen(open: boolean): void;
  children: ReactNode;
}) {
  const {
    session,
    role,
    online,
    syncing,
    counts,
    logout,
    syncNow,
    syncNotice,
    sessionExpired,
    toasts,
    dismissToast,
  } = useApp();
  const [more, setMore] = useState(false);

  // El menú "Más" solo existe en celular: si la ventana se ensancha, se cierra.
  useEffect(() => {
    const m = window.matchMedia("(min-width: 901px)");
    const close = () => m.matches && setMore(false);
    m.addEventListener("change", close);
    return () => m.removeEventListener("change", close);
  }, []);
  const pendientes = counts.pendiente;
  const revisar = counts.rechazado + counts.conflicto;
  const org = session?.memberships[0]?.organizationName ?? "";
  const name = session?.displayName ?? "";

  async function exit() {
    if (pendientes > 0 || revisar > 0) {
      const ok = window.confirm(
        `Hay ${pendientes + revisar} registros sin confirmar en el servidor. Se conservan cifrados en este dispositivo y se enviarán al volver a ingresar con conexión. ¿Cerrar sesión?`,
      );
      if (!ok) return;
    }
    await logout();
  }

  function pick(m: ModuleKey) {
    props.onModule(m);
    setMore(false);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="shell">
      <a className="skip" href="#contenido">
        Ir al contenido
      </a>

      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            <strong>Gestión Ganadera</strong>
            <small>{org}</small>
          </span>
        </div>
        <nav aria-label="Módulos">
          <NavList active={props.module} onPick={pick} />
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="sync-mini" onClick={() => props.onSyncOpen(true)}>
            <RefreshCw size={16} aria-hidden="true" className={syncing ? "spin" : ""} />
            <span>
              {pendientes + revisar > 0
                ? `${pendientes + revisar} por sincronizar`
                : online
                  ? "Todo sincronizado"
                  : "Sin conexión"}
            </span>
          </button>
          <Pasture className="sidebar-pasture" />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn only-mobile"
              aria-label="Más módulos"
              onClick={() => setMore(true)}
            >
              <Menu size={22} />
            </button>
            <div className="topbar-title">
              <strong>{moduleByKey(props.module).label}</strong>
              <span>{org}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <output className={online ? "pill pill-ok" : "pill pill-warn"}>
              {online ? (
                <Wifi size={14} aria-hidden="true" />
              ) : (
                <WifiOff size={14} aria-hidden="true" />
              )}
              <span className="pill-text">{online ? "En línea" : "Sin conexión"}</span>
            </output>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Sincronización${pendientes + revisar > 0 ? `, ${pendientes + revisar} pendientes` : ""}`}
              onClick={() => props.onSyncOpen(true)}
            >
              <Bell size={20} />
              {pendientes + revisar > 0 && <span className="dot">{pendientes + revisar}</span>}
            </button>
            <div className="user">
              <span className="avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <span className="user-text">
                <strong>{name}</strong>
                {role && <small>{ROLE_LABEL[role]}</small>}
              </span>
            </div>
            <button type="button" className="icon-btn" aria-label="Cerrar sesión" onClick={exit}>
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {sessionExpired && (
          <div className="banner banner-warn" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              La sesión caducó. Puede seguir trabajando sin conexión; para sincronizar, cierre
              sesión e ingrese de nuevo.
            </span>
          </div>
        )}

        <main id="contenido" className="content">
          {props.children}
        </main>

        <footer className="statusbar" aria-live="polite">
          <span>{syncing ? "Sincronizando…" : (syncNotice ?? "Listo.")}</span>
          <button type="button" className="link" onClick={() => void syncNow()} disabled={syncing}>
            Sincronizar ahora
          </button>
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Módulos">
        {BOTTOM.map((k) => (
          <button
            key={k}
            type="button"
            className={k === props.module ? "tab active" : "tab"}
            aria-current={k === props.module ? "page" : undefined}
            onClick={() => pick(k)}
          >
            <ModIcon k={k} size={22} />
            <span>{moduleByKey(k).short}</span>
          </button>
        ))}
        <button type="button" className="tab" onClick={() => setMore(true)}>
          <Menu size={22} aria-hidden="true" />
          <span>Más</span>
        </button>
      </nav>

      {more && (
        <>
          <button
            type="button"
            className="backdrop"
            aria-label="Cerrar menú"
            tabIndex={-1}
            onClick={() => setMore(false)}
          />
          <aside className="sheet-panel" aria-label="Módulos">
            <div className="drawer-head">
              <h2>Módulos</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar"
                onClick={() => setMore(false)}
              >
                <X size={20} />
              </button>
            </div>
            <NavList active={props.module} onPick={pick} variant="sheet" />
          </aside>
        </>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.tone === "ok" ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span>{t.message}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => dismissToast(t.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {props.syncOpen && <SyncDrawer onClose={() => props.onSyncOpen(false)} />}
    </div>
  );
}

/* ───────────── Inicio ───────────── */

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};
const longDate = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function Home({
  onOpenSync,
  onModule,
}: {
  onOpenSync(): void;
  onModule(m: ModuleKey): void;
}) {
  const { orgId, counts, dataVersion, lastSync, online, session } = useApp();
  const [inv, setInv] = useState<{ total: number; bovino: number; bufalino: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.counts(orgId).then(setInv);
  }, [orgId, dataVersion]);

  const revisar = counts.rechazado + counts.conflicto;
  const lease = session ? new Date(session.offlineLeaseUntil) : null;
  const leaseHours = lease ? (lease.getTime() - Date.now()) / 3_600_000 : 0;
  const first = session?.displayName.split(" ")[0] ?? "";
  const pctBov = inv && inv.total > 0 ? Math.round((inv.bovino / inv.total) * 100) : 0;

  const alerts: {
    tone: "error" | "warn" | "info";
    icon: ReactNode;
    title: string;
    text: string;
  }[] = [];
  if (revisar > 0) {
    alerts.push({
      tone: "error",
      icon: <AlertTriangle size={20} />,
      title: `${revisar} registro(s) no se pudieron confirmar`,
      text: "Fueron rechazados o chocan con un dato ya confirmado. Corríjalos para que se envíen.",
    });
  }
  if (counts.pendiente > 0) {
    alerts.push({
      tone: "info",
      icon: <Clock size={20} />,
      title: `${counts.pendiente} registro(s) esperan ser enviados`,
      text: online
        ? "Se envían al sincronizar."
        : "Están guardados en este dispositivo y se enviarán al recuperar la conexión.",
    });
  }
  if (lease && leaseHours > 0 && leaseHours < 24) {
    alerts.push({
      tone: "warn",
      icon: <KeyRound size={20} />,
      title: "El permiso para trabajar sin conexión vence pronto",
      text: `Conéctese antes del ${fechaHora(lease.toISOString())} para renovarlo.`,
    });
  }

  return (
    <section className="page">
      <PageHead
        kicker={longDate.format(new Date())}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
        lead="Un vistazo general para priorizar las actividades de la finca."
      />

      <div className="kpis">
        <Kpi
          tone="verde"
          icon={<PawPrint size={20} />}
          label="Inventario del hato"
          value={inv ? num(inv.total) : "—"}
          meta={
            inv
              ? `animales activos · ${num(inv.bovino)} bovinos, ${num(inv.bufalino)} bufalinos`
              : ""
          }
          source={`Fuente: registros de este dispositivo${lastSync ? ` · ${fechaHora(lastSync)}` : " · aún sin sincronizar"}`}
        >
          {inv && inv.total > 0 && (
            <div
              className="bar"
              role="img"
              aria-label={`${pctBov} % bovinos, ${100 - pctBov} % bufalinos`}
            >
              <span style={{ width: `${pctBov}%` }} />
            </div>
          )}
        </Kpi>
        <Kpi
          tone="azul"
          icon={<ModIcon k="produccion" />}
          label="Producción y crecimiento"
          value="—"
          meta="Leche (L) y pesajes (kg)"
          soon="Semana 6"
        />
        <Kpi
          tone="ambar"
          icon={<ModIcon k="reproduccion" />}
          label="Estado reproductivo"
          value="—"
          meta="Servicios, diagnósticos y partos"
          soon="Semana 7"
        />
        <Kpi
          tone="violeta"
          icon={<ModIcon k="economia" />}
          label="Saldo de movimientos"
          value="—"
          meta="Ingresos menos egresos registrados"
          soon="Semana 11"
        />
      </div>

      <div className="two">
        <article className="card">
          <header className="card-head">
            <CalendarDays size={20} aria-hidden="true" />
            <div>
              <h2>Agenda del día</h2>
              <p>Actividades programadas para hoy en la finca.</p>
            </div>
          </header>
          <div className="empty-state">
            <CalendarDays size={28} aria-hidden="true" />
            <p>
              Las tareas, controles reproductivos y visitas aparecerán aquí cuando se active el
              módulo de tareas.
            </p>
            <span className="chip chip-soon">Semana 11</span>
          </div>
        </article>

        <article className="card">
          <header className="card-head">
            <Bell size={20} aria-hidden="true" />
            <div>
              <h2>Alertas para revisar</h2>
              <p>Situaciones que requieren su atención.</p>
            </div>
            <button type="button" className="link" onClick={onOpenSync}>
              Abrir sincronización
            </button>
          </header>
          {alerts.length === 0 ? (
            <div className="empty-state ok">
              <CheckCircle2 size={28} aria-hidden="true" />
              <p>Todo en orden. No hay alertas por ahora.</p>
            </div>
          ) : (
            <ul className="alert-list">
              {alerts.map((a) => (
                <li key={a.title} className={`alert alert-${a.tone}`}>
                  <span className="alert-icon">{a.icon}</span>
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="two">
        <article className="card">
          <header className="card-head">
            <Database size={20} aria-hidden="true" />
            <div>
              <h2>Este dispositivo</h2>
              <p>Copia local cifrada de sus fincas.</p>
            </div>
          </header>
          <dl className="kv">
            <dt>Conexión</dt>
            <dd>{online ? "En línea" : "Sin conexión"}</dd>
            <dt>Última sincronización</dt>
            <dd>{lastSync ? fechaHora(lastSync) : "Aún no en esta sesión"}</dd>
            <dt>Trabajo sin conexión hasta</dt>
            <dd>{lease ? fechaHora(lease.toISOString()) : "—"}</dd>
            <dt>Cifrado</dt>
            <dd>Con su contraseña (AES-256)</dd>
          </dl>
        </article>

        <article className="card card-cta">
          <header className="card-head">
            <PawPrint size={20} aria-hidden="true" />
            <div>
              <h2>Empiece por los animales</h2>
              <p>Registre el inventario inicial de cada finca, con o sin conexión.</p>
            </div>
          </header>
          <button type="button" className="btn btn-primary" onClick={() => onModule("animales")}>
            Ir a animales
          </button>
        </article>
      </div>
    </section>
  );
}

/* ───────────── Módulos en construcción ───────────── */

export function ModulePreview({ module }: { module: ModuleKey }) {
  const m: ModuleDef = moduleByKey(module);
  return (
    <section className="page">
      <PageHead kicker={m.label} title={m.title ?? m.label} {...(m.lead ? { lead: m.lead } : {})} />
      <div className="banner banner-info">
        <ModIcon k={module} size={18} />
        <span>
          <strong>Módulo en construcción.</strong> Planificado para <strong>{m.phase}</strong> del
          plan de desarrollo. Esta vista muestra lo que incluirá; todavía no registra datos.
        </span>
      </div>
      <div className="preview-grid">
        {m.cards?.map((c) => {
          const CardIcon = c.icon;
          return (
            <article key={c.title} className={`card preview tone-${c.tone}`}>
              <span className="kpi-icon">
                <CardIcon size={22} aria-hidden="true" />
              </span>
              <h2>{c.title}</h2>
              <p>{c.text}</p>
              <span className="chip chip-soon">{c.when}</span>
            </article>
          );
        })}
      </div>
      {m.note && (
        <p className="principle">
          <CheckCircle2 size={16} aria-hidden="true" /> {m.note}
        </p>
      )}
    </section>
  );
}

/* ───────────── Centro de sincronización ───────────── */

function SyncDrawer({ onClose }: { onClose(): void }) {
  const { orgId, counts, dataVersion, syncNow, syncing, lastSync, syncNotice, online, refresh } =
    useApp();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [fixing, setFixing] = useState<{
    payload: AnimalRegisterPayload;
    commandId: string;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.outboxList(orgId).then(setItems);
  }, [orgId, dataVersion]);

  async function fix(id: string) {
    const cmd = await localdb.outboxGetCommand(id);
    if (cmd) setFixing({ payload: cmd.payload, commandId: id });
  }

  async function discard(id: string) {
    if (!window.confirm("¿Descartar este registro? No se enviará al servidor.")) return;
    await localdb.outboxDiscard(id);
    await refresh();
  }

  return (
    <>
      <button
        type="button"
        className="backdrop"
        aria-label="Cerrar centro de sincronización"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="drawer" aria-label="Centro de sincronización">
        <div className="drawer-head">
          <h2>Centro de sincronización</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={online ? "status-card ok" : "status-card warn"}>
          {online ? (
            <Wifi size={22} aria-hidden="true" />
          ) : (
            <WifiOff size={22} aria-hidden="true" />
          )}
          <div>
            <strong>{online ? "Conectado al servidor" : "Sin conexión"}</strong>
            <p>
              {lastSync
                ? `Última sincronización: ${fechaHora(lastSync)}`
                : "Aún no ha sincronizado en esta sesión."}
            </p>
          </div>
        </div>

        <div className="mini-stats">
          <div>
            <strong>{counts.pendiente}</strong>
            <span>Pendientes</span>
          </div>
          <div>
            <strong>{counts.rechazado + counts.conflicto}</strong>
            <span>Por revisar</span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={syncing}
          onClick={() => void syncNow()}
        >
          <RefreshCw size={16} aria-hidden="true" className={syncing ? "spin" : ""} />
          {syncing ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
        <p className="hint" aria-live="polite">
          {syncNotice}
        </p>

        <h3>Registros sin confirmar</h3>
        {items.length === 0 ? (
          <div className="empty-state ok">
            <CheckCircle2 size={26} aria-hidden="true" />
            <p>Todo está al día.</p>
          </div>
        ) : (
          <ul className="outbox">
            {items.map((it) => (
              <li key={it.id} className={`ob ob-${it.state}`}>
                <div>
                  <strong className="mono">{it.tag}</strong>
                  <span className="ob-species"> · {SPECIES_LABEL[it.species] ?? it.species}</span>
                  <p className="ob-state">
                    {it.state === "pendiente" && "Pendiente de enviar"}
                    {it.state === "rechazado" &&
                      `Rechazado · ${CODE_LABEL[it.errorCode ?? ""] ?? it.errorCode}`}
                    {it.state === "conflicto" &&
                      `Conflicto · ${CODE_LABEL[it.errorCode ?? ""] ?? it.errorCode}`}
                  </p>
                  {it.errorMessage && <p className="ob-msg">{it.errorMessage}</p>}
                  <small>Creado {fecha(it.createdAt)}</small>
                </div>
                {(it.state === "rechazado" || it.state === "conflicto") && (
                  <div className="ob-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void fix(it.id)}
                    >
                      Corregir
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void discard(it.id)}
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {fixing && (
          <RegisterDialog
            initial={fixing.payload}
            replaceCommandId={fixing.commandId}
            onClose={() => setFixing(null)}
          />
        )}
      </aside>
    </>
  );
}
