import type { AnimalRegisterPayload } from "@ganaderia/contracts";
import { ROLE_LABEL } from "@ganaderia/domain";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { RegisterDialog } from "./animals";
import { CODE_LABEL, SPECIES_LABEL, fecha, fechaHora, num } from "./labels";
import { type OutboxItem, localdb } from "./lib/localdb";
import { lastEmail } from "./lib/session";
import { useApp } from "./state";

export type ModuleKey =
  | "inicio"
  | "animales"
  | "produccion"
  | "reproduccion"
  | "sanidad"
  | "pasturas"
  | "economia"
  | "asistencia";

const MODULES: { key: ModuleKey; label: string; phase?: string; blurb?: string }[] = [
  { key: "inicio", label: "Inicio" },
  { key: "animales", label: "Animales" },
  {
    key: "produccion",
    label: "Producción",
    phase: "Semana 6",
    blurb:
      "Leche por animal o por lote (litros) y pesajes medidos o estimados, sin duplicar totales.",
  },
  {
    key: "reproduccion",
    label: "Reproducción",
    phase: "Semana 7",
    blurb:
      "Servicio, diagnóstico, parto con cría vinculada, aborto y secado, con parámetros por especie.",
  },
  {
    key: "sanidad",
    label: "Sanidad",
    phase: "Semana 8",
    blurb: "Vacunación, tratamientos, retiros de leche y carne, y campañas sobre varios animales.",
  },
  {
    key: "pasturas",
    label: "Pasturas y alimentación",
    phase: "Fase 2",
    blurb: "Mapa de potreros, aforos, presupuesto forrajero y dietas versionadas.",
  },
  {
    key: "economia",
    label: "Economía",
    phase: "Semana 11",
    blurb:
      "Ingresos y egresos manuales con soportes. El saldo se llama «saldo de movimientos registrados».",
  },
  {
    key: "asistencia",
    label: "Asistencia técnica",
    phase: "Fase 2",
    blurb: "Visitas, recomendaciones, compromisos y acceso compartido con vigencia.",
  },
];

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
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Verificando…" : "Ingresar"}
        </button>
        <p className="hint">
          Sin conexión puede ingresar con su contraseña durante 72 horas desde el último inicio de
          sesión en línea.
        </p>
      </form>
    </main>
  );
}

