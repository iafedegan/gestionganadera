import type { Goal, HerdEstimate, JobRole, OrgKind } from "@ganaderia/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  PawPrint,
  RefreshCw,
  Sprout,
  UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { FarmDialog } from "./FarmForm";
import { localdb } from "./lib/localdb";
import { useApp } from "./state";

/* ───────────── Registro de cuenta ───────────── */

const REG_STEPS = 3;

/** Fuerza de la contraseña: 0 a 4. Solo orienta; la regla real la valida el servidor. */
function strength(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(p) && /\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s++;
  return s;
}
const STRENGTH = ["Muy débil", "Débil", "Aceptable", "Buena", "Excelente"];

/**
 * Registro en tres pantallas cortas, pensado para el celular: una pregunta a la vez,
 * el teclado adecuado en cada campo y el botón siempre visible encima del teclado.
 */
export function RegisterForm({ onBack }: { onBack(): void }) {
  const { register } = useApp();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const org = useRef<HTMLInputElement>(null);

  // Cada pantalla abre con el cursor en su primer campo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se enfoca al cambiar de paso
  useEffect(() => {
    setError(null);
    const t = setTimeout(() => first.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(t);
  }, [step]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const pwRules = [
    { ok: password.length >= 8, label: "8 caracteres o más" },
    { ok: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) && /\d/.test(password), label: "Letras y números" },
  ];
  const pwOk = pwRules.every((r) => r.ok);
  const ready = [
    displayName.trim().length >= 2 && organizationName.trim().length >= 2,
    emailOk,
    pwOk && accept,
  ][step];
  // Mientras escribe, el medidor siempre muestra al menos una barra (en rojo).
  const level = password ? Math.max(1, strength(password)) : 0;

  async function next(e?: FormEvent) {
    e?.preventDefault();
    if (step === 0 && !ready) {
      setError(
        displayName.trim().length < 2 ? "Escriba su nombre." : "Escriba el nombre de la ganadería.",
      );
      return;
    }
    if (step === 1 && !emailOk) {
      setError("Revise el correo: debe quedar como usted@correo.com");
      return;
    }
    if (step < REG_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }
    if (!pwOk) {
      setError("La contraseña necesita 8 caracteres o más, con letras y números.");
      return;
    }
    if (!accept) {
      setError("Debe aceptar el tratamiento de datos para crear la cuenta.");
      return;
    }
    setBusy(true);
    const res = await register({
      displayName: displayName.trim(),
      email: email.trim(),
      password,
      organizationName: organizationName.trim(),
      acceptTerms: true,
    });
    if (!res.ok) {
      setError(res.message);
      // Si el correo ya existe, se vuelve a la pantalla del correo.
      if (/correo/i.test(res.message)) setStep(1);
    }
    setBusy(false);
  }

  const back = () => (step === 0 ? onBack() : setStep((s) => s - 1));

  return (
    <form
      className="login-card reg-flow"
      onSubmit={(e) => void next(e)}
      aria-labelledby="reg-title"
      noValidate
    >
      <div className="reg-top">
        <button
          type="button"
          className="reg-back"
          onClick={back}
          aria-label={step === 0 ? "Volver al ingreso" : "Paso anterior"}
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
        <div className="reg-progress" aria-hidden="true">
          {Array.from({ length: REG_STEPS }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segmentos fijos de la barra
            <span key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <span className="reg-count" aria-label={`Paso ${step + 1} de ${REG_STEPS}`}>
          {step + 1}/{REG_STEPS}
        </span>
      </div>

      <div className="reg-body" key={step}>
        {step === 0 && (
          <>
            <p className="kicker">Cree su cuenta gratis</p>
            <h1 id="reg-title">¿Cómo se llama?</h1>
            <p className="lc-sub">Y díganos el nombre de su ganadería o empresa.</p>
            <label className="field">
              <span className="field-label">Su nombre</span>
              <span className="field-box">
                <UserRound size={20} aria-hidden="true" />
                <input
                  ref={first}
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    // «Siguiente» en el teclado pasa al campo de la ganadería.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      org.current?.focus();
                    }
                  }}
                  placeholder="Nombre y apellido"
                />
              </span>
            </label>
            <label className="field">
              <span className="field-label">Ganadería o empresa</span>
              <span className="field-box">
                <Building2 size={20} aria-hidden="true" />
                <input
                  ref={org}
                  autoComplete="organization"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Ej. Hacienda La Esperanza"
                />
              </span>
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <p className="kicker">Hola, {displayName.trim().split(" ")[0]}</p>
            <h1 id="reg-title">¿Cuál es su correo?</h1>
            <p className="lc-sub">
              Con él ingresará a la app desde cualquier celular o computador.
            </p>
            <label className="field">
              <span className="field-label">Correo electrónico</span>
              <span className="field-box">
                <Mail size={20} aria-hidden="true" />
                <input
                  ref={first}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usted@correo.com"
                  aria-invalid={error ? true : undefined}
                />
              </span>
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <p className="kicker">Último paso</p>
            <h1 id="reg-title">Cree su contraseña</h1>
            <p className="lc-sub">También protege la copia cifrada de sus datos en este celular.</p>
            <label className="field">
              <span className="field-label">Contraseña</span>
              <span className="field-box">
                <Lock size={20} aria-hidden="true" />
                <input
                  ref={first}
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 o más, con letras y números"
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
            <div className={`pw-meter l${level}`} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <ul className="pw-checks" aria-live="polite">
              {pwRules.map((c) => (
                <li key={c.label} className={c.ok ? "ok" : ""}>
                  <Check size={14} aria-hidden="true" /> {c.label}
                </li>
              ))}
              {password && <li className="pw-level">{STRENGTH[level]}</li>}
            </ul>
            <button
              type="button"
              className={accept ? "consent on" : "consent"}
              aria-pressed={accept}
              onClick={() => setAccept((v) => !v)}
            >
              <span className="consent-box">
                {accept && <Check size={16} aria-hidden="true" />}
              </span>
              <span>
                Acepto el tratamiento de mis datos personales para operar el sistema (Ley 1581 de
                2012).
              </span>
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="login-alert">
            {error}
          </p>
        )}
      </div>

      <div className="reg-cta">
        <button
          type="submit"
          className="btn btn-primary btn-block btn-xl"
          disabled={busy || !ready}
        >
          {busy ? (
            <>
              <RefreshCw size={18} className="spin" aria-hidden="true" /> Creando la cuenta…
            </>
          ) : step < REG_STEPS - 1 ? (
            <>
              Siguiente <ArrowRight size={18} aria-hidden="true" className="arrow" />
            </>
          ) : (
            <>
              Crear mi cuenta <ArrowRight size={18} aria-hidden="true" className="arrow" />
            </>
          )}
        </button>
        {step === 0 && (
          <button type="button" className="lc-back as-link" onClick={onBack}>
            Ya tengo cuenta: ingresar
          </button>
        )}
      </div>
    </form>
  );
}

