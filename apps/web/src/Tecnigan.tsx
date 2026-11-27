import type {
  ExtensionTopic,
  RecommendationDto,
  SectorIndicator,
  StaffDto,
  StaffInboxDto,
  StaffOrgDto,
  TechCaseDto,
} from "@ganaderia/contracts";
import { REFERENCES } from "@ganaderia/domain";
import { ClipboardCheck, LogOut, MapPin, RefreshCw } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CaseRow, IndicatorsCard, RecoCard, TOPIC_LABEL, ThreadDialog, msg } from "./Extension";
import { Tabs } from "./kit";
import { fecha, todayLocal } from "./labels";
import { api } from "./lib/api";
import { useApp } from "./state";

/**
 * Bandeja del Secretario Técnico Ganadero (segundo nivel de la extensión, Plan CTeI 2026–2030).
 * Solo ve las ganaderías de los departamentos de su TECNIG@N que autorizaron compartir su expediente.
 */

/** Cuenta sin ganaderías: si es personal del gremio abre su bandeja; si no, lo explica. */
export function StaffGate() {
  const { online, logout } = useApp();
  const [staff, setStaff] = useState<StaffDto | null | undefined>(undefined);
  useEffect(() => {
    if (!online) return;
    api.staffMe().then(
      (r) => setStaff(r.staff),
      () => setStaff(null),
    );
  }, [online]);
  if (staff) return <TecniganApp staff={staff} />;
  return (
    <section className="page staff-empty">
      <h1>GanSmart</h1>
      <p className="eco-text">
        {staff === undefined
          ? online
            ? "Cargando…"
            : "Necesita conexión para abrir su cuenta."
          : "Su cuenta todavía no tiene acceso a una ganadería. Pida a la persona dueña que lo invite."}
      </p>
      <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
        Cerrar sesión
      </button>
    </section>
  );
}

type StaffTab = "consultas" | "ganaderias" | "recomendaciones" | "indicadores";

export function TecniganApp({ staff }: { staff: StaffDto }) {
  const { session, logout, notify, online } = useApp();
  const [data, setData] = useState<StaffInboxDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StaffTab>("consultas");
  const [thread, setThread] = useState<string | null>(null);
  const [recoFor, setRecoFor] = useState<{
    org: StaffOrgDto;
    farmId?: string;
    caseId?: string;
  } | null>(null);
  const [verifyReco, setVerifyReco] = useState<RecommendationDto | null>(null);
  const [visit, setVisit] = useState<{ org: StaffOrgDto; farmId: string; farmName: string } | null>(
    null,
  );

  const load = useCallback(() => {
    api.staffInbox().then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e) => setError(msg(e)),
    );
  }, []);
  useEffect(() => load(), [load]);

  const orgOf = (id: string) => data?.organizations.find((o) => o.organizationId === id);
  const recommendFromCase = (c: TechCaseDto) => {
    const org = orgOf(c.organizationId);
    if (!org) return;
    setThread(null);
    setRecoFor({ org, caseId: c.id, ...(c.farmId ? { farmId: c.farmId } : {}) });
  };

  const openCases = (data?.cases ?? []).filter((c) => c.status === "abierta").length;
  const toVerify = (data?.recommendations ?? []).filter(
    (r) => r.status === "adoptada" && !r.verifiedAt,
  );

  return (
    <div className="staff-app">
      <header className="staff-top">
        <span className="brand-mark brand-mini" aria-hidden="true" />
        <div className="staff-who">
          <strong>{staff.tecnigan}</strong>
          <small>{session?.displayName} · Secretario Técnico</small>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Actualizar"
          onClick={load}
          disabled={!online}
        >
          <RefreshCw size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar sesión"
          onClick={() => void logout()}
        >
          <LogOut size={18} />
        </button>
      </header>

      <section className="page">
        <h1 className="staff-h1">Bandeja del TECNIG@N</h1>
        <p className="hint">
          Departamentos: {staff.departments.join(", ")}. Solo aparecen las ganaderías que
          autorizaron compartir su expediente.
        </p>
        {error && (
          <p className="hint" role="alert">
            {error}
          </p>
        )}
        {!data && !error && <p className="hint">Cargando…</p>}
        {data && (
          <>
            <Tabs<StaffTab>
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "consultas", label: "Consultas", badge: openCases || undefined },
                {
                  key: "ganaderias",
                  label: "Ganaderías",
                  badge: data.organizations.length || undefined,
                },
                {
                  key: "recomendaciones",
                  label: "Por verificar",
                  badge: toVerify.length || undefined,
                },
                { key: "indicadores", label: "Indicadores" },
              ]}
            />

            {tab === "consultas" &&
              (data.cases.length === 0 ? (
                <p className="empty">No hay consultas de su región.</p>
              ) : (
                <ul className="ext-cases">
                  {data.cases.map((c) => (
                    <CaseRow key={c.id} c={c} showOrg onOpen={() => setThread(c.id)} />
                  ))}
                </ul>
              ))}

            {tab === "ganaderias" &&
              (data.organizations.length === 0 ? (
                <p className="empty">
                  Ninguna ganadería de su región ha autorizado compartir todavía.
                </p>
              ) : (
                <div className="ext-list">
                  {data.organizations.map((o) => (
                    <article key={o.organizationId} className="card staff-org">
                      <h3 className="ext-title">{o.organizationName}</h3>
                      <p className="hint">
                        <MapPin size={14} aria-hidden="true" />{" "}
                        {[o.municipality, o.department].filter(Boolean).join(", ")}
                      </p>
                      <ul className="staff-farms">
                        {o.farms.map((f) => (
                          <li key={f.id}>
                            <div>
                              <strong>{f.name}</strong>
                              <small>
                                {f.animals} animales
                                {f.areaHa ? ` · ${f.areaHa} ha` : ""}
                                {f.verifiedOn
                                  ? ` · Verificada el ${fecha(f.verifiedOn)}`
                                  : " · Sin verificar"}
                              </small>
                            </div>
                            <div className="ext-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setRecoFor({ org: o, farmId: f.id })}
                              >
                                Recomendar
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => setVisit({ org: o, farmId: f.id, farmName: f.name })}
                              >
                                Verificar en campo
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ))}

            {tab === "recomendaciones" && (
              <div className="ext-list">
                {toVerify.length === 0 && (
                  <p className="empty">
                    No hay recomendaciones aplicadas esperando su verificación.
                  </p>
                )}
                {toVerify.map((r) => (
                  <RecoCard
                    key={r.id}
                    r={r}
                    showOrg
                    actions={
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setVerifyReco(r)}
                      >
                        Verificar en finca
                      </button>
                    }
                  />
                ))}
                {data.recommendations
                  .filter((r) => !toVerify.includes(r))
                  .map((r) => (
                    <RecoCard key={r.id} r={r} showOrg />
                  ))}
              </div>
            )}

            {tab === "indicadores" && (
              <IndicatorsCard ind={data.indicators} title="Indicadores de su región" />
            )}
          </>
        )}
      </section>

      {thread && (
        <ThreadDialog
          caseId={thread}
          staff
          onClose={() => setThread(null)}
          onChanged={load}
          onRecommend={recommendFromCase}
        />
      )}
      {recoFor && (
        <RecoForm
          org={recoFor.org}
          {...(recoFor.farmId ? { farmId: recoFor.farmId } : {})}
          {...(recoFor.caseId ? { caseId: recoFor.caseId } : {})}
          onClose={() => setRecoFor(null)}
          onSaved={() => {
            notify("Recomendación enviada a la ganadería.", "ok");
            load();
          }}
        />
      )}
      {verifyReco && (
        <NoteDialog
          title="Verificar en finca"
          lead={`«${verifyReco.title}». Confirme que la vio aplicada en ${verifyReco.organizationName}.`}
          action="Confirmar verificación"
          onClose={() => setVerifyReco(null)}
          onSubmit={async (note) => {
            await api.recoVerify(verifyReco.id, note);
            notify("Adopción verificada.", "ok");
            load();
          }}
        />
      )}
      {visit && (
        <NoteDialog
          title="Verificación en campo"
          lead={`Línea base de ${visit.farmName} (${visit.org.organizationName}) medida en la visita. Lleva el expediente al nivel 3.`}
          action="Registrar visita"
          withDate
          onClose={() => setVisit(null)}
          onSubmit={async (note, date) => {
            await api.fieldVerify({
              organizationId: visit.org.organizationId,
              farmId: visit.farmId,
              visitedOn: date,
              note,
            });
            notify("Visita registrada. El expediente de la finca queda verificado.", "ok");
            load();
          }}
        />
      )}
    </div>
  );
}

