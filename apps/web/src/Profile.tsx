import {
  FarmProfile,
  type FarmProfileDto,
  type FarmProfileInput,
  type Goal,
} from "@ganaderia/contracts";
import { type DiagLevel, type Diagnosis, diagnose, suggestedLevel } from "@ganaderia/domain";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Gauge,
  Ruler,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { GOALS } from "./Onboarding";
import { ApiError, api } from "./lib/api";
import { localdb } from "./lib/localdb";
import type { ModuleKey } from "./modules";
import { useApp } from "./state";

/* ───────────── Datos: perfil guardado (servidor + copia en el dispositivo) ───────────── */

const cacheKey = (org: string) => `gg.perfil.${org}`;
const EVENT = "gg-perfil";

function readCache(org: string): FarmProfileDto | null {
  try {
    const raw = localStorage.getItem(cacheKey(org));
    return raw ? (JSON.parse(raw) as FarmProfileDto) : null;
  } catch {
    return null;
  }
}
function writeCache(org: string, dto: FarmProfileDto) {
  try {
    localStorage.setItem(cacheKey(org), JSON.stringify(dto));
  } catch {
    /* sin almacenamiento */
  }
}

export interface ProfileState {
  dto: FarmProfileDto | null;
  /** false: sin conexión y sin copia local, no se sabe si ya respondió. */
  known: boolean;
  loading: boolean;
}

export function useFarmProfile(): ProfileState {
  const { orgId, online } = useApp();
  const [state, setState] = useState<ProfileState>(() => {
    const c = orgId ? readCache(orgId) : null;
    return { dto: c, known: Boolean(c?.profile), loading: !c?.profile };
  });

  const load = useCallback(() => {
    if (!orgId) return;
    const cached = readCache(orgId);
    if (!online) {
      setState({ dto: cached, known: Boolean(cached), loading: false });
      return;
    }
    api
      .profile(orgId)
      .then((dto) => {
        writeCache(orgId, dto);
        setState({ dto, known: true, loading: false });
      })
      .catch(() => setState({ dto: cached, known: Boolean(cached), loading: false }));
  }, [orgId, online]);

  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);

  return state;
}

/* ───────────── Cuestionario ───────────── */

type Draft = {
  level: FarmProfile["level"] | null;
  goals: Goal[];
  focus: FarmProfile["focus"] | null;
  heads: string;
  cows: string;
  milking: string;
  milkLitersDay: string;
  areaHa: string;
  system: FarmProfile["system"] | null;
  records: FarmProfile["records"] | null;
  breeding: FarmProfile["breeding"] | null;
  pregCheck: FarmProfile["pregCheck"] | null;
  vet: FarmProfile["vet"] | null;
  knowsCost: FarmProfile["knowsCost"] | null;
  workers: string;
  calvingIntervalMonths: string;
  supplements: NonNullable<FarmProfile["supplements"]>;
  paddocks: string;
  restDays: string;
  saleWeightKg: string;
  saleAgeMonths: string;
  qualityPay: "si" | "no" | null;
  certifications: NonNullable<FarmProfile["certifications"]>;
  mainProblem: string;
};

const str = (n: number | undefined) => (n === undefined ? "" : String(n));
const fromProfile = (p: FarmProfile | null): Draft => ({
  level: p?.level ?? null,
  goals: p?.goals ?? [],
  focus: p?.focus ?? null,
  heads: str(p?.heads),
  cows: str(p?.cows),
  milking: str(p?.milking),
  milkLitersDay: str(p?.milkLitersDay),
  areaHa: str(p?.areaHa),
  system: p?.system ?? null,
  records: p?.records ?? null,
  breeding: p?.breeding ?? null,
  pregCheck: p?.pregCheck ?? null,
  vet: p?.vet ?? null,
  knowsCost: p?.knowsCost ?? null,
  workers: str(p?.workers),
  calvingIntervalMonths: str(p?.calvingIntervalMonths),
  supplements: p?.supplements ?? [],
  paddocks: str(p?.paddocks),
  restDays: str(p?.restDays),
  saleWeightKg: str(p?.saleWeightKg),
  saleAgeMonths: str(p?.saleAgeMonths),
  qualityPay: p?.qualityPay ?? null,
  certifications: p?.certifications ?? [],
  mainProblem: p?.mainProblem ?? "",
});

