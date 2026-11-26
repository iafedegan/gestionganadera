import type { AnimalRegisterPayload, DemoUserDto, Species } from "@ganaderia/contracts";
import { ROLE_LABEL, can, isDryOffDue, isWeaningDue } from "@ganaderia/domain";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  Circle,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Menu,
  PawPrint,
  Plus,
  RefreshCw,
  Share,
  SquarePlus,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { AlertsSheet, useAlerts } from "./Alerts";
import { AssistantDialog } from "./Assistant";
import { FarmIntel } from "./FarmIntel";
import { FarmChip } from "./FarmPicker";
import { HomeStory } from "./HomeStory";
import { type PendingInvite, RegisterForm } from "./Onboarding";
import { Pasture } from "./Pasture";
import { ProfileWizard, useFarmProfile } from "./Profile";
import { QuickSheet, quickFor } from "./QuickAdd";
import { RegisterDialog, useActiveFarm, useFarms } from "./animals";
import { art } from "./art";
import { CardHead, PageHead } from "./components";
import { MOV_SEED, type Mov } from "./herd";
import { useStore } from "./kit";
import { CODE_LABEL, KIND_LABEL, fecha, fechaHora, num, todayLocal } from "./labels";
import { ApiError, api } from "./lib/api";
import { type HomeStats, homeStats } from "./lib/homeStats";
import { type OutboxItem, localdb } from "./lib/localdb";
import { lastEmail } from "./lib/session";
import {
  GROUP_LABEL,
  type ModuleDef,
  type ModuleKey,
  ROLE_TABS,
  canSeeModule,
  moduleByKey,
  modulesFor,
} from "./modules";
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
import { SETUP_MODULES, type SetupState } from "./setup";
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
  const { login, demoLogin } = useApp();
  const [demos, setDemos] = useState<DemoUserDto[]>([]);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);
  // Solo aparecen si el servidor las ofrece; si no, la lista falla en silencio y no se muestra nada.
  useEffect(() => {
    api
      .demoUsers()
      .then(setDemos)
      .catch(() => setDemos([]));
  }, []);
  const inviteCode = new URLSearchParams(window.location.search).get("invitacion");
  const [mode, setMode] = useState<"ingreso" | "registro">(() =>
    new URLSearchParams(window.location.search).get("registro") !== null || inviteCode
      ? "registro"
      : "ingreso",
  );
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Enlace de invitación: se valida y se guarda para aceptarlo también si ya tiene cuenta.
  useEffect(() => {
    if (!inviteCode) return;
    try {
      sessionStorage.setItem("gg.invite", inviteCode);
    } catch {
      /* sin almacenamiento de sesión */
    }
    api
      .previewInvitation(inviteCode)
      .then((preview) => setInvite({ code: inviteCode, preview }))
      .catch((e) => {
        setInviteError(
          e instanceof ApiError
            ? e.message
            : "No se pudo validar la invitación: revise su conexión.",
        );
        setMode("ingreso");
      });
  }, [inviteCode]);
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
          <RegisterForm onBack={() => setMode("ingreso")} invite={invite} />
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
              {invite && (
                <p className="lc-invite">
                  Al ingresar se unirá a <b>{invite.preview.organizationName}</b>.
                </p>
              )}
              {inviteError && (
                <p role="alert" className="login-alert">
                  {inviteError}
                </p>
              )}
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

            {demos.length > 0 && (
              <section className="lc-demo" aria-label="Cuentas de muestra">
                <h2>Probar sin contraseña</h2>
                <p>Elija una cuenta de muestra: los datos son de ejemplo.</p>
                <ul>
                  {demos.map((d, i) => (
                    <li key={d.key}>
                      {d.group && d.group !== demos[i - 1]?.group && (
                        <h3 className="lc-demo-group">{d.group}</h3>
                      )}
                      <button
                        type="button"
                        className="lc-demo-btn"
                        disabled={demoBusy !== null}
                        onClick={async () => {
                          setDemoBusy(d.key);
                          setError(null);
                          const res = await demoLogin(d.key);
                          if (!res.ok) setError(res.message);
                          setDemoBusy(null);
                        }}
                      >
                        <strong>{d.label}</strong>
                        <small>
                          {demoBusy === d.key ? "Preparando la cuenta…" : d.description}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
  locked?: boolean;
}) {
  const { role } = useApp();
  const list = modulesFor(role).filter((m) => !props.locked || SETUP_MODULES.includes(m.key));
  // En celular el menú es una cuadrícula de íconos por grupos: se encuentra todo de un vistazo.
  if (props.variant === "sheet") {
    const groups: { title: string; items: ModuleDef[] }[] = [
      { title: "Mi finca", items: list.filter((m) => !m.group) },
      { title: GROUP_LABEL.ecosistema, items: list.filter((m) => m.group === "ecosistema") },
      { title: "Mi empresa", items: list.filter((m) => m.group === "erp") },
    ].filter((g) => g.items.length > 0);
    return (
      <div className="mod-grid">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mod-group">{g.title}</h3>
            {/* Cuatro módulos van en una sola fila: ninguno queda suelto. */}
            <ul className={g.items.length === 4 ? "cols-4" : undefined}>
              {g.items.map((m) => (
                <li key={m.key}>
                  <button
                    type="button"
                    className={m.key === props.active ? "mod-tile active" : "mod-tile"}
                    aria-current={m.key === props.active ? "page" : undefined}
                    onClick={() => props.onPick(m.key)}
                  >
                    <span className="mod-icon">
                      <ModIcon k={m.key} size={24} />
                    </span>
                    <span className="mod-label">{m.short}</span>
                    {m.phase && !PROTO[m.key] && <small>Pronto</small>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }
  return (
    <ul className="nav-list">
      {list.map((m, i) => (
        <li
          key={m.key}
          className={m.group && list[i - 1]?.group !== m.group ? "nav-first-erp" : undefined}
        >
          {m.group && list[i - 1]?.group !== m.group && (
            <p className="nav-group">{GROUP_LABEL[m.group]}</p>
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

const DEFAULT_TABS: ModuleKey[] = ["inicio", "animales", "produccion", "reproduccion"];

export function Shell(props: {
  module: ModuleKey;
  onModule(m: ModuleKey): void;
  syncOpen: boolean;
  onSyncOpen(open: boolean): void;
  /** Configuración mínima incompleta: solo se muestran los módulos para completarla. */
  locked?: boolean;
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
  const [quickOpen, setQuickOpen] = useState(false);

  // El menú "Más" solo existe en celular: si la ventana se ensancha, se cierra.
  useEffect(() => {
    const m = window.matchMedia("(min-width: 901px)");
    const close = () => m.matches && setMore(false);
    m.addEventListener("change", close);
    return () => m.removeEventListener("change", close);
  }, []);
  const pendientes = counts.pendiente;
  const revisar = counts.rechazado + counts.conflicto;
  const [alertsOpen, setAlertsOpen] = useState(false);
  const shellAlerts = useAlerts(
    () => {
      setAlertsOpen(false);
      props.onSyncOpen(true);
    },
    (m) => {
      setAlertsOpen(false);
      props.onModule(m);
    },
  );
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

  const tabs = ((role && ROLE_TABS[role]) || DEFAULT_TABS).filter(
    (k) => !props.locked || SETUP_MODULES.includes(k),
  );
  const quick = props.locked ? [] : quickFor(role);

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
          <NavList active={props.module} onPick={pick} locked={props.locked ?? false} />
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
            <FarmChip />
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
              aria-label={`Alertas${shellAlerts.length > 0 ? `, ${shellAlerts.length}` : ""}`}
              aria-haspopup="dialog"
              onClick={() => setAlertsOpen(true)}
            >
              <Bell size={20} />
              {shellAlerts.length > 0 && <span className="dot">{shellAlerts.length}</span>}
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

      <nav className={quick.length ? "bottom-nav has-quick" : "bottom-nav"} aria-label="Módulos">
        {tabs.slice(0, quick.length ? 2 : 4).map((k) => (
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
        {quick.length > 0 && (
          <button
            type="button"
            className="tab tab-quick"
            aria-haspopup="dialog"
            onClick={() => {
              haptic(10);
              setQuickOpen(true);
            }}
          >
            <span className="tq-ring" aria-hidden="true">
              <Plus size={28} strokeWidth={2.6} />
            </span>
            <span>Anotar</span>
          </button>
        )}
        {quick.length > 0 &&
          tabs.slice(2, 3).map((k) => (
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

      {quickOpen && (
        <QuickSheet items={quick} onModule={pick} onClose={() => setQuickOpen(false)} />
      )}

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
            <NavList
              active={props.module}
              onPick={pick}
              variant="sheet"
              locked={props.locked ?? false}
            />
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
      {alertsOpen && <AlertsSheet alerts={shellAlerts} onClose={() => setAlertsOpen(false)} />}
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
  setup,
}: {
  onOpenSync(): void;
  onModule(m: ModuleKey): void;
  /** Configuración mínima pendiente: Inicio muestra solo los pasos para completarla. */
  setup: SetupState | null;
}) {
  const { orgId, dataVersion, role, session } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [inv, setInv] = useState<{ total: number; bovino: number; bufalino: number } | null>(null);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [movs] = useStore<Mov>("movs-eco", MOV_SEED);
  const farmProfile = useFarmProfile();
  const [profileOpen, setProfileOpen] = useState<"edit" | "view" | null>(null);
  const [asking, setAsking] = useState(false);
  const savedProfile = farmProfile.dto?.profile ?? null;
  const profileDialog = profileOpen && (
    <ProfileWizard
      initial={savedProfile}
      showResult={profileOpen === "view"}
      onClose={() => setProfileOpen(null)}
      onModule={onModule}
    />
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    const inScope = <T extends { farmId: string }>(list: T[]) =>
      active ? list.filter((x) => x.farmId === active) : list;
    if (!active) void localdb.counts(orgId).then(setInv);
    void Promise.all([localdb.herdAnimals(orgId), localdb.listAnimalEvents(orgId)]).then(
      ([allHerd, allEvents]) => {
        const herd = inScope(allHerd);
        if (active)
          setInv({
            total: herd.length,
            bovino: herd.filter((a) => a.species === "bovino").length,
            bufalino: herd.filter((a) => a.species === "bufalino").length,
          });
        setStats(homeStats(herd, inScope(allEvents), todayLocal()));
      },
    );
  }, [orgId, dataVersion, active]);

  const alerts = useAlerts(onOpenSync, onModule);
  const first = (session?.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const dateText = longDate.format(new Date());
  const farmText = active
    ? ` · ${farms.find((f) => f.id === active)?.name ?? ""}`
    : farms.length === 1
      ? ` · ${farms[0]?.name}`
      : farms.length > 1
        ? ` · ${farms.length} fincas`
        : "";
  const canEvents = Boolean(role && can(role, "event.write"));
  const canAnimals = Boolean(role && can(role, "animal.write"));
  const month = todayLocal().slice(0, 7);
  const monthMovs = movs.filter((m) => m.fecha.startsWith(month));
  const balance = monthMovs.reduce((t, m) => t + (m.tipo === "Ingreso" ? m.valor : -m.valor), 0);

  if (setup) {
    const done = setup.steps.filter((x) => x.done).length;
    const total = setup.steps.length;
    const canDo = (m: ModuleKey) =>
      Boolean(role && can(role, m === "animales" ? "animal.write" : "farm.write"));
    const nextKey = setup.steps.find((x) => !x.done)?.key;
    return (
      <section className="page page-home">
        <PageHead
          kicker={first ? `${greeting()}, ${first}` : greeting()}
          title={
            canDo("configuracion")
              ? "Configuremos su ganadería"
              : "Su ganadería se está configurando"
          }
          lead={
            canDo("configuracion")
              ? "Complete estos pasos y se activan todos los módulos con sus datos reales."
              : "Cuando el propietario registre la finca y los animales, aquí verá todo el resumen."
          }
        />
        <article className="card first-steps">
          <div className="fs-head">
            <div>
              <h2>Primeros pasos</h2>
              <p>
                {done} de {total} listos
                {done < total ? ` · falta${total - done === 1 ? "" : "n"} ${total - done}` : ""}
              </p>
            </div>
            <span
              className="fs-ring"
              style={{ "--p": `${(done / total) * 100}%` } as CSSProperties}
            >
              {done}/{total}
            </span>
          </div>
          <ol className="fs-list">
            {[...setup.steps.filter((x) => x.done), ...setup.steps.filter((x) => !x.done)].map(
              (st) => {
                const next = st.key === nextKey;
                return (
                  <li key={st.key} className={st.done ? "done" : next ? "next" : ""}>
                    <span className="fs-mark" aria-hidden="true">
                      {st.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </span>
                    <span className="fs-text">
                      <strong>{st.title}</strong>
                      <small>{st.done ? "Listo" : st.text}</small>
                    </span>
                    {!st.done && canDo(st.module) && (
                      <button
                        type="button"
                        className={next ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                        onClick={() =>
                          st.key === "perfil" ? setProfileOpen("edit") : onModule(st.module)
                        }
                      >
                        {next ? "Empezar" : "Ir"} ›
                      </button>
                    )}
                  </li>
                );
              },
            )}
          </ol>
        </article>
        <article className="card fs-locked">
          <span className="fs-lock-icon" aria-hidden="true">
            <Lock size={22} />
          </span>
          <div>
            <strong>Se activan al terminar</strong>
            <p>
              Producción, reproducción, sanidad, pasturas, costos, el clima y suelo de su finca y el
              asistente con IA.
            </p>
          </div>
        </article>
        {profileDialog}
      </section>
    );
  }

  return (
    <>
      <HomeStory
        kicker={first ? `${greeting()}, ${first}` : greeting()}
        dateText={`${dateText.charAt(0).toUpperCase()}${dateText.slice(1)}${farmText}`}
        inv={inv}
        stats={stats}
        money={canSeeModule("economia", role) ? { count: monthMovs.length, balance } : null}
        alerts={alerts}
        onModule={onModule}
        weather={<FarmIntel tile />}
        onAsk={() => setAsking(true)}
      />
      {asking && <AssistantDialog initial={null} onClose={() => setAsking(false)} />}
      {profileDialog}
    </>
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
