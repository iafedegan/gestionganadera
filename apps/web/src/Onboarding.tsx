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
import { type FormEvent, useEffect, useState } from "react";
import { FarmDialog } from "./FarmForm";
import { localdb } from "./lib/localdb";
import { useApp } from "./state";

/* ───────────── Registro de cuenta ───────────── */

export function RegisterForm({ onBack }: { onBack(): void }) {
  const { register } = useApp();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accept, setAccept] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = [
    { ok: password.length >= 8, label: "Al menos 8 caracteres" },
    { ok: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password) && /\d/.test(password), label: "Letras y números" },
    { ok: password.length > 0 && password === confirm, label: "Las dos contraseñas coinciden" },
  ];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!checks.every((c) => c.ok)) {
      setError("Revise la contraseña: debe cumplir las tres condiciones.");
      return;
    }
    if (!accept) {
      setError("Debe aceptar el tratamiento de datos para crear la cuenta.");
      return;
    }
    setBusy(true);
    const res = await register({
      displayName,
      email,
      password,
      organizationName,
      acceptTerms: true,
    });
    if (!res.ok) setError(res.message);
    setBusy(false);
  }

  return (
    <form className="login-card" onSubmit={(e) => void submit(e)} aria-labelledby="reg-title">
      <header className="lc-head">
        <p className="kicker">Cree su cuenta gratis</p>
        <h1 id="reg-title">Registre su ganadería</h1>
        <p className="lc-sub">
          En dos minutos queda lista. Después le haremos unas preguntas para configurarla.
        </p>
      </header>

      <label className="field">
        <span className="field-label">Su nombre</span>
        <span className="field-box">
          <UserRound size={18} aria-hidden="true" />
          <input
            required
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Nombre y apellido"
          />
        </span>
      </label>
      <label className="field">
        <span className="field-label">Correo electrónico</span>
        <span className="field-box">
          <Mail size={18} aria-hidden="true" />
          <input
            required
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usted@correo.com"
          />
        </span>
      </label>
      <label className="field">
        <span className="field-label">Nombre de la ganadería o empresa</span>
        <span className="field-box">
          <Building2 size={18} aria-hidden="true" />
          <input
            required
            autoComplete="organization"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="Ej. Hacienda La Esperanza"
          />
        </span>
      </label>
      <label className="field">
        <span className="field-label">Contraseña</span>
        <span className="field-box">
          <Lock size={18} aria-hidden="true" />
          <input
            required
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8, con letras y números"
          />
          <button
            type="button"
            className="pw-toggle"
            aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
      <label className="field">
        <span className="field-label">Repita la contraseña</span>
        <span className="field-box">
          <Lock size={18} aria-hidden="true" />
          <input
            required
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </span>
      </label>
      <ul className="pw-checks" aria-live="polite">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : ""}>
            <Check size={14} aria-hidden="true" /> {c.label}
          </li>
        ))}
      </ul>
      <p className="lc-note">
        <Lock size={18} aria-hidden="true" />
        <span>
          Sus datos de la finca son suyos. La copia del celular se guarda cifrada con su contraseña:
          si la olvida sin conexión, no hay forma de recuperarla.
        </span>
      </p>
      <label className="check-row">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
        <span>
          Acepto el tratamiento de mis datos personales para operar el sistema (Ley 1581 de 2012).
        </span>
      </label>

      {error && (
        <p role="alert" className="login-alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block btn-xl" disabled={busy}>
        {busy ? (
          <>
            <RefreshCw size={18} className="spin" aria-hidden="true" /> Creando la cuenta…
          </>
        ) : (
          <>
            Crear cuenta <ArrowRight size={18} aria-hidden="true" className="arrow" />
          </>
        )}
      </button>
      <button type="button" className="lc-back as-link" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Ya tengo cuenta: ingresar
      </button>
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