const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));

function toInput(d: Draft): FarmProfileInput {
  const out: Record<string, unknown> = {
    level: d.level,
    goals: d.goals,
    focus: d.focus,
    heads: num(d.heads),
    cows: num(d.cows) ?? 0,
    areaHa: num(d.areaHa),
    system: d.system,
    records: d.records,
    breeding: d.breeding,
    pregCheck: d.pregCheck,
    vet: d.vet,
    knowsCost: d.knowsCost,
  };
  if (d.focus !== "carne") {
    out.milking = num(d.milking);
    out.milkLitersDay = num(d.milkLitersDay);
  }
  if (d.level === "completo") {
    out.workers = num(d.workers);
    out.calvingIntervalMonths = num(d.calvingIntervalMonths);
    out.supplements = d.supplements.length ? d.supplements : undefined;
    out.paddocks = num(d.paddocks);
    out.restDays = num(d.restDays);
    if (d.focus !== "leche") {
      out.saleWeightKg = num(d.saleWeightKg);
      out.saleAgeMonths = num(d.saleAgeMonths);
    }
    if (d.focus !== "carne" && d.qualityPay) out.qualityPay = d.qualityPay;
    out.certifications = d.certifications.length ? d.certifications : undefined;
    out.mainProblem = d.mainProblem.trim() || undefined;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as FarmProfileInput;
}

const FOCUS: [FarmProfile["focus"], string][] = [
  ["leche", "Leche"],
  ["carne", "Carne (cría, levante o ceba)"],
  ["doble_proposito", "Doble propósito"],
];
const SYSTEMS: [FarmProfile["system"], string][] = [
  ["extensivo", "Pastoreo extensivo"],
  ["rotacional", "Pastoreo rotacional"],
  ["semiestabulado", "Semiestabulado"],
  ["estabulado", "Estabulado"],
];
const RECORDS: [FarmProfile["records"], string][] = [
  ["ninguno", "No llevo registros"],
  ["cuaderno", "En un cuaderno"],
  ["excel", "En Excel"],
  ["software", "En otro programa"],
];
const BREEDING: [FarmProfile["breeding"], string][] = [
  ["monta", "Monta natural"],
  ["ia", "Inseminación"],
  ["mixta", "Ambas"],
];
const PREG: [FarmProfile["pregCheck"], string][] = [
  ["nunca", "Nunca"],
  ["a_veces", "A veces"],
  ["regular", "Con regularidad"],
];
const VET: [FarmProfile["vet"], string][] = [
  ["no", "No tengo"],
  ["problemas", "Solo cuando hay problemas"],
  ["periodico", "Visitas periódicas"],
];
const KNOWS: [FarmProfile["knowsCost"], string][] = [
  ["si", "Sí, lo sé"],
  ["aprox", "Más o menos"],
  ["no", "No lo sé"],
];
const SUPPS: [NonNullable<FarmProfile["supplements"]>[number], string][] = [
  ["sal_mineral", "Sal mineral"],
  ["concentrado", "Concentrado"],
  ["ensilaje", "Ensilaje o heno"],
  ["ninguno", "Solo pasto"],
];
const CERTS: [NonNullable<FarmProfile["certifications"]>[number], string][] = [
  ["bpg", "Buenas Prácticas Ganaderas (BPG)"],
  ["libre_brucelosis", "Hato libre de brucelosis"],
  ["libre_tuberculosis", "Hato libre de tuberculosis"],
];

function Chips<T extends string>(props: {
  options: [T, string][];
  value: T | null | T[];
  onPick(v: T): void;
}) {
  return (
    <div className="ob-chips">
      {props.options.map(([v, l]) => {
        const on = Array.isArray(props.value) ? props.value.includes(v) : props.value === v;
        return (
          <button
            key={v}
            type="button"
            className={on ? "ob-chip on" : "ob-chip"}
            aria-pressed={on}
            onClick={() => props.onPick(v)}
          >
            {on && <Check size={14} aria-hidden="true" />} {l}
          </button>
        );
      })}
    </div>
  );
}

function Num(props: {
  id: string;
  label: string;
  value: string;
  onChange(v: string): void;
  hint?: string;
  unit?: string;
}) {
  return (
    <label htmlFor={props.id} className="pf-num">
      <span>{props.label}</span>
      <span className="pf-num-row">
        <input
          id={props.id}
          type="number"
          inputMode="decimal"
          min={0}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
        {props.unit && <em>{props.unit}</em>}
      </span>
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

const toggle = <T,>(list: T[], v: T, max = 99) =>
  list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list;

export function ProfileWizard(props: {
  initial: FarmProfile | null;
  /** Abrir directo en el diagnóstico de las respuestas guardadas. */
  showResult?: boolean;
  onClose(): void;
  onModule?(m: ModuleKey): void;
}) {
  const { orgId } = useApp();
  const [d, setD] = useState<Draft>(() => fromProfile(props.initial));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(() =>
    props.showResult && props.initial ? diagnose(props.initial) : null,
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  // Primera vez: el área y el total de animales salen de lo ya registrado.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al abrir
  useEffect(() => {
    if (props.initial || !orgId) return;
    void Promise.all([localdb.listFarms(orgId), localdb.counts(orgId)]).then(([farms, inv]) => {
      const area = farms.reduce((s, f) => s + (f.livestockAreaHa ?? 0), 0);
      setD((x) => ({
        ...x,
        areaHa: x.areaHa || (area > 0 ? String(Math.round(area * 10) / 10) : ""),
        heads: x.heads || (inv.total > 0 ? String(inv.total) : ""),
      }));
    });
  }, []);

  const heads = num(d.heads) ?? 0;
  const milk = d.focus !== "carne";
  const steps = [
    { label: "Objetivo", icon: Target },
    { label: "Tamaño", icon: Ruler },
    { label: "Manejo", icon: ClipboardList },
    ...(d.level === "completo" ? [{ label: "Detalle", icon: Gauge }] : []),
  ];
  const last = steps.length - 1;

  const okBasic = [
    d.goals.length > 0 && d.focus !== null,
    heads > 0 &&
      (num(d.areaHa) ?? 0) > 0 &&
      d.cows.trim() !== "" &&
      d.system !== null &&
      d.level !== null &&
      (!milk || (d.milking.trim() !== "" && d.milkLitersDay.trim() !== "")),
    d.records && d.breeding && d.pregCheck && d.vet && d.knowsCost,
    true,
  ];
  const canNext = Boolean(okBasic[step]);

  async function finish() {
    const parsed = FarmProfile.safeParse(toInput(d));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise las respuestas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dto = await api.saveProfile(orgId, parsed.data);
      writeCache(orgId, dto);
      window.dispatchEvent(new Event(EVENT));
      setResult(diagnose(parsed.data));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo guardar. Necesita conexión a internet para enviar el perfil.",
      );
    }
    setBusy(false);
  }

  let body: ReactNode = null;
  if (result) {
    body = (
      <section className="fsec">
        <DiagnosisView d={result} onModule={props.onModule ? go : undefined} />
      </section>
    );
  } else if (step === 0) {
    body = (
      <section className="fsec">
        <h2 className="ob-q">¿Qué busca con esta aplicación?</h2>
        <p className="ob-label">Elija hasta 3 objetivos</p>
        <Chips
          options={GOALS}
          value={d.goals}
          onPick={(g) => set("goals", toggle(d.goals, g, 3))}
        />
        <p className="ob-label">¿Qué produce la finca?</p>
        <Chips options={FOCUS} value={d.focus} onPick={(v) => set("focus", v)} />
      </section>
    );
  } else if (step === 1) {
    const sug = heads > 0 ? suggestedLevel(heads) : null;
    body = (
      <section className="fsec">
        <h2 className="ob-q">¿Qué tan grande es la finca?</h2>
        <div className="pf-grid">
          <Num
            id="pf-heads"
            label="Animales en total"
            value={d.heads}
            onChange={(v) => set("heads", v)}
          />
          <Num
            id="pf-cows"
            label="Vacas (hembras adultas)"
            value={d.cows}
            onChange={(v) => set("cows", v)}
          />
          {milk && (
            <>
              <Num
                id="pf-milking"
                label="Vacas en ordeño hoy"
                value={d.milking}
                onChange={(v) => set("milking", v)}
              />
              <Num
                id="pf-liters"
                label="Leche de la finca al día"
                unit="L"
                value={d.milkLitersDay}
                onChange={(v) => set("milkLitersDay", v)}
              />
            </>
          )}
          <Num
            id="pf-area"
            label="Área en ganadería"
            unit="ha"
            value={d.areaHa}
            onChange={(v) => set("areaHa", v)}
            hint="Solo la parte con pastos para el ganado."
          />
        </div>
        <p className="ob-label">¿Cómo maneja el ganado?</p>
        <Chips options={SYSTEMS} value={d.system} onPick={(v) => set("system", v)} />
        <p className="ob-label">¿Qué tan completo quiere el diagnóstico?</p>
        <div className="pf-levels">
          {(
            [
              ["rapido", "Rápido", "2 minutos · solo lo básico"],
              ["completo", "Completo", "5 minutos · más preciso"],
            ] as const
          ).map(([v, t, s]) => (
            <button
              key={v}
              type="button"
              className={d.level === v ? "pf-level on" : "pf-level"}
              aria-pressed={d.level === v}
              onClick={() => set("level", v)}
            >
              <strong>
                {d.level === v && <Check size={16} aria-hidden="true" />} {t}
              </strong>
              <small>{s}</small>
              {sug === v && <span className="pf-sug">Recomendado para su finca</span>}
            </button>
          ))}
        </div>
      </section>
    );
  } else if (step === 2) {
    body = (
      <section className="fsec">
        <h2 className="ob-q">¿Cómo maneja hoy la finca?</h2>
        <p className="ob-label">¿Dónde lleva los registros?</p>
        <Chips options={RECORDS} value={d.records} onPick={(v) => set("records", v)} />
        <p className="ob-label">¿Cómo se preñan las vacas?</p>
        <Chips options={BREEDING} value={d.breeding} onPick={(v) => set("breeding", v)} />
        <p className="ob-label">¿Palpa o hace ecografía para saber si están preñadas?</p>
        <Chips options={PREG} value={d.pregCheck} onPick={(v) => set("pregCheck", v)} />
        <p className="ob-label">¿Tiene veterinario?</p>
        <Chips options={VET} value={d.vet} onPick={(v) => set("vet", v)} />
        <p className="ob-label">
          ¿Sabe cuánto le cuesta producir un{" "}
          {d.focus === "carne" ? "kilo de carne" : "litro de leche"}?
        </p>
        <Chips options={KNOWS} value={d.knowsCost} onPick={(v) => set("knowsCost", v)} />
      </section>
    );
  } else {
    body = (
      <section className="fsec">
        <h2 className="ob-q">Un poco más de detalle</h2>
        <p className="lc-sub">Todo es opcional: responda lo que sepa.</p>
        <div className="pf-grid">
          <Num
            id="pf-workers"
            label="Trabajadores"
            value={d.workers}
            onChange={(v) => set("workers", v)}
          />
          <Num
            id="pf-interval"
            label="Tiempo entre partos"
            unit="meses"
            value={d.calvingIntervalMonths}
            onChange={(v) => set("calvingIntervalMonths", v)}
          />
          <Num
            id="pf-paddocks"
            label="Número de potreros"
            value={d.paddocks}
            onChange={(v) => set("paddocks", v)}
          />
          <Num
            id="pf-rest"
            label="Descanso de los potreros"
            unit="días"
            value={d.restDays}
            onChange={(v) => set("restDays", v)}
          />
          {d.focus !== "leche" && (
            <>
              <Num
                id="pf-saleage"
                label="Edad de venta"
                unit="meses"
                value={d.saleAgeMonths}
                onChange={(v) => set("saleAgeMonths", v)}
              />
              <Num
                id="pf-saleweight"
                label="Peso de venta"
                unit="kg"
                value={d.saleWeightKg}
                onChange={(v) => set("saleWeightKg", v)}
              />
            </>
          )}
        </div>
        <p className="ob-label">¿Qué les da además del pasto?</p>
        <Chips
          options={SUPPS}
          value={d.supplements}
          onPick={(v) => set("supplements", toggle(d.supplements, v))}
        />
        {d.focus !== "carne" && (
          <>
            <p className="ob-label">¿Le pagan la leche por calidad?</p>
            <Chips
              options={[
                ["si", "Sí"],
                ["no", "No"],
              ]}
              value={d.qualityPay}
              onPick={(v) => set("qualityPay", v)}
            />
          </>
        )}
        <p className="ob-label">Certificaciones</p>
        <Chips
          options={CERTS}
          value={d.certifications}
          onPick={(v) => set("certifications", toggle(d.certifications, v))}
        />
        <label htmlFor="pf-problem" className="pf-num">
          <span>¿Cuál es hoy su mayor problema en la finca?</span>
          <textarea
            id="pf-problem"
            rows={3}
            maxLength={300}
            value={d.mainProblem}
            onChange={(e) => set("mainProblem", e.target.value)}
          />
        </label>
      </section>
    );
  }

  function go(m: ModuleKey) {
    props.onClose();
    props.onModule?.(m);
  }

  return (
    <section className="onboarding pf-overlay" aria-label="Perfil de su finca">
      <div className="ob-card">
        <header className="ob-head">
          <div className="pf-head-row">
            <p className="kicker">{result ? "Listo" : "Perfil de su finca"}</p>
            <button type="button" className="pf-close" aria-label="Cerrar" onClick={props.onClose}>
              <X size={20} />
            </button>
          </div>
          <h1>{result ? "Primer diagnóstico" : "Cuéntenos de su finca"}</h1>
          <p className="lc-sub">
            {result
              ? "Con sus respuestas: así sabe por dónde empezar."
              : "Unas preguntas cortas para orientar la aplicación a lo que usted busca."}
          </p>
          {!result && (
            <ol
              className="ob-steps"
              style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}
            >
              {steps.map((s, i) => {
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
          )}
        </header>

        <div className="ob-body">
          {body}
          {error && (
            <p role="alert" className="login-alert">
              {error}
            </p>
          )}
        </div>

        <footer className="ob-foot">
          {result ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setResult(null);
                  setStep(0);
                }}
              >
                Cambiar respuestas
              </button>
              <button type="button" className="btn btn-primary" onClick={props.onClose}>
                <Check size={18} aria-hidden="true" /> Continuar
              </button>
            </>
          ) : (
            <>
              {step > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ArrowLeft size={18} aria-hidden="true" /> Atrás
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={props.onClose}>
                  Después
                </button>
              )}
              {step < last ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canNext}
                  onClick={() => setStep((s) => s + 1)}
                >
                  Siguiente <ArrowRight size={18} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canNext || busy}
                  onClick={() => void finish()}
                >
                  <Sparkles size={18} aria-hidden="true" />{" "}
                  {busy ? "Analizando…" : "Ver diagnóstico"}
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </section>
  );
}

/* ───────────── Resultado ───────────── */

const LEVEL_LABEL: Record<DiagLevel, string> = {
  prioridad: "Prioridad",
  atencion: "Atención",
  bien: "Bien",
  sin_dato: "Sin dato",
};

export function DiagnosisView(props: {
  d: Diagnosis;
  compact?: boolean;
  onModule?: ((m: ModuleKey) => void) | undefined;
}) {
  const { d } = props;
  const areas = props.compact ? d.areas.slice(0, 4) : d.areas;
  return (
    <div className="dx">
      <p className="dx-size">{d.sizeLabel}</p>
      <ul className="dx-areas">
        {areas.map((a) => (
          <li key={a.key} className={`dx-area dx-${a.level}`}>
            <span className="dx-pill">{LEVEL_LABEL[a.level]}</span>
            <div>
              <strong>
                {a.title}
                {a.figure && <em> · {a.figure}</em>}
              </strong>
              {!props.compact && <p>{a.text}</p>}
            </div>
          </li>
        ))}
      </ul>
      {!props.compact && d.actions.length > 0 && (
        <>
          <h3 className="dx-h">Para empezar</h3>
          <ol className="dx-actions">
            {d.actions.map((a, i) => (
              <li key={a.title}>
                <span className="dx-n">{i + 1}</span>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.text}</p>
                </div>
                {props.onModule && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => props.onModule?.(a.module)}
                  >
                    Ir ›
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {!props.compact && (
        <p className="dx-note">
          Diagnóstico orientativo con referencias generales de la ganadería en Colombia. No
          reemplaza la visita del veterinario o del asesor técnico.
        </p>
      )}
    </div>
  );
}
