import {
  DATA_CONSENT_VERSION,
  type ExtensionIndicators,
  type ExtensionSummaryDto,
  type ExtensionTopic,
  type RecommendationDto,
  type RecommendationStatus,
  type SectorIndicator,
  type TechCaseDto,
  type TechCaseThreadDto,
} from "@ganaderia/contracts";
import { REFERENCES } from "@ganaderia/domain";
import { CheckCircle2, MessageCircle, Send, ShieldCheck, Users } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useActiveFarm, useFarms } from "./animals";
import { CardHead, PageHead } from "./components";
import { Tabs } from "./kit";
import { fecha } from "./labels";
import { ApiError, NetworkError, api } from "./lib/api";
import { useApp } from "./state";

/*
 * Extensión híbrida con adopción verificada (Plan CTeI 2026–2030, §6.1.1 y apuesta 2).
 * Primer nivel: el asistente con IA. Segundo nivel: el Secretario Técnico del TECNIG@N.
 * Cada recomendación lleva su estado de adopción y, cuando el técnico la confirma, su verificación.
 */

export const TOPIC_LABEL: Record<ExtensionTopic, string> = {
  reproduccion: "Reproducción",
  nutricion: "Nutrición y alimentación",
  sanidad: "Sanidad",
  praderas: "Praderas y pastos",
  leche: "Leche y calidad",
  gestion: "Gestión y costos",
  ambiental: "Ambiental y clima",
  otro: "Otro tema",
};
const STATUS_LABEL: Record<RecommendationStatus, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  adoptada: "Aplicada",
  descartada: "No se aplicará",
};
const CASE_LABEL: Record<TechCaseDto["status"], string> = {
  abierta: "Esperando respuesta",
  respondida: "Respondida",
  cerrada: "Cerrada",
};

export const msg = (e: unknown) =>
  e instanceof NetworkError
    ? "Sin conexión. Necesita señal para hablar con el técnico."
    : e instanceof ApiError
      ? e.message
      : "No se pudo completar. Intente de nuevo.";

const indicatorLabel = (k: SectorIndicator | null) => (k ? REFERENCES[k].label : null);

/* ───────────── Piezas compartidas (productor y Secretario Técnico) ───────────── */

export function RecoCard(props: { r: RecommendationDto; actions?: ReactNode; showOrg?: boolean }) {
  const { r } = props;
  const state = r.verifiedAt ? "verificada" : r.status;
  return (
    <article className={`card ext-reco st-${state}`}>
      <p className="eco-meta">
        <span className="eco-tag">{TOPIC_LABEL[r.topic]}</span>
        <span className={`ext-chip ext-${state}`}>
          {r.verifiedAt ? "Verificada en finca" : STATUS_LABEL[r.status]}
        </span>
      </p>
      <h3 className="ext-title">{r.title}</h3>
      {props.showOrg && <p className="hint">{r.organizationName}</p>}
      {r.detail && <p className="eco-text">{r.detail}</p>}
      <p className="ext-facts">
        {indicatorLabel(r.indicator) && <span>Contribuye a: {indicatorLabel(r.indicator)}</span>}
        {r.dueOn && <span>Para el {fecha(r.dueOn)}</span>}
        <span>
          {r.fromStaff ? "Secretario Técnico" : "Registrada"} · {r.authorName}
        </span>
      </p>
      {r.verifiedAt && (
        <p className="ext-verified">
          <CheckCircle2 size={16} aria-hidden="true" /> Verificada el{" "}
          {fecha(r.verifiedAt.slice(0, 10))}
          {r.verificationNote ? `: ${r.verificationNote}` : ""}
        </p>
      )}
      {props.actions}
    </article>
  );
}

export function IndicatorsCard({ ind, title }: { ind: ExtensionIndicators; title: string }) {
  const pct = (v: number | null) => (v === null ? "—" : `${v} %`);
  return (
    <article className="card ext-ind">
      <CardHead icon={<CheckCircle2 size={24} aria-hidden="true" />} title={title} />
      <dl className="ext-kpis">
        <div
          className={
            ind.verifiedAdoptionRate !== null && ind.verifiedAdoptionRate >= 40 ? "ok" : ""
          }
        >
          <dt>Adopción verificada</dt>
          <dd>{pct(ind.verifiedAdoptionRate)}</dd>
          <small>Meta del plan: 40 % o más</small>
        </div>
        <div className={ind.firstLevelRate !== null && ind.firstLevelRate >= 80 ? "ok" : ""}>
          <dt>Resueltas por el asistente</dt>
          <dd>{pct(ind.firstLevelRate)}</dd>
          <small>Meta del plan: 80 % o más</small>
        </div>
        <div>
          <dt>Recomendaciones</dt>
          <dd>{ind.recommendations}</dd>
          <small>
            {ind.adopted} aplicadas · {ind.verified} verificadas
          </small>
        </div>
        <div>
          <dt>Consultas en el año</dt>
          <dd>{ind.aiQuestions + ind.escalated}</dd>
          <small>
            {ind.aiQuestions} al asistente · {ind.escalated} al técnico ·{" "}
            {ind.secondLevelAttentions} respuestas del técnico
          </small>
        </div>
      </dl>
    </article>
  );
}

