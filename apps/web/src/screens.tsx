import type { AnimalRegisterPayload, Species } from "@ganaderia/contracts";
import { ROLE_LABEL, can, diagnose, isDryOffDue, isWeaningDue } from "@ganaderia/domain";
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
  Circle,
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
  Stethoscope,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { AssistantCard } from "./Assistant";
import { FarmIntel } from "./FarmIntel";
import { type PendingInvite, RegisterForm } from "./Onboarding";
import { Pasture } from "./Pasture";
import { DiagnosisView, ProfileWizard, useFarmProfile } from "./Profile";
import { RegisterDialog, useFarms } from "./animals";
import { art } from "./art";
import { CardHead, CountUp, PageHead, Tile } from "./components";
import { MOV_SEED, type Mov } from "./herd";
import { moneyM, useStore } from "./kit";
import { CODE_LABEL, KIND_LABEL, fecha, fechaHora, num, todayLocal } from "./labels";
import { ApiError, api } from "./lib/api";
import { type HomeStats, homeStats } from "./lib/homeStats";
import { type OutboxItem, localdb } from "./lib/localdb";
import { lastEmail } from "./lib/session";
import { type ModuleDef, type ModuleKey, canSeeModule, moduleByKey, modulesFor } from "./modules";
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
  const { login } = useApp();
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
  return (
    <ul className={props.variant === "sheet" ? "nav-list nav-sheet" : "nav-list"}>
      {list.map((m, i) => (
        <li
          key={m.key}
          className={m.group && list[i - 1]?.group !== m.group ? "nav-first-erp" : undefined}
        >
          {m.group && list[i - 1]?.group !== m.group && (
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
        {BOTTOM.filter((k) => !props.locked || SETUP_MODULES.includes(k)).map((k) => (
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
  const { orgId, counts, dataVersion, lastSync, online, role, session, syncNow, syncing } =
    useApp();
  const farms = useFarms();
  const [weaning, setWeaning] = useState(0);
  const [dryOff, setDryOff] = useState(0);
  const [inv, setInv] = useState<{ total: number; bovino: number; bufalino: number } | null>(null);
  const [stock, setStock] = useState({ low: 0, soon: 0, expired: 0 });
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [movs] = useStore<Mov>("movs-eco", MOV_SEED);
  const farmProfile = useFarmProfile();
  const [profileOpen, setProfileOpen] = useState<"edit" | "view" | null>(null);
  const savedProfile = farmProfile.dto?.profile ?? null;
  const canProfile = Boolean(role && can(role, "farm.write"));
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
        setStats(homeStats(herd, events, today));
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

  const first = (session?.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const dateText = longDate.format(new Date());
  const farmText =
    farms.length === 1
      ? ` · ${farms[0]?.name}`
      : farms.length > 1
        ? ` · ${farms.length} fincas`
        : "";
  const canEvents = Boolean(role && can(role, "event.write"));
  const canAnimals = Boolean(role && can(role, "animal.write"));
  const month = todayLocal().slice(0, 7);
  const monthMovs = movs.filter((m) => m.fecha.startsWith(month));
  const balance = monthMovs.reduce((t, m) => t + (m.tipo === "Ingreso" ? m.valor : -m.valor), 0);
  const emptyHerd = inv !== null && inv.total === 0;
  const urgent = alerts.filter((a) => a.tone !== "info").length;

  const shortcuts: { key: ModuleKey; label: string; show: boolean; icon?: ReactNode }[] = [
    {
      key: "animales",
      label: canAnimals ? "Nuevo animal" : "Ver el hato",
      show: true,
      icon: canAnimals ? <PlusCircle size={22} aria-hidden="true" /> : undefined,
    },
    {
      key: "produccion",
      label: "Ordeño y peso",
      show: canEvents && canSeeModule("produccion", role),
    },
    {
      key: "reproduccion",
      label: "Reproducción",
      show: canEvents && canSeeModule("reproduccion", role),
    },
    { key: "sanidad", label: "Sanidad", show: canEvents && canSeeModule("sanidad", role) },
  ];

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
            {setup.steps.map((st) => {
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
            })}
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
    <section className="page page-home">
      <PageHead
        kicker={first ? `${greeting()}, ${first}` : greeting()}
        title={
          emptyHerd
            ? "Empecemos con su finca"
            : urgent > 0
              ? `Hoy hay ${urgent} ${urgent === 1 ? "asunto" : "asuntos"} por atender`
              : "¿Qué requiere atención hoy?"
        }
        lead={`${dateText.charAt(0).toUpperCase()}${dateText.slice(1)}${farmText}`}
      />

      <nav className="shortcuts" aria-label="Accesos rápidos">
        {shortcuts
          .filter((x) => x.show)
          .map((x, i) => (
            <button
              key={x.key}
              type="button"
              className={i === 0 ? "shortcut sc-main" : "shortcut"}
              onClick={() => onModule(x.key)}
            >
              <span className="sc-icon">{x.icon ?? <ModIcon k={x.key} size={22} />}</span>
              <span>{x.label}</span>
            </button>
          ))}
        <button
          type="button"
          className={counts.pendiente > 0 ? "shortcut sc-sync" : "shortcut sc-sync sc-idle"}
          onClick={() => void syncNow()}
          disabled={syncing}
          aria-label={
            counts.pendiente > 0 ? `Sincronizar (${counts.pendiente} pendientes)` : "Sincronizar"
          }
        >
          <span className="sc-icon">
            <RefreshCw size={22} aria-hidden="true" className={syncing ? "spin" : ""} />
            {counts.pendiente > 0 && <b className="sc-badge">{counts.pendiente}</b>}
          </span>
          <span>{syncing ? "Enviando…" : "Sincronizar"}</span>
        </button>
      </nav>

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
          label="Leche de la semana"
          icon={<ModIcon k="produccion" />}
          value={stats && stats.milk7 > 0 ? `${num(Math.round(stats.milk7))} L` : "0 L"}
          meta={
            stats && stats.milk7 > 0
              ? `≈ ${num(Math.round(stats.milk7 / 7))} L por día`
              : "Aún sin ordeños esta semana"
          }
          trend={
            stats?.milkTrend != null
              ? {
                  text: `${stats.milkTrend > 0 ? "+" : ""}${stats.milkTrend} % vs. semana anterior`,
                  dir: stats.milkTrend > 2 ? "up" : stats.milkTrend < -2 ? "down" : "flat",
                }
              : null
          }
          points={stats?.milkDaily}
          cta={
            stats && stats.milk7 === 0 && canEvents
              ? { label: "Registrar ordeño", onClick: () => onModule("produccion") }
              : null
          }
          onGo={() => onModule("produccion")}
        />
        <Tile
          tone="ambar"
          art={art("tile-calf")}
          label="Estado reproductivo"
          icon={<ModIcon k="reproduccion" />}
          value={stats?.hasRepro ? <CountUp value={stats.pregnant} /> : "0"}
          meta={
            stats?.hasRepro
              ? `preñadas de ${num(stats.females)} hembras`
              : "Sin servicios registrados"
          }
          trend={
            stats && stats.toPalpate > 0
              ? { text: `${stats.toPalpate} por palpar`, dir: "flat" }
              : null
          }
          cta={
            stats && !stats.hasRepro && canEvents
              ? { label: "Registrar servicio", onClick: () => onModule("reproduccion") }
              : null
          }
          onGo={() => onModule("reproduccion")}
        />
        {canSeeModule("economia", role) && (
          <Tile
            tone="violeta"
            art={art("tile-coins")}
            label="Saldo del mes"
            icon={<ModIcon k="economia" />}
            value={monthMovs.length ? moneyM(balance) : "$ 0"}
            meta={
              monthMovs.length
                ? `${monthMovs.length} movimiento(s) este mes`
                : "Sin ingresos ni gastos este mes"
            }
            cta={
              monthMovs.length === 0
                ? { label: "Registrar gasto o ingreso", onClick: () => onModule("economia") }
                : null
            }
            onGo={() => onModule("economia")}
          />
        )}
      </div>

      {savedProfile ? (
        <article className="card dx-card">
          <CardHead
            icon={<Stethoscope size={26} aria-hidden="true" />}
            title="Diagnóstico de su finca"
            sub="Según el perfil que respondió. Lo que más pide atención va primero."
          />
          <DiagnosisView d={diagnose(savedProfile)} compact />
          <div className="dx-buttons">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setProfileOpen("view")}
            >
              Ver completo ›
            </button>
            {canProfile && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setProfileOpen("edit")}
              >
                Actualizar respuestas
              </button>
            )}
          </div>
        </article>
      ) : (
        canProfile &&
        farmProfile.known && (
          <article className="card dx-card">
            <CardHead
              icon={<Stethoscope size={26} aria-hidden="true" />}
              title="Haga el diagnóstico de su finca"
              sub="Unas preguntas de 2 a 5 minutos para saber por dónde empezar."
            />
            <div className="dx-buttons">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setProfileOpen("edit")}
              >
                Responder ahora ›
              </button>
            </div>
          </article>
        )
      )}
      {profileDialog}

      <AssistantCard />

      <FarmIntel />

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