function RecoForm(props: {
  org: StaffOrgDto;
  farmId?: string;
  caseId?: string;
  onClose(): void;
  onSaved(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [farmId, setFarmId] = useState(props.farmId ?? props.org.farms[0]?.id ?? "");
  const [topic, setTopic] = useState<ExtensionTopic>("reproduccion");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [indicator, setIndicator] = useState<SectorIndicator | "">("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.recommend({
        organizationId: props.org.organizationId,
        farmId: farmId || null,
        caseId: props.caseId ?? null,
        topic,
        title: title.trim(),
        detail: detail.trim(),
        indicator: indicator || null,
        dueOn: dueOn || null,
      });
      props.onSaved();
      ref.current?.close();
    } catch (err) {
      setError(msg(err));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="st-reco"
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
        <h2 id="st-reco">Recomendación para {props.org.organizationName}</h2>
      </header>
      <div className="dialog-body">
        <form className="datos-form" onSubmit={save}>
          {props.org.farms.length > 1 && (
            <label>
              Finca
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                {props.org.farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
            Recomendación (una frase)
            <input
              value={title}
              maxLength={140}
              placeholder="Ej.: pesar las novillas cada mes"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Cómo hacerlo
            <textarea
              rows={3}
              maxLength={2000}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </label>
          <label>
            Indicador al que contribuye
            <select
              value={indicator}
              onChange={(e) => setIndicator(e.target.value as SectorIndicator | "")}
            >
              <option value="">Ninguno en particular</option>
              {(Object.keys(REFERENCES) as SectorIndicator[]).map((k) => (
                <option key={k} value={k}>
                  {REFERENCES[k].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Para cuándo (opcional)
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </label>
          {error && (
            <p className="hint" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || title.trim().length < 5}
          >
            {busy ? "Enviando…" : "Enviar a la ganadería"}
          </button>
        </form>
      </div>
    </dialog>
  );
}

function NoteDialog(props: {
  title: string;
  lead: string;
  action: string;
  withDate?: boolean;
  onClose(): void;
  onSubmit(note: string, date: string): Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="st-note"
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
        <h2 id="st-note">{props.title}</h2>
      </header>
      <div className="dialog-body">
        <form
          className="datos-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await props.onSubmit(note.trim(), date);
              ref.current?.close();
            } catch (err) {
              setError(msg(err));
              setBusy(false);
            }
          }}
        >
          <p className="eco-text">
            <ClipboardCheck size={18} aria-hidden="true" /> {props.lead}
          </p>
          {props.withDate && (
            <label>
              Fecha de la visita
              <input
                type="date"
                value={date}
                max={todayLocal()}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          <label>
            Lo que vio (opcional)
            <textarea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p className="hint" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Guardando…" : props.action}
          </button>
        </form>
      </div>
    </dialog>
  );
}
