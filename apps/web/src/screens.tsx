import type { AnimalRegisterPayload, Species } from "@ganaderia/contracts";
import { ROLE_LABEL, can, isDryOffDue, isWeaningDue } from "@ganaderia/domain";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Baby,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  CloudOff,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lightbulb,
  Lock,
  LogOut,
  Mail,
  Menu,
  Package,
  PawPrint,
  PlusCircle,
  RefreshCw,
  Share,
  SquarePlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { RegisterForm } from "./Onboarding";
import { Pasture } from "./Pasture";
import { RegisterDialog, useFarms } from "./animals";
import { art } from "./art";
import { CardHead, CountUp, PageHead, Tile } from "./components";
import { CODE_LABEL, KIND_LABEL, fecha, fechaHora, num, todayLocal } from "./labels";
import { type OutboxItem, localdb } from "./lib/localdb";
import { lastEmail } from "./lib/session";
import { MODULES, type ModuleDef, type ModuleKey, moduleByKey } from "./modules";
import {
  haptic,
  isStandalone,
  useInstall,
  useMedia,
  usePullToRefresh,
  useScrolled,
  useSwipeDismiss,
} from "./native";
import { PROTO } from "./protoData";
import { useApp } from "./state";
import { statusOf } from "./supplies";

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
  const [mode, setMode] = useState<"ingreso" | "registro">(() =>
    new URLSearchParams(window.location.search).get("registro") !== null ? "registro" : "ingreso",
  );
  const [email, setEmail] = useState(lastEmail());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(0);
  const install = useInstall();
  const mobile = useMedia("(max-width: 900px)");
  const [nudgeOff, setNudgeOff] = useState(() => {
    try {
      return localStorage.getItem("gg.installNudge") === "off";
    } catch {
      return false;
    }
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await login(email, password);
    if (!res.ok) {
      setError(res.message);
      setShake((n) => n + 1);
      haptic(40);
    }
    setBusy(false);
  }

  return (
    <main className={mode === "registro" ? "login is-register" : "login"}>
      {busy && (
        <output className="boot">
          <span className="brand-mark brand-big" aria-hidden="true" />
          <p>Abriendo su finca…</p>
        </output>
      )}

      <section className="login-hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="login-hero-top">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Gestión Ganadera</span>
        </div>
        <div className="login-hero-body">
          <span className="hero-badge">
            <WifiOff size={14} aria-hidden="true" /> Funciona sin internet
          </span>
          <h2>
            Su finca ordenada, <em>con o sin señal.</em>
          </h2>
          <ul className="login-points">
            <li>
              <span className="pt-icon">
                <WifiOff size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>Registre en el potrero</strong>
                Todo se envía solo al volver la señal.
              </span>
            </li>
            <li>
              <span className="pt-icon">
                <KeyRound size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>Datos cifrados</strong>
                La copia del dispositivo se protege con su contraseña.
              </span>
            </li>
            <li>
              <span className="pt-icon">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>Cifras con fuente</strong>
                Cada número muestra qué registros lo componen.
              </span>
            </li>
          </ul>
        </div>
        <div className="hills-wrap" aria-hidden="true">
          <Pasture className="login-pasture" />
        </div>
      </section>

      <section className="login-panel">
        {mobile && !isStandalone() && !nudgeOff && (install.canInstall || install.iosHint) && (
          <div className="install-nudge">
            <div>
              <strong>Úsela como una app</strong>
              {install.canInstall ? (
                <p>Instálela en su celular: abre a pantalla completa y funciona sin internet.</p>
              ) : (
                <p>
                  Toque <Share size={14} aria-label="Compartir" /> y luego{" "}
                  <SquarePlus size={14} aria-hidden="true" /> «Añadir a pantalla de inicio».
                </p>
              )}
            </div>
            {install.canInstall && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void install.prompt()}
              >
                Instalar
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label="Ocultar"
              onClick={() => {
                setNudgeOff(true);
                try {
                  localStorage.setItem("gg.installNudge", "off");
                } catch {
                  /* sin almacenamiento */
                }
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {mode === "registro" ? (
          <RegisterForm onBack={() => setMode("ingreso")} />
        ) : (
          <form
            className="login-card"
            onSubmit={submit}
            aria-labelledby="login-title"
            noValidate={false}
          >
            <header className="lc-head">
              <p className="kicker">Sistema Integral de Gestión Ganadera</p>
              <h1 id="login-title">Ingrese a su finca</h1>
              <p className="lc-sub">Use el correo y la contraseña de su cuenta.</p>
            </header>

            <label className="field">
              <span className="field-label">Correo electrónico</span>
              <span className="field-box">
                <Mail size={19} aria-hidden="true" />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  placeholder="usuario@finca.co"
                  value={email}
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>

            <label className="field">
              <span className="field-label">Contraseña</span>
              <span className="field-box">
                <Lock size={19} aria-hidden="true" />
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Su contraseña"
                  value={password}
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPw}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </span>
            </label>

            {error && (
              <p key={shake} role="alert" className="login-alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block btn-xl" disabled={busy}>
              {busy ? (
                <>
                  <RefreshCw size={18} className="spin" aria-hidden="true" /> Verificando…
                </>
              ) : (
                <>
                  Ingresar <ArrowRight size={18} aria-hidden="true" className="arrow" />
                </>
              )}
            </button>

            <p className="lc-note">
              <CloudOff size={18} aria-hidden="true" />
              <span>
                <strong>¿Sin señal?</strong> Puede ingresar con su contraseña hasta 72 horas después
                de su último inicio de sesión en línea.
              </span>
            </p>

            <p className="lc-signup">
              ¿Aún no tiene cuenta?{" "}
              <button type="button" className="as-link" onClick={() => setMode("registro")}>
                Créela gratis
              </button>
            </p>

            <a className="lc-back" href="/">
              <ArrowLeft size={16} aria-hidden="true" /> Volver al sitio
            </a>
          </form>
        )}
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
      {MODULES.map((m, i) => (
        <li
          key={m.key}
          className={m.group && MODULES[i - 1]?.group !== m.group ? "nav-first-erp" : undefined}
        >
          {m.group && MODULES[i - 1]?.group !== m.group && (
            <p className="nav-group">Gestión empresarial · ERP</p>
          )}
          <button
            type="button"
            className={m.key === props.active ? "nav active" : "nav"}
            aria-current={m.key === props.active ? "page" : undefined}
            onClick={() => props.onPick(m.key)}
          >
            <ModIcon k={m.key} />
            <span className="nav-label">{m.label}</span>
            {m.phase && !PROTO[m.key] && <small title={`Planificado: ${m.phase}`}>Pronto</small>}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const install = useInstall();
  const mobile = useMedia("(max-width: 900px)");
  const scrolled = useScrolled();
  const ptr = usePullToRefresh(() => syncNow().then(() => undefined), mobile);
  const moreSwipe = useSwipeDismiss<HTMLElement>(() => setMore(false));

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
    <div className={scrolled ? "shell scrolled" : "shell"}>
      <a className="skip" href="#contenido">
        Ir al contenido
      </a>

      <aside className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-art-wrap" aria-hidden="true">
          <img className="sidebar-art" src={art("sidebar-top")} alt="" width={267} height={140} />
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
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <span className="brand-mark brand-sm hide-mobile" aria-hidden="true" />
            <span className="brand-line hide-mobile">
              <strong>Sistema Integral de Gestión Ganadera</strong>
              <span className="vbar" />
              <span>{org}</span>
            </span>
            <span className="brand-mark brand-mini only-mobile" aria-hidden="true" />
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
            <div className="user-wrap">
              {mobile ? (
                // En el celular el avatar solo identifica la cuenta: módulos y salida están en «Más».
                <span className="user" title={name}>
                  <span className="avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="sr-only">{name}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="user"
                  aria-label="Cuenta"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="user-text">
                    <strong>{name}</strong>
                    {role && <small>{ROLE_LABEL[role]}</small>}
                  </span>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
              )}
              {menuOpen && !mobile && (
                <>
                  <button
                    type="button"
                    className="menu-backdrop"
                    aria-label="Cerrar menú de cuenta"
                    tabIndex={-1}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="user-menu">
                    <div className="um-head">
                      <strong>{name}</strong>
                      {role && <small>{ROLE_LABEL[role]}</small>}
                      <small>{org}</small>
                    </div>
                    <button
                      type="button"
                      className="um-item"
                      onClick={() => {
                        setMenuOpen(false);
                        void exit();
                      }}
                    >
                      <LogOut size={18} aria-hidden="true" /> Cerrar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {!online && (
          <div className="offline-bar">
            <WifiOff size={16} aria-hidden="true" />
            <span>
              Sin conexión ·{" "}
              {pendientes > 0 ? `${pendientes} por enviar` : "los cambios se guardan aquí"}
            </span>
          </div>
        )}

        {sessionExpired && (
          <div className="banner banner-warn" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              La sesión caducó. Puede seguir trabajando sin conexión; para sincronizar, cierre
              sesión e ingrese de nuevo.
            </span>
          </div>
        )}

        <div
          className="ptr"
          style={{
            height: ptr.refreshing ? 56 : ptr.pull,
            opacity: ptr.refreshing ? 1 : Math.min(ptr.pull / 64, 1),
          }}
          aria-hidden="true"
        >
          <RefreshCw
            size={22}
            className={ptr.refreshing ? "spin" : ""}
            style={{ transform: ptr.refreshing ? undefined : `rotate(${ptr.pull * 4}deg)` }}
          />
        </div>

        <main id="contenido" className="content">
          <div key={props.module} className="screen">
            {props.children}
          </div>
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
            onClick={() => {
              haptic(8);
              pick(k);
            }}
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
          <aside
            className="sheet-panel"
            aria-label="Módulos"
            ref={moreSwipe.ref}
            {...moreSwipe.bind}
          >
            <span className="grabber" aria-hidden="true" />
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
            <div className="account">
              <span className="avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <span className="user-text">
                <strong>{name}</strong>
                {role && <small>{ROLE_LABEL[role]}</small>}
              </span>
            </div>
            <NavList active={props.module} onPick={pick} variant="sheet" />
            <div className="sheet-actions">
              {install.canInstall && (
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => void install.prompt()}
                >
                  <Download size={18} aria-hidden="true" /> Instalar en el celular
                </button>
              )}
              {install.iosHint && (
                <p className="hint">
                  <Download size={14} aria-hidden="true" /> Para instalar: toque Compartir y «Añadir
                  a pantalla de inicio».
                </p>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-block danger"
                onClick={() => {
                  setMore(false);
                  void exit();
                }}
              >
                <LogOut size={18} aria-hidden="true" /> Cerrar sesión
              </button>
            </div>
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
  const { orgId, counts, dataVersion, lastSync, online, role, session, syncNow, syncing } =
    useApp();
  const farms = useFarms();
  const [weaning, setWeaning] = useState(0);
  const [dryOff, setDryOff] = useState(0);
  const [inv, setInv] = useState<{ total: number; bovino: number; bufalino: number } | null>(null);
  const [stock, setStock] = useState({ low: 0, soon: 0, expired: 0 });

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void localdb.counts(orgId).then(setInv);
    void localdb.calves(orgId).then((list) => {
      const today = todayLocal();
      setWeaning(
        list.filter((c) => {
          const months = farms.find((f) => f.id === c.farmId)?.speciesSettings[c.species as Species]
            ?.weaningMonths;
          return months !== undefined && isWeaningDue(c.birthDate, months, today);
        }).length,
      );
    });
    void Promise.all([localdb.herdAnimals(orgId), localdb.listAnimalEvents(orgId)]).then(
      ([herd, events]) => {
        const today = todayLocal();
        setDryOff(
          herd.filter((a) => {
            const days = farms.find((f) => f.id === a.farmId)?.speciesSettings[a.species as Species]
              ?.dryOffDays;
            return (
              days !== undefined &&
              isDryOffDue(
                events.filter((e) => e.animalId === a.id),
                days,
                today,
              )
            );
          }).length,
        );
      },
    );
    void localdb.supplyOverview({ orgId }).then((list) => {
      const c = { low: 0, soon: 0, expired: 0 };
      for (const s of list) {
        const st = statusOf(s);
        if (st === "bajo_minimo" || (st === "sin_existencia" && s.minStock > 0)) c.low++;
        else if (st === "vence_pronto") c.soon++;
        else if (st === "vencido") c.expired++;
      }
      setStock(c);
    });
  }, [orgId, dataVersion, farms]);

  const demo = Boolean(
    session?.memberships[0]?.organizationName.toLowerCase().includes("demostrativa"),
  );
  const revisar = counts.rechazado + counts.conflicto;
  const lease = session ? new Date(session.offlineLeaseUntil) : null;
  const leaseHours = lease ? (lease.getTime() - Date.now()) / 3_600_000 : 0;
  const pctBov = inv && inv.total > 0 ? Math.round((inv.bovino / inv.total) * 100) : 0;

  const alerts: {
    tone: "error" | "warn" | "info";
    icon: ReactNode;
    title: string;
    text: string;
    go?: () => void;
  }[] = [];
  if (revisar > 0) {
    alerts.push({
      tone: "error",
      icon: <AlertTriangle size={22} />,
      title: `${revisar} registro(s) no se pudieron confirmar`,
      text: "Fueron rechazados o chocan con un dato ya confirmado. Corríjalos para que se envíen.",
      go: onOpenSync,
    });
  }
  if (role && can(role, "farm.write") && farms.length === 0 && online) {
    alerts.push({
      tone: "info",
      icon: <Building2 size={22} />,
      title: "Registre su finca para empezar",
      text: "Con sus datos y áreas ya puede cargar animales y calcular la carga.",
      go: () => onModule("configuracion"),
    });
  }
  if (weaning > 0) {
    alerts.push({
      tone: "info",
      icon: <Baby size={22} />,
      title: `${weaning} cría(s) en edad de destete`,
      text: "Según la edad de destete definida para la finca. Revíselas en Animales.",
      go: () => onModule("animales"),
    });
  }
  if (dryOff > 0) {
    alerts.push({
      tone: "info",
      icon: <Baby size={22} />,
      title: `${dryOff} hembra(s) para secar`,
      text: "Llegaron a los días de lactancia definidos para la finca. Regístrelo en Reproducción.",
      go: () => onModule("reproduccion"),
    });
  }
  if (stock.expired > 0) {
    alerts.push({
      tone: "error",
      icon: <AlertTriangle size={22} />,
      title: `${stock.expired} insumo(s) con lotes vencidos en bodega`,
      text: "No se pueden consumir. Revíselos en Compras e insumos.",
      go: () => onModule("compras"),
    });
  }
  if (stock.soon > 0) {
    alerts.push({
      tone: "warn",
      icon: <Clock size={22} />,
      title: `${stock.soon} insumo(s) vencen en los próximos 30 días`,
      text: "Use primero los lotes que vencen antes: el sistema los descuenta así.",
      go: () => onModule("compras"),
    });
  }
  if (stock.low > 0) {
    alerts.push({
      tone: "info",
      icon: <Package size={22} />,
      title: `${stock.low} insumo(s) por debajo del mínimo`,
      text: "Conviene reponerlos antes de que falten.",
      go: () => onModule("compras"),
    });
  }
  if (counts.pendiente > 0) {
    alerts.push({
      tone: "info",
      icon: <Clock size={22} />,
      title: `${counts.pendiente} registro(s) esperan ser enviados`,
      text: online
        ? "Se envían al sincronizar."
        : "Están guardados en este dispositivo y se enviarán al recuperar la conexión.",
      go: onOpenSync,
    });
  }
  if (lease && leaseHours > 0 && leaseHours < 24) {
    alerts.push({
      tone: "warn",
      icon: <KeyRound size={22} />,
      title: "El permiso para trabajar sin conexión vence pronto",
      text: `Conéctese antes del ${fechaHora(lease.toISOString())} para renovarlo.`,
    });
  }

  return (
    <section className="page">
      <PageHead
        kicker="Inicio"
        title="¿Qué requiere atención hoy?"
        lead="Un vistazo general para priorizar las actividades de la finca."
      />

      <div className="quick-actions">
        <button type="button" className="btn btn-primary" onClick={() => onModule("animales")}>
          <PlusCircle size={18} aria-hidden="true" /> Registrar animal
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void syncNow()}
          disabled={syncing}
        >
          <RefreshCw size={18} aria-hidden="true" className={syncing ? "spin" : ""} /> Sincronizar
        </button>
      </div>

      <div className="tiles">
        <Tile
          tone="verde"
          art={art("tile-herd")}
          label="Inventario del hato"
          icon={<Users size={20} aria-hidden="true" />}
          value={inv ? <CountUp value={inv.total} /> : "—"}
          meta={
            inv
              ? `animales activos · ${num(inv.bovino)} bovinos, ${num(inv.bufalino)} bufalinos`
              : undefined
          }
          onGo={() => onModule("animales")}
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
        </Tile>
        <Tile
          tone="azul"
          art={art("tile-milk")}
          label="Producción y crecimiento"
          icon={<ModIcon k="produccion" />}
          value={demo ? "186 L" : "—"}
          meta={demo ? "ordeño de hoy · ejemplo" : "Leche (L) y pesajes (kg)"}
          soon={demo ? "Ejemplo" : "Semana 6"}
        />
        <Tile
          tone="ambar"
          art={art("tile-calf")}
          label="Estado reproductivo"
          icon={<ModIcon k="reproduccion" />}
          value={demo ? "4" : "—"}
          meta={demo ? "gestaciones confirmadas · ejemplo" : "Servicios, diagnósticos y partos"}
          soon={demo ? "Ejemplo" : "Semana 7"}
        />
        <Tile
          tone="violeta"
          art={art("tile-coins")}
          label="Costos y márgenes"
          icon={<ModIcon k="economia" />}
          value={demo ? "$ 2,4 M" : "—"}
          meta={demo ? "saldo del mes · ejemplo" : "Saldo de movimientos registrados"}
          soon={demo ? "Ejemplo" : "Semana 11"}
        />
      </div>

      <div className="two">
        <article className="card">
          <CardHead
            icon={<CalendarDays size={26} aria-hidden="true" />}
            title="Agenda del día"
            sub="Actividades programadas para hoy en la finca."
            action={
              <button type="button" className="btn btn-ghost btn-sm" disabled>
                Ver agenda completa ›
              </button>
            }
          />
          {demo ? (
            <ul className="agenda">
              {[
                {
                  t: "Pesaje del lote de levante",
                  s: "Lote 1 · Potrero Sur",
                  st: "Pendiente",
                  c: "warn",
                },
                { t: "Control reproductivo", s: "Vacas en servicio", st: "Pendiente", c: "warn" },
                {
                  t: "Visita del asesor",
                  s: "Revisión general de la finca",
                  st: "Programada",
                  c: "info",
                },
              ].map((r) => (
                <li key={r.t}>
                  <span className="gi gi-on">
                    <CalendarDays size={22} aria-hidden="true" />
                  </span>
                  <span className="ag-text">
                    <strong>{r.t}</strong>
                    <small>{r.s}</small>
                  </span>
                  <span className={`pill-st st-${r.c}`}>{r.st}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="ghost-list" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <span className="gi" />
                  <span className="gl">
                    <i />
                    <i />
                  </span>
                  <span className="gp" />
                </li>
              ))}
            </ul>
          )}
          <p className="ghost-note">
            <Clock size={16} aria-hidden="true" />{" "}
            {demo
              ? "Datos de ejemplo: las tareas reales llegan con el módulo de tareas (semana 11)."
              : "Las tareas, controles y visitas aparecerán aquí con el módulo de tareas (semana 11)."}
          </p>
        </article>

        <article className="card">
          <CardHead
            icon={<Bell size={26} aria-hidden="true" />}
            title="Alertas para revisar"
            sub="Situaciones que requieren su atención."
            action={
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSync}>
                Ver sincronización ›
              </button>
            }
          />
          {alerts.length === 0 ? (
            <div className="empty-state ok">
              <CheckCircle2 size={34} aria-hidden="true" />
              <p>Todo en orden. No hay alertas por ahora.</p>
            </div>
          ) : (
            <ul className="alert-rows">
              {alerts.map((a) => (
                <li key={a.title}>
                  <span className={`ar-icon ar-${a.tone}`}>{a.icon}</span>
                  <div className="ar-text">
                    <strong>{a.title}</strong>
                    <p>{a.text}</p>
                  </div>
                  {a.go && (
                    <button
                      type="button"
                      className="ar-go"
                      aria-label={`Abrir: ${a.title}`}
                      onClick={a.go}
                    >
                      ›
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="two two-wide">
        <article className="card">
          <CardHead
            icon={<ClipboardCheck size={26} aria-hidden="true" />}
            title="Avance de mis planes"
            sub="Seguimiento al cumplimiento de los planes de la finca."
            action={
              <button type="button" className="btn btn-ghost btn-sm" disabled>
                Ver planes completos ›
              </button>
            }
          />
          <div className="plans">
            {[
              { label: "Sanidad", pct: 45, icon: <ModIcon k="sanidad" size={24} /> },
              { label: "Pastoreo", pct: 80, icon: <ModIcon k="pasturas" size={24} /> },
              { label: "Alimentación", pct: 60, icon: <Package size={24} aria-hidden="true" /> },
            ].map((p) => (
              <div key={p.label} className="plan">
                <span className="plan-icon">{p.icon}</span>
                <div>
                  <strong>{p.label}</strong>
                  <span className="plan-bar" aria-hidden="true">
                    {demo && <i style={{ width: `${p.pct}%` }} />}
                  </span>
                  <small>{demo ? `${p.pct} % · ejemplo` : "Sin plan registrado"}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card cta-card">
          <div className="cta-text">
            <CardHead
              icon={<Lightbulb size={26} aria-hidden="true" />}
              title="Apoyo para decidir"
              sub="Revisa los datos antes de actuar."
            />
            <button type="button" className="btn btn-primary" onClick={() => onModule("animales")}>
              Ver de dónde salen las cifras ›
            </button>
          </div>
          <img className="cta-art" src={art("cta-art")} alt="" />
        </article>
      </div>

      <article className="card device">
        <CardHead
          icon={<Database size={26} aria-hidden="true" />}
          title="Este dispositivo"
          sub="Copia local cifrada de sus fincas."
        />
        <dl className="kv kv-row">
          <div>
            <dt>Conexión</dt>
            <dd>{online ? "En línea" : "Sin conexión"}</dd>
          </div>
          <div>
            <dt>Última sincronización</dt>
            <dd>{lastSync ? fechaHora(lastSync) : "Aún no en esta sesión"}</dd>
          </div>
          <div>
            <dt>Trabajo sin conexión hasta</dt>
            <dd>{lease ? fechaHora(lease.toISOString()) : "—"}</dd>
          </div>
          <div>
            <dt>Cifrado</dt>
            <dd>Con su contraseña (AES-256)</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

/* ───────────── Módulos en construcción ───────────── */

/** Acciones principales de cada módulo, tal como aparecen en el diseño de referencia (aún sin función). */
const PREVIEW_ACTIONS: Partial<Record<ModuleKey, string[]>> = {
  produccion: ["Registrar ordeño", "Control de calidad", "Registrar peso"],
  reproduccion: ["Registrar servicio", "Registrar diagnóstico", "Registrar parto"],
  sanidad: ["Registrar evento sanitario", "Programar campaña", "Ver historial"],
  pasturas: ["Registrar aforo", "Planificar rotación", "Confirmar movimiento"],
  economia: ["Registrar ingreso", "Registrar egreso", "Ver soportes"],
  asistencia: ["Programar visita", "Registrar recomendación", "Generar informe"],
  ventas: ["Registrar venta", "Nuevo cliente"],
  personal: ["Registrar trabajador", "Programar turno"],
  activos: ["Registrar equipo", "Programar mantenimiento"],
  contabilidad: ["Registrar factura", "Cierre del mes"],
};

export function ModulePreview({ module }: { module: ModuleKey }) {
  const m: ModuleDef = moduleByKey(module);
  const Icon = m.icon;
  const actions = PREVIEW_ACTIONS[module] ?? [];
  return (
    <section className="page">
      <PageHead
        kicker={m.label}
        icon={<Icon size={30} aria-hidden="true" />}
        title={m.title ?? m.label}
        {...(m.lead ? { lead: m.lead } : {})}
        actions={actions.map((label, i) => (
          <button
            key={label}
            type="button"
            className={i === 0 ? "btn btn-primary" : "btn btn-ghost"}
            disabled
            title={`Disponible en ${m.phase}`}
          >
            {label}
          </button>
        ))}
      />
      <div className="banner banner-info">
        <ModIcon k={module} size={18} />
        <span>
          <strong>Módulo en construcción.</strong> Planificado para <strong>{m.phase}</strong> del
          plan de desarrollo. Esta vista muestra lo que incluirá; todavía no registra datos.
        </span>
      </div>
      <div className="preview-cards">
        {m.cards?.map((c) => {
          const CardIcon = c.icon;
          return (
            <article key={c.title} className="card">
              <CardHead
                icon={<CardIcon size={26} aria-hidden="true" />}
                title={c.title}
                sub={c.text}
                action={<span className="chip chip-soon">{c.when}</span>}
              />
              <ul className="ghost-list" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i}>
                    <span className="gi" />
                    <span className="gl">
                      <i />
                      <i />
                    </span>
                    <span className="gp" />
                  </li>
                ))}
              </ul>
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
  const swipe = useSwipeDismiss<HTMLElement>(onClose);
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
    // Solo las altas de animales se corrigen en un formulario; el resto se descarta y se vuelve a capturar.
    if (cmd?.type === "animal.register") setFixing({ payload: cmd.payload, commandId: id });
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
      <aside
        className="drawer sync-drawer"
        aria-label="Centro de sincronización"
        ref={swipe.ref}
        {...swipe.bind}
      >
        <span className="grabber" aria-hidden="true" />
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
                  <strong className="mono">{it.label}</strong>
                  <span className="ob-species"> · {KIND_LABEL[it.kind] ?? it.kind}</span>
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
                    {it.kind === "animal.register" && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void fix(it.id)}
                      >
                        Corregir
                      </button>
                    )}
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