export function CaseRow({
  c,
  onOpen,
  showOrg,
}: { c: TechCaseDto; onOpen(): void; showOrg?: boolean }) {
  return (
    <li>
      <button type="button" className={`ext-case st-${c.status}`} onClick={onOpen}>
        <span className="ext-case-ic">
          <MessageCircle size={20} aria-hidden="true" />
        </span>
        <span className="ext-case-t">
          <strong>{c.question}</strong>
          <small>
            {showOrg ? `${c.organizationName} · ` : ""}
            {TOPIC_LABEL[c.topic]} · {fecha(c.updatedAt.slice(0, 10))}
          </small>
        </span>
        <span className={`ext-chip ext-case-${c.status}`}>{CASE_LABEL[c.status]}</span>
      </button>
    </li>
  );
}

/** Conversación de una consulta. El Secretario Técnico ve además «Recomendar». */
export function ThreadDialog(props: {
  caseId: string;
  staff: boolean;
  onClose(): void;
  onChanged(): void;
  onRecommend?(c: TechCaseDto): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [t, setT] = useState<TechCaseThreadDto | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    api.caseThread(props.caseId).then(setT, (e) => setError(msg(e)));
  }, [props.caseId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setT(await api.caseReply(props.caseId, text.trim()));
      setText("");
      props.onChanged();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true);
    try {
      setT(await api.caseClose(props.caseId));
      props.onChanged();
    } catch (err) {
      setError(msg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="ext-th"
    >
      <header className="dialog-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar"
          onClick={() => ref.current?.close()}
        >
          ✕
        </button>
        <h2 id="ext-th">Consulta al Secretario Técnico</h2>
      </header>
      <div className="dialog-body">
        {!t && !error && <p className="hint">Cargando…</p>}
        {t && (
          <>
            <p className="eco-meta">
              <span className="eco-tag">{TOPIC_LABEL[t.case.topic]}</span>
              <span className={`ext-chip ext-case-${t.case.status}`}>
                {CASE_LABEL[t.case.status]}
              </span>
            </p>
            {props.staff && <p className="hint">{t.case.organizationName}</p>}
            <div className="ext-msg me">
              <small>
                {t.case.authorName} · {fecha(t.case.createdAt.slice(0, 10))}
              </small>
              <p>{t.case.question}</p>
            </div>
            {t.case.aiAnswer && (
              <div className="ext-msg ai">
                <small>Respuesta del asistente con IA (primer nivel)</small>
                <p>{t.case.aiAnswer}</p>
              </div>
            )}
            {t.messages.map((m) => (
              <div key={m.id} className={m.fromStaff ? "ext-msg staff" : "ext-msg me"}>
                <small>
                  {m.fromStaff ? "Secretario Técnico" : m.authorName} ·{" "}
                  {fecha(m.createdAt.slice(0, 10))}
                </small>
                <p>{m.body}</p>
              </div>
            ))}
            {t.case.status !== "cerrada" && (
              <form className="datos-form" onSubmit={send}>
                <label>
                  {props.staff ? "Su respuesta" : "Escribir al técnico"}
                  <textarea
                    rows={3}
                    maxLength={3000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || text.trim().length < 2}
                >
                  <Send size={16} aria-hidden="true" /> {busy ? "Enviando…" : "Enviar"}
                </button>
              </form>
            )}
            <div className="aula-actions">
              {props.staff && props.onRecommend && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => props.onRecommend?.(t.case)}
                >
                  Dejar una recomendación
                </button>
              )}
              {!props.staff && t.case.status !== "cerrada" && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void close()}
                >
                  Ya quedó resuelta
                </button>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="hint" role="alert">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}

/* ───────────── Productor: escalar una consulta ───────────── */

/** Lleva la consulta al Secretario Técnico. Si falta la autorización de compartir, la pide aquí. */
export function EscalateDialog(props: {
  question?: string;
  aiAnswer?: string;
  onClose(): void;
  onSent?(): void;
}) {
  const { orgId, notify } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const ref = useRef<HTMLDialogElement>(null);
  const [topic, setTopic] = useState<ExtensionTopic>("otro");
  const [question, setQuestion] = useState(props.question ?? "");
  const [needsShare, setNeedsShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const farmId = active || (farms.length === 1 ? farms[0]?.id : undefined);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.escalate({
        organizationId: orgId,
        ...(farmId ? { farmId } : {}),
        topic,
        question: question.trim(),
        ...(props.aiAnswer ? { aiAnswer: props.aiAnswer.slice(0, 6000) } : {}),
      });
      notify("Consulta enviada al Secretario Técnico de su región.", "ok");
      props.onSent?.();
      ref.current?.close();
    } catch (e) {
      if (e instanceof ApiError && e.code === "COMPARTIR_REQUERIDO") setNeedsShare(true);
      else setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function authorizeAndSend() {
    setBusy(true);
    setError(null);
    try {
      const cur = await api.consent();
      await api.saveConsent({
        version: DATA_CONSENT_VERSION,
        sectorAnalysis: cur.consent?.sectorAnalysis ?? false,
        shareTechnical: true,
      });
      setNeedsShare(false);
      await send();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="ext-esc"
    >
      <header className="dialog-head">
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar"
          onClick={() => ref.current?.close()}
        >
          ✕
        </button>
        <h2 id="ext-esc">Consultar al Secretario Técnico</h2>
      </header>
      <div className="dialog-body">
        <p className="hint">
          Lo atiende el Secretario Técnico del TECNIG@N de su región. Verá los datos de su finca
          para responderle con contexto.
        </p>
        <form
          className="datos-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label>
            Tema
            <select value={topic} onChange={(e) => setTopic(e.target.value as ExtensionTopic)}>
              {(Object.keys(TOPIC_LABEL) as ExtensionTopic[]).map((k) => (
                <option key={k} value={k}>
                  {TOPIC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Su consulta
            <textarea
              rows={4}
              maxLength={2000}
              value={question}
              placeholder="Ej.: mis novillas paren a los 40 meses, ¿qué puedo hacer?"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          {props.aiAnswer && (
            <p className="hint">
              Se adjunta lo que respondió el asistente, para que el técnico no empiece de cero.
            </p>
          )}
          {needsShare ? (
            <div className="ext-share">
              <ShieldCheck size={22} aria-hidden="true" />
              <p>
                Para que el Secretario Técnico vea su finca, autorice compartir el expediente con
                él. Puede retirarlo cuando quiera en Configuración → Mis datos.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void authorizeAndSend()}
              >
                {busy ? "Enviando…" : "Autorizar y enviar"}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || question.trim().length < 10}
            >
              {busy ? "Enviando…" : "Enviar consulta"}
            </button>
          )}
          {error && (
            <p className="hint" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </dialog>
  );
}

/* ───────────── Productor: Asistencia técnica ───────────── */

const cacheKey = (orgId: string) => `gg.ext.${orgId}`;
function readCache(orgId: string): ExtensionSummaryDto | null {
  try {
    const raw = localStorage.getItem(cacheKey(orgId));
    return raw ? (JSON.parse(raw) as ExtensionSummaryDto) : null;
  } catch {
    return null;
  }
}

/** Resumen de la extensión de la ganadería; sin señal muestra el último guardado. */
export function useExtension() {
  const { orgId, online, dataVersion } = useApp();
  const [data, setData] = useState<ExtensionSummaryDto | null>(() =>
    orgId ? readCache(orgId) : null,
  );
  const [error, setError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  const load = useCallback(() => {
    if (!orgId || !online) return;
    api.extension(orgId).then(
      (d) => {
        setData(d);
        setError(null);
        try {
          localStorage.setItem(cacheKey(orgId), JSON.stringify(d));
        } catch {
          /* sin almacenamiento */
        }
      },
      (e) => setError(msg(e)),
    );
  }, [orgId, online, dataVersion]);
  useEffect(() => load(), [load]);
  return { data, error, reload: load };
}

type ExtTab = "recomendaciones" | "consultas" | "indicadores";

export function ExtensionScreen() {
  const { online, notify } = useApp();
  const { data, error, reload } = useExtension();
  const [tab, setTab] = useState<ExtTab>("recomendaciones");
  const [escalating, setEscalating] = useState(false);
  const [thread, setThread] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(r: RecommendationDto, status: RecommendationStatus) {
    setBusy(r.id);
    try {
      await api.recoStatus(r.id, status);
      reload();
      if (status === "adoptada")
        notify("Anotado. El técnico la verificará en su próxima visita.", "ok");
    } catch (e) {
      notify(msg(e), "warn");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    try {
      const cur = await api.consent();
      await api.saveConsent({
        version: DATA_CONSENT_VERSION,
        sectorAnalysis: cur.consent?.sectorAnalysis ?? false,
        shareTechnical: true,
      });
      reload();
      notify("Autorización guardada.", "ok");
    } catch (e) {
      notify(msg(e), "warn");
    }
  }

  const recos = data?.recommendations ?? [];
  const open = recos.filter((r) => !r.verifiedAt && r.status !== "descartada");
  const done = recos.filter((r) => r.verifiedAt || r.status === "descartada");
  const waiting = (data?.cases ?? []).filter((c) => c.status === "respondida").length;

  return (
    <section className="page">
      <PageHead
        kicker="FEDEGÁN 5.0"
        icon={<Users size={30} aria-hidden="true" />}
        title="Asistencia técnica"
        lead="Pregunte primero al asistente de su finca. Si necesita más, lo atiende el Secretario Técnico del TECNIG@N de su región, y sus recomendaciones quedan aquí."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!online}
            onClick={() => setEscalating(true)}
          >
            Consultar al Secretario Técnico
          </button>
        }
      />
      {!online && !data && <p className="hint">Necesita conexión para ver sus consultas.</p>}
      {error && !data && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.shares ? (
            <p className="banner banner-info ext-who">
              <ShieldCheck size={18} aria-hidden="true" />
              {data.tecnigan
                ? `Lo atiende el ${data.tecnigan}. Ve su expediente porque usted lo autorizó.`
                : "Su región todavía no tiene Secretario Técnico en la plataforma."}
            </p>
          ) : (
            <div className="card ext-share">
              <ShieldCheck size={22} aria-hidden="true" />
              <p>
                Para recibir acompañamiento, autorice compartir el expediente de su finca con el
                Secretario Técnico de su región.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!online}
                onClick={() => void share()}
              >
                Autorizar
              </button>
            </div>
          )}

          <Tabs<ExtTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "recomendaciones", label: "Recomendaciones", badge: open.length || undefined },
              { key: "consultas", label: "Consultas", badge: waiting || undefined },
              { key: "indicadores", label: "Indicadores" },
            ]}
          />

          {tab === "recomendaciones" &&
            (recos.length === 0 ? (
              <p className="empty">
                Aún no tiene recomendaciones. Llegan cuando el Secretario Técnico atiende sus
                consultas o visita la finca.
              </p>
            ) : (
              <div className="ext-list">
                {open.map((r) => (
                  <RecoCard
                    key={r.id}
                    r={r}
                    actions={
                      r.status === "adoptada" ? (
                        <p className="hint">
                          Aplicada. Falta que el técnico la verifique en la finca.
                        </p>
                      ) : (
                        <div className="ext-actions">
                          {r.status === "pendiente" && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy === r.id || !online}
                              onClick={() => void setStatus(r, "en_curso")}
                            >
                              La empecé
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy === r.id || !online}
                            onClick={() => void setStatus(r, "adoptada")}
                          >
                            Ya la apliqué
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy === r.id || !online}
                            onClick={() => void setStatus(r, "descartada")}
                          >
                            No la aplicaré
                          </button>
                        </div>
                      )
                    }
                  />
                ))}
                {done.length > 0 && <h3 className="eco-sub">Cerradas</h3>}
                {done.map((r) => (
                  <RecoCard key={r.id} r={r} />
                ))}
              </div>
            ))}

          {tab === "consultas" &&
            (data.cases.length === 0 ? (
              <p className="empty">Todavía no ha hecho consultas al Secretario Técnico.</p>
            ) : (
              <ul className="ext-cases">
                {data.cases.map((c) => (
                  <CaseRow key={c.id} c={c} onOpen={() => setThread(c.id)} />
                ))}
              </ul>
            ))}

          {tab === "indicadores" && (
            <IndicatorsCard ind={data.indicators} title="Su acompañamiento técnico" />
          )}
        </>
      )}

      {escalating && <EscalateDialog onClose={() => setEscalating(false)} onSent={reload} />}
      {thread && (
        <ThreadDialog
          caseId={thread}
          staff={false}
          onClose={() => setThread(null)}
          onChanged={reload}
        />
      )}
    </section>
  );
}