/* ───────────── Asistente inicial ───────────── */

const JOB_ROLES: [JobRole, string][] = [
  ["propietario", "Propietario"],
  ["administrador", "Administrador"],
  ["mayordomo", "Mayordomo"],
  ["veterinario", "Médico veterinario"],
  ["zootecnista", "Zootecnista"],
  ["asesor", "Asesor técnico"],
  ["otro", "Otro"],
];
const ORG_KINDS: [OrgKind, string][] = [
  ["persona_natural", "Persona natural"],
  ["empresa", "Empresa"],
  ["asociacion", "Asociación"],
  ["cooperativa", "Cooperativa"],
];
const GOALS: [Goal, string][] = [
  ["reproduccion", "Mejorar la reproducción"],
  ["leche", "Producir más leche"],
  ["peso", "Ganar más peso"],
  ["sanidad", "Controlar la sanidad"],
  ["costos", "Conocer mis costos"],
  ["trazabilidad", "Trazabilidad e ICA"],
  ["pasturas", "Manejar las pasturas"],
  ["personal", "Organizar el personal"],
];
const DEPARTMENTS = [
  "Amazonas",
  "Antioquia",
  "Arauca",
  "Atlántico",
  "Bogotá D. C.",
  "Bolívar",
  "Boyacá",
  "Caldas",
  "Caquetá",
  "Casanare",
  "Cauca",
  "Cesar",
  "Chocó",
  "Córdoba",
  "Cundinamarca",
  "Guainía",
  "Guaviare",
  "Huila",
  "La Guajira",
  "Magdalena",
  "Meta",
  "Nariño",
  "Norte de Santander",
  "Putumayo",
  "Quindío",
  "Risaralda",
  "San Andrés y Providencia",
  "Santander",
  "Sucre",
  "Tolima",
  "Valle del Cauca",
  "Vaupés",
  "Vichada",
];
const HERD_FIELDS: ["vacas" | "novillas" | "crias" | "machos", string][] = [
  ["vacas", "Hembras adultas"],
  ["novillas", "Novillas"],
  ["crias", "Crías"],
  ["machos", "Machos y reproductores"],
];
const STEPS = [
  { icon: UserRound, label: "Usted" },
  { icon: Building2, label: "Empresa" },
  { icon: Sprout, label: "Finca" },
  { icon: PawPrint, label: "Hato" },
];

