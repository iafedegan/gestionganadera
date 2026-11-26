import {
  type ExpLevel,
  type Indicator,
  type IndicatorKey,
  LEVEL_LABEL,
  type Piso,
  REFERENCES,
  type Requirement,
  compareIndicator,
  expedienteLevel,
  farmIndicators,
  pisoTermico,
} from "@ganaderia/domain";
import { CheckCircle2, ChevronRight, Circle, FolderOpen, Lock, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useExtension } from "./Extension";
import { ProfileWizard, useFarmProfile } from "./Profile";
import { useActiveFarm, useFarms } from "./animals";
import { CardHead, PageHead } from "./components";
import { MOV_SEED, type Mov } from "./herd";
import { useStore } from "./kit";
import { fecha, todayLocal } from "./labels";
import { getElevation } from "./lib/farmIntel";
import { type LocalFarmMap, type LocalHerdAnimal, localdb } from "./lib/localdb";
import type { ModuleKey } from "./modules";
import { useApp } from "./state";

/**
 * Expediente digital predial (Plan CTeI 2026–2030, §6.2): el registro único de la finca. Reúne lo
 * que ya está en la app, calcula la línea base con los registros reales, la compara con las
 * referencias de su piso térmico y dice qué falta para subir de nivel.
 */

const FIX: Record<Requirement["key"], { go: ModuleKey | "perfil"; hint: string }> = {
  account: { go: "configuracion", hint: "Su cuenta" },
  location: { go: "configuracion", hint: "Marque la ubicación de la finca en Ajustes." },
  focus: { go: "configuracion", hint: "Indique si es de leche, carne o doble propósito." },
  herdSize: { go: "perfil", hint: "Diga cuántos animales tiene, aunque sea aproximado." },
  area: { go: "configuracion", hint: "Escriba las hectáreas dedicadas a la ganadería." },
  animals: { go: "animales", hint: "Registre sus animales uno a uno." },
  paddocks: { go: "pasturas", hint: "Dibuje sus potreros en el mapa." },
  practices: { go: "perfil", hint: "Responda el diagnóstico de la finca (5 minutos)." },
  indicators: {
    go: "reproduccion",
    hint: "Registre partos, ordeños o pesajes para calcular sus parámetros.",
  },
  verified: {
    go: "asistencia",
    hint: "Pida la visita al Secretario Técnico de su TECNIG@N desde Asistencia técnica.",
  },
};

/** Qué registrar para que aparezca cada parámetro. */
const HOW: Record<IndicatorKey, string> = {
  edadPrimerParto: "Registre la fecha de nacimiento de las novillas y su primer parto.",
  intervaloPartos: "Registre al menos dos partos de la misma vaca.",
  natalidad: "Registre sus vacas y los partos del último año.",
  litrosVacaDia: "Registre los ordeños de esta semana.",
  gananciaDiaria: "Pese los mismos animales dos veces, con dos semanas o más de diferencia.",
  carga: "Escriba el área en ganadería y registre sus animales.",
};

const STANDING_LABEL = {
  mejor: "Mejor que la referencia",
  igual: "Similar a la referencia",
  peor: "Por mejorar",
  sin_dato: "Sin datos",
} as const;

const num = (v: number, dec = 0) =>
  v.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: dec });