export function Shell(props: {
  module: ModuleKey;
  onModule(m: ModuleKey): void;
  syncOpen: boolean;
  onSyncOpen(open: boolean): void;
  children: ReactNode;
}) {
  const { session, role, online, syncing, counts, logout, syncNow, syncNotice, sessionExpired } =
    useApp();
  const pendientes = counts.pendiente;
  const revisar = counts.rechazado + counts.conflicto;

  async function exit() {
    if (pendientes > 0 || revisar > 0) {
      const ok = window.confirm(
        `Hay ${pendientes + revisar} registros sin confirmar en el servidor. Se conservan cifrados en este dispositivo y se enviarán al volver a ingresar con conexión. ¿Cerrar sesión?`,
      );
      if (!ok) return;
    }
    await logout();
  }

  return (
    <div className="shell">
      <a className="skip" href="#contenido">
        Ir al contenido
      </a>
      <nav className="sidebar" aria-label="Módulos">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Gestión Ganadera</span>
        </div>
        <ul>
          {MODULES.map((m) => (
            <li key={m.key}>
              <button
                type="button"
                className={m.key === props.module ? "nav active" : "nav"}
                aria-current={m.key === props.module ? "page" : undefined}
                onClick={() => props.onModule(m.key)}
              >
                {m.label}
                {m.phase && <small>{m.phase}</small>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <strong>Sistema Integral de Gestión Ganadera</strong>
            <span>{session?.memberships[0]?.organizationName}</span>
          </div>
          <div className="topbar-actions">
            <output className={online ? "pill pill-ok" : "pill pill-warn"}>
              {online ? "En línea" : "Sin conexión"}
            </output>
            <button type="button" className="btn btn-ghost" onClick={() => props.onSyncOpen(true)}>
              Sincronización
              {pendientes + revisar > 0 && <span className="badge">{pendientes + revisar}</span>}
            </button>
            <span className="user">
              {session?.displayName}
              {role && <small>{ROLE_LABEL[role]}</small>}
            </span>
            <button type="button" className="btn btn-ghost" onClick={exit}>
              Salir
            </button>
          </div>
        </header>

        {sessionExpired && (
          <div className="banner banner-warn" role="alert">
            La sesión caducó. Puede seguir trabajando sin conexión; para sincronizar, cierre sesión
            e ingrese de nuevo.
          </div>
        )}

        <main id="contenido" className="content">
          {props.children}
        </main>

        <div className="statusbar" aria-live="polite">
          {syncing ? "Sincronizando…" : (syncNotice ?? "Listo.")}
          <button type="button" className="link" onClick={() => void syncNow()} disabled={syncing}>
            Sincronizar ahora
          </button>
        </div>
      </div>

      {props.syncOpen && <SyncDrawer onClose={() => props.onSyncOpen(false)} />}
    </div>
  );
}

export function Placeholder({ module }: { module: ModuleKey }) {
  const m = MODULES.find((x) => x.key === module);
  return (
    <section>
      <p className="kicker">Módulo en construcción</p>
      <h1>{m?.label}</h1>
      <p className="lead">{m?.blurb}</p>
      <p className="hint">
        Planificado para: <strong>{m?.phase}</strong>. La pantalla se activará con el avance del
        plan de desarrollo.
      </p>
    </section>
  );
}

export function Home({
  onOpenSync,
  onModule,
}: { onOpenSync(): void; onModule(m: ModuleKey): void }) {
  const { orgId, counts, dataVersion, lastSync, online } = useApp();
  const [inv, setInv] = useState<{ total: number; bovino: number; bufalino: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.counts(orgId).then(setInv);
  }, [orgId, dataVersion]);

  const revisar = counts.rechazado + counts.conflicto;
  return (
    <section>
      <p className="kicker">Inicio</p>
      <h1>¿Qué requiere atención hoy?</h1>
      <p className="lead">Un vistazo general para priorizar las actividades de la finca.</p>

      <div className="cards">
        <article className="card">
          <p className="card-label">Inventario activo</p>
          <p className="figure">{inv ? num(inv.total) : "—"}</p>
          <p className="card-meta">
            animales · {inv ? `${num(inv.bovino)} bovinos, ${num(inv.bufalino)} bufalinos` : ""}
          </p>
          <p className="card-source">
            Fuente: registros de este dispositivo
            {lastSync ? ` · actualizado el ${fechaHora(lastSync)}` : " · aún sin sincronizar"}
          </p>
          <button type="button" className="link" onClick={() => onModule("animales")}>
            Ver animales
          </button>
        </article>
        <article className="card">
          <p className="card-label">Pendientes de enviar</p>
          <p className="figure">{num(counts.pendiente)}</p>
          <p className="card-meta">
            {online ? "Se envían al sincronizar." : "Se enviarán al recuperar la conexión."}
          </p>
          <button type="button" className="link" onClick={onOpenSync}>
            Abrir sincronización
          </button>
        </article>
      </div>

      <h2>Alertas para revisar</h2>
      {revisar === 0 ? (
        <p className="empty">No hay alertas por ahora.</p>
      ) : (
        <ul className="alerts">
          <li>
            <strong>{revisar} registro(s) no se pudieron confirmar.</strong> Fueron rechazados o
            tienen un conflicto con un dato ya confirmado.{" "}
            <button type="button" className="link" onClick={onOpenSync}>
              Revisar y corregir
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}

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
    <aside className="drawer" aria-label="Centro de sincronización">
      <div className="drawer-head">
        <h2>Centro de sincronización</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <dl className="kv">
        <dt>Estado</dt>
        <dd>{online ? "En línea" : "Sin conexión"}</dd>
        <dt>Última sincronización</dt>
        <dd>{lastSync ? fechaHora(lastSync) : "Aún no ha sincronizado en esta sesión"}</dd>
        <dt>Pendientes</dt>
        <dd>{counts.pendiente}</dd>
        <dt>Por revisar</dt>
        <dd>{counts.rechazado + counts.conflicto}</dd>
      </dl>
      <button
        type="button"
        className="btn btn-primary"
        disabled={syncing}
        onClick={() => void syncNow()}
      >
        {syncing ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
      <p className="hint" aria-live="polite">
        {syncNotice}
      </p>

      <h3>Registros sin confirmar</h3>
      {items.length === 0 ? (
        <p className="empty">Todo está al día.</p>
      ) : (
        <ul className="outbox">
          {items.map((it) => (
            <li key={it.id} className={`ob ob-${it.state}`}>
              <div>
                <strong className="mono">{it.tag}</strong> ·{" "}
                {SPECIES_LABEL[it.species] ?? it.species}
                <br />
                <span className="ob-state">
                  {it.state === "pendiente" && "Pendiente de enviar"}
                  {it.state === "rechazado" &&
                    `Rechazado · ${CODE_LABEL[it.errorCode ?? ""] ?? it.errorCode}`}
                  {it.state === "conflicto" &&
                    `Conflicto · ${CODE_LABEL[it.errorCode ?? ""] ?? it.errorCode}`}
                </span>
                {it.errorMessage && <p className="ob-msg">{it.errorMessage}</p>}
                <small>Creado {fecha(it.createdAt)}</small>
              </div>
              {(it.state === "rechazado" || it.state === "conflicto") && (
                <div className="ob-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => void fix(it.id)}>
                    Corregir
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
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
  );
}