type Counts = Partial<Record<"vacas" | "novillas" | "crias" | "machos", number>>;

export function OnboardingWizard() {
  const { session, orgId, completeOnboarding, logout, dataVersion, syncNow } = useApp();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(session?.displayName ?? "");
  const [phone, setPhone] = useState("");
  const [jobRole, setJobRole] = useState<JobRole>("propietario");
  const [experience, setExperience] = useState("");
  const [orgKind, setOrgKind] = useState<OrgKind>("persona_natural");
  const [taxId, setTaxId] = useState("");
  const [department, setDepartment] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [farmOpen, setFarmOpen] = useState(false);
  const [farms, setFarms] = useState<{ id: string; name: string; species: string }[]>([]);
  const [species, setSpecies] = useState<{ bovino: boolean; bufalino: boolean }>({
    bovino: true,
    bufalino: false,
  });
  const [herd, setHerd] = useState<{ bovino: Counts; bufalino: Counts }>({
    bovino: {},
    bufalino: {},
  });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Las fincas registradas en el paso 3 llegan por la sincronización.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se relee al cambiar los datos locales
  useEffect(() => {
    if (!orgId) return;
    void localdb.listFarms(orgId).then((f) => {
      setFarms(f);
      const one = f[0];
      if (one)
        setSpecies({
          bovino: one.species.includes("bovino"),
          bufalino: one.species.includes("bufalino"),
        });
    });
  }, [orgId, dataVersion, farmOpen]);

  const total = (["bovino", "bufalino"] as const).reduce(
    (s, sp) => s + (species[sp] ? Object.values(herd[sp]).reduce((a, b) => a + (b ?? 0), 0) : 0),
    0,
  );
  const canNext = step !== 0 || displayName.trim().length >= 2;

  async function finish() {
    setBusy(true);
    setError(null);
    const herdEstimate: HerdEstimate = {};
    if (species.bovino) herdEstimate.bovino = herd.bovino;
    if (species.bufalino) herdEstimate.bufalino = herd.bufalino;
    const res = await completeOnboarding({
      organizationId: orgId,
      displayName: displayName.trim(),
      jobRole,
      orgKind,
      goals,
      herdEstimate,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(experience ? { experienceYears: Number(experience) } : {}),
      ...(taxId.trim() ? { taxId: taxId.trim() } : {}),
      ...(department ? { department } : {}),
      ...(municipality.trim() ? { municipality: municipality.trim() } : {}),
    });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  const chip = <T extends string>(
    value: T,
    current: T | T[],
    label: string,
    onPick: (v: T) => void,
  ) => {
    const on = Array.isArray(current) ? current.includes(value) : current === value;
    return (
      <button
        key={value}
        type="button"
        className={on ? "ob-chip on" : "ob-chip"}
        aria-pressed={on}
        onClick={() => onPick(value)}
      >
        {on && <Check size={14} aria-hidden="true" />} {label}
      </button>
    );
  };

  return (
    <main className="onboarding">
      <div className="ob-card">
        <header className="ob-head">
          <p className="kicker">Bienvenido, {session?.displayName?.split(" ")[0]}</p>
          <h1>Configuremos su ganadería</h1>
          <p className="lc-sub">Cuatro pasos cortos. Todo se puede cambiar después.</p>
          <ol className="ob-steps">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.label} className={i === step ? "on" : i < step ? "done" : ""}>
                  <span className="ob-dot">
                    {i < step ? <Check size={16} /> : <Icon size={16} />}
                  </span>
                  <small>{s.label}</small>
                </li>
              );
            })}
          </ol>
        </header>

        <div className="ob-body">
          {step === 0 && (
            <section className="fsec">
              <h2 className="ob-q">¿Quién es usted?</h2>
              <div className="kf-grid">
                <label htmlFor="ob-name">
                  Nombre completo
                  <input
                    id="ob-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label htmlFor="ob-phone">
                  Celular (opcional)
                  <input
                    id="ob-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="300 000 0000"
                    autoComplete="tel"
                  />
                </label>
              </div>
              <p className="ob-label">¿Cuál es su papel en la ganadería?</p>
              <div className="ob-chips">
                {JOB_ROLES.map(([v, l]) => chip(v, jobRole, l, setJobRole))}
              </div>
              <div className="kf-grid">
                <label htmlFor="ob-exp">
                  Años de experiencia con ganado (opcional)
                  <input
                    id="ob-exp"
                    type="number"
                    min={0}
                    max={80}
                    inputMode="numeric"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                  />
                </label>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="fsec">
              <h2 className="ob-q">¿A nombre de quién está la ganadería?</h2>
              <div className="ob-chips">
                {ORG_KINDS.map(([v, l]) => chip(v, orgKind, l, setOrgKind))}
              </div>
              <div className="kf-grid">
                <label htmlFor="ob-tax">
                  {orgKind === "persona_natural" ? "Cédula (opcional)" : "NIT (opcional)"}
                  <input
                    id="ob-tax"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label htmlFor="ob-dep">
                  Departamento
                  <select
                    id="ob-dep"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="">Seleccione…</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label htmlFor="ob-mun">
                  Municipio
                  <input
                    id="ob-mun"
                    value={municipality}
                    onChange={(e) => setMunicipality(e.target.value)}
                    placeholder="Ej. Montería"
                  />
                </label>
              </div>
              <p className="hint">
                Sirve para las facturas, el calendario sanitario del ICA y los reportes de su
                región.
              </p>
            </section>
          )}

          {step === 2 && (
            <section className="fsec">
              <h2 className="ob-q">Registre su finca</h2>
              <p className="hint">
                Nombre, especies, áreas, ubicación en el mapa y manejo de destete y secado. Si tiene
                varias, agregue la principal ahora y las demás después.
              </p>
              {farms.length > 0 && (
                <ul className="ob-farms">
                  {farms.map((f) => (
                    <li key={f.id}>
                      <Check size={16} aria-hidden="true" /> <b>{f.name}</b>
                      <small>
                        {f.species
                          .split(",")
                          .map((x) => (x === "bovino" ? "Bovinos" : "Búfalos"))
                          .join(" y ")}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={farms.length ? "btn btn-ghost" : "btn btn-primary"}
                onClick={() => setFarmOpen(true)}
              >
                <Sprout size={18} aria-hidden="true" />{" "}
                {farms.length ? "Agregar otra finca" : "Registrar mi finca"}
              </button>
            </section>
          )}

          {step === 3 && (
            <section className="fsec">
              <h2 className="ob-q">¿Cómo es su hato hoy?</h2>
              <p className="hint">
                Un estimado basta: luego registrará cada animal. Elija las especies que maneja.
              </p>
              <div className="ob-chips">
                {chip("bovino", species.bovino ? "bovino" : "", "Bovinos", () =>
                  setSpecies((s) => ({ ...s, bovino: !s.bovino })),
                )}
                {chip("bufalino", species.bufalino ? "bufalino" : "", "Búfalos", () =>
                  setSpecies((s) => ({ ...s, bufalino: !s.bufalino })),
                )}
              </div>
              {(["bovino", "bufalino"] as const)
                .filter((sp) => species[sp])
                .map((sp) => (
                  <div key={sp} className="ob-herd">
                    <p className="ob-label">{sp === "bovino" ? "Bovinos" : "Búfalos"}</p>
                    <div className="ob-herd-grid">
                      {HERD_FIELDS.map(([k, l]) => (
                        <label key={k} htmlFor={`ob-${sp}-${k}`}>
                          {l}
                          <input
                            id={`ob-${sp}-${k}`}
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={herd[sp][k] ?? ""}
                            onChange={(e) =>
                              setHerd((h) => ({
                                ...h,
                                [sp]: {
                                  ...h[sp],
                                  [k]:
                                    e.target.value === ""
                                      ? undefined
                                      : Math.max(0, Math.floor(Number(e.target.value))),
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              {total > 0 && (
                <p className="ob-total">
                  Total estimado: <b>{total.toLocaleString("es-CO")}</b> animales
                </p>
              )}
              <p className="ob-label">¿Qué quiere lograr primero? (elija las que quiera)</p>
              <div className="ob-chips">
                {GOALS.map(([v, l]) =>
                  chip(v, goals, l, (g) =>
                    setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g])),
                  ),
                )}
              </div>
            </section>
          )}

          {error && (
            <p role="alert" className="login-alert">
              {error}
            </p>
          )}
        </div>

        <footer className="ob-foot">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft size={18} aria-hidden="true" /> Atrás
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
              Salir
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              {step === 2 && farms.length === 0 ? "Lo haré después" : "Siguiente"}{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? (
                <RefreshCw size={18} className="spin" aria-hidden="true" />
              ) : (
                <Check size={18} aria-hidden="true" />
              )}{" "}
              Empezar a usar la app
            </button>
          )}
        </footer>
      </div>
      {farmOpen && (
        <FarmDialog
          onClose={() => {
            setFarmOpen(false);
            void syncNow();
          }}
        />
      )}
    </main>
  );
}