export function ExpedienteScreen({ onModule }: { onModule(m: ModuleKey): void }) {
  const { orgId, session, dataVersion } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [chosen, setChosen] = useState("");
  const farm = farms.find((f) => f.id === (chosen || active)) ?? farms[0] ?? null;
  const profileState = useFarmProfile();
  const profile = profileState.dto?.profile ?? null;
  const [herd, setHerd] = useState<LocalHerdAnimal[]>([]);
  const [indicators, setIndicators] = useState<Indicator[] | null>(null);
  const [map, setMap] = useState<LocalFarmMap | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);
  const [movs] = useStore<Mov>("movs-eco", MOV_SEED);
  const [profileOpen, setProfileOpen] = useState(false);
  const ext = useExtension().data;

  const area = farm?.livestockAreaHa ?? farm?.totalAreaHa ?? profile?.areaHa ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    if (!orgId || !farm) return;
    let live = true;
    void Promise.all([
      localdb.herdAnimals(orgId),
      localdb.listAnimalEvents(orgId),
      localdb.getFarmMap(farm.id),
    ]).then(([allHerd, allEvents, m]) => {
      if (!live) return;
      const h = allHerd.filter((a) => a.farmId === farm.id);
      setHerd(h);
      setMap(m);
      setIndicators(
        farmIndicators({
          animals: h,
          events: allEvents.filter((e) => e.farmId === farm.id),
          areaHa: area,
          today: todayLocal(),
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [orgId, farm?.id, area, dataVersion]);

  useEffect(() => {
    setElevation(null);
    if (farm?.latitude == null || farm.longitude == null) return;
    void getElevation(farm.latitude, farm.longitude).then(setElevation);
  }, [farm?.latitude, farm?.longitude]);

  if (!farm) {
    return (
      <section className="page">
        <PageHead
          kicker="FEDEGÁN 5.0"
          icon={<FolderOpen size={30} aria-hidden="true" />}
          title="Expediente de la finca"
          lead="Registre su finca para empezar su expediente."
        />
        <button type="button" className="btn btn-primary" onClick={() => onModule("configuracion")}>
          Registrar mi finca
        </button>
      </section>
    );
  }

  const piso = pisoTermico(elevation);
  const known = (indicators ?? []).filter((i) => i.value !== null && i.key !== "carga").length;
  const paddocks = map?.paddocks.length ?? profile?.paddocks ?? 0;
  const { level, requirements, next } = expedienteLevel({
    account: Boolean(session),
    location: Boolean(farm.locationText || (farm.latitude != null && farm.longitude != null)),
    focus: Boolean(farm.productionFocus || profile?.focus),
    herdSize: Boolean((profile?.heads ?? 0) > 0 || herd.length > 0),
    area: Boolean(area && area > 0),
    animals: herd.length,
    paddocks,
    practices: Boolean(profile),
    indicators: known,
    verified: Boolean(ext?.verifications.some((v) => v.farmId === farm.id)),
  });
  const verification = ext?.verifications.find((v) => v.farmId === farm.id) ?? null;
  const recos = (ext?.recommendations ?? []).filter((r) => !r.farmId || r.farmId === farm.id);
  const year = todayLocal().slice(0, 4);
  const movsYear = movs.filter((m) => m.fecha.startsWith(year)).length;
  const go = (r: Requirement) => {
    const target = FIX[r.key].go;
    if (target === "perfil") setProfileOpen(true);
    else onModule(target);
  };

  return (
    <section className="page page-exp">
      <PageHead
        kicker="FEDEGÁN 5.0"
        icon={<FolderOpen size={30} aria-hidden="true" />}
        title="Expediente de la finca"
        lead="El registro único de su finca. Lo que anota aquí le sirve a usted, a su técnico y a los programas del gremio."
      />

      {farms.length > 1 && (
        <label className="exp-farm">
          <span>Finca</span>
          <select value={farm.id} onChange={(e) => setChosen(e.target.value)}>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <article className="card exp-level">
        <p className="exp-level-k">Nivel del expediente</p>
        <h2>
          Nivel {level} de 3 · {LEVEL_LABEL[level]}
        </h2>
        <LevelBar level={level} />
        {next.length > 0 ? (
          <>
            <p className="exp-next-t">Para llegar al nivel {level + 1}:</p>
            <ul className="exp-next">
              {next.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => go(r)}>
                    <span className="exp-next-ic">
                      {r.key === "verified" ? (
                        <Lock size={18} aria-hidden="true" />
                      ) : (
                        <Circle size={18} aria-hidden="true" />
                      )}
                    </span>
                    <span>
                      <strong>{r.label}</strong>
                      <small>{FIX[r.key].hint}</small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hint">Su expediente está completo y verificado en campo.</p>
        )}
      </article>

      <article className="card exp-ind">
        <CardHead
          icon={<CheckCircle2 size={24} aria-hidden="true" />}
          title="Línea base de su finca"
          sub={
            piso
              ? `Su finca está a ${num(elevation ?? 0)} m: se compara con las ganaderías del trópico ${piso}.`
              : "Sin la altitud de la finca se compara con el promedio nacional."
          }
        />
        {indicators === null ? (
          <p className="hint">Calculando con sus registros…</p>
        ) : (
          <ul className="exp-rows">
            {indicators.map((i) => (
              <IndicatorRow key={i.key} ind={i} piso={piso} />
            ))}
          </ul>
        )}
        <p className="hint">
          Referencias: Plan Estratégico CTeI 2026–2030 de FEDEGÁN–FNG (Tablas 5 a 7). Orientan; no
          reemplazan la visita técnica.
        </p>
      </article>

      <article className="card exp-blocks">
        <CardHead
          icon={<FolderOpen size={24} aria-hidden="true" />}
          title="Qué contiene su expediente"
          sub="Los cinco bloques del registro de la finca."
        />
        <Block title="Identificación y ubicación">
          <Item done={requirements.some((r) => r.key === "location" && r.done)} label="Ubicación" />
          <Item done={Boolean(area)} label={area ? `Área: ${num(area, 1)} ha` : "Área"} />
          <Item
            done={Boolean(map?.boundary && map.boundary.length > 2)}
            label="Lindero dibujado en el mapa"
            note="Lo piden la Ley 2585 de 2026 y los compradores que exigen ganado libre de deforestación."
          />
        </Block>
        <Block title="Sistema productivo">
          <Item
            done={Boolean(farm.productionFocus || profile?.focus)}
            label="Orientación productiva"
          />
          <Item done={herd.length > 0} label={`Animales registrados: ${num(herd.length)}`} />
          <Item done={paddocks > 0} label={`Potreros: ${num(paddocks)}`} />
          <Item done={Boolean(profile)} label="Prácticas de manejo (diagnóstico)" />
        </Block>
        <Block title="Línea base técnica">
          <Item done={known >= 2} label={`${known} de 5 parámetros con datos`} />
        </Block>
        <Block title="Historial con el gremio">
          <Item done={Boolean(profile)} label="Diagnóstico de la finca" />
          <Item
            done={recos.length > 0}
            label={`Recomendaciones: ${num(recos.length)} · aplicadas ${num(
              recos.filter((r) => r.status === "adoptada").length,
            )} · verificadas ${num(recos.filter((r) => r.verifiedAt).length)}`}
          />
          <Item
            done={Boolean(verification)}
            label={
              verification
                ? `Línea base verificada en campo el ${fecha(verification.visitedOn)}`
                : "Visita de verificación en campo"
            }
            note={
              verification
                ? `Por ${verification.verifierName}`
                : "La hace el Secretario Técnico del TECNIG@N."
            }
          />
        </Block>
        <Block title="Económico y ambiental">
          <Item done={movsYear > 0} label={`Ingresos y gastos de ${year}: ${num(movsYear)}`} />
          <Item done={false} soon label="Coberturas, árboles y carbono" note="Próximamente." />
        </Block>
      </article>

      <article className="card exp-privacy">
        <CardHead
          icon={<ShieldCheck size={24} aria-hidden="true" />}
          title="Sus datos son suyos"
          sub="Usted decide quién ve su expediente, lo descarga cuando quiera y puede pedir correcciones."
          action={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onModule("configuracion")}
            >
              Mis datos
            </button>
          }
        />
      </article>

      {profileOpen && (
        <ProfileWizard
          initial={profile}
          onClose={() => setProfileOpen(false)}
          onModule={onModule}
        />
      )}
    </section>
  );
}

function LevelBar({ level }: { level: ExpLevel }) {
  return (
    <ol className="exp-bar" aria-label={`Nivel ${level} de 3`}>
      {([1, 2, 3] as const).map((l) => (
        <li key={l} className={l <= level ? "on" : ""}>
          <span>{l}</span>
          <small>{LEVEL_LABEL[l]}</small>
        </li>
      ))}
    </ol>
  );
}

function IndicatorRow({ ind, piso }: { ind: Indicator; piso: Piso | null }) {
  const ref = REFERENCES[ind.key];
  const cmp = compareIndicator(ind.key, ind.value, piso);
  const dec =
    ind.key === "carga" ? 2 : ind.key === "edadPrimerParto" || ind.key === "litrosVacaDia" ? 1 : 0;
  return (
    <li className={`exp-row st-${cmp.standing}`}>
      <div className="exp-row-main">
        <strong>{ref.label}</strong>
        <span className="exp-val">
          {ind.value === null ? "—" : `${num(ind.value, dec)} ${ref.unit}`}
        </span>
      </div>
      {ind.value === null ? (
        <small>{HOW[ind.key]}</small>
      ) : cmp.reference !== null ? (
        <small>
          {cmp.scope === "region" ? `Trópico ${piso}` : "Colombia"}: {num(cmp.reference, 1)}{" "}
          {ref.unit} · Referente: {num(ref.target, 1)} {ref.unit}
          {" · "}
          <b>{STANDING_LABEL[cmp.standing]}</b>
        </small>
      ) : (
        <small>Con {num(ind.n)} animales.</small>
      )}
    </li>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="exp-block">
      <h3>{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

function Item(props: { done: boolean; label: string; note?: string; soon?: boolean }) {
  return (
    <li className={props.done ? "done" : props.soon ? "soon" : ""}>
      {props.done ? (
        <CheckCircle2 size={18} aria-hidden="true" />
      ) : (
        <Circle size={18} aria-hidden="true" />
      )}
      <span>
        {props.label}
        {props.note && <small>{props.note}</small>}
      </span>
    </li>
  );
}
