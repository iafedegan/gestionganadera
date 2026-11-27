import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useFarms } from "./animals";
import { art } from "./art";
import { CATEGORY_LABEL, fecha, num, todayLocal } from "./labels";
import { type Change, compareAnimal, milkByFarm, tagsIn } from "./lib/animalCompare";
import { FLAG_LABEL, ageText, animalInfo } from "./lib/animalTags";
import { sparkPath } from "./lib/homeStats";
import { type LocalAnimalEvent, type LocalHerdAnimal, localdb } from "./lib/localdb";
import { useApp } from "./state";

/**
 * Lo que acompaña cada respuesta: la leche por finca y una ficha por cada animal nombrado,
 * con imagen, estado y la comparación entre antes y ahora. Todo sale de los registros.
 */

export interface HerdSnapshot {
  herd: LocalHerdAnimal[];
  events: LocalAnimalEvent[];
}

export function useHerdSnapshot(): HerdSnapshot {
  const { orgId, dataVersion } = useApp();
  const [snap, setSnap] = useState<HerdSnapshot>({ herd: [], events: [] });
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    void Promise.all([localdb.herdAnimals(orgId), localdb.listAnimalEvents(orgId)]).then(
      ([herd, events]) => setSnap({ herd, events }),
    );
  }, [orgId, dataVersion]);
  return snap;
}

function Delta({ c }: { c: Change }) {
  if (c.pct === null) return <em className="av-delta flat">Sin dato anterior</em>;
  const dir = c.pct > 2 ? "up" : c.pct < -2 ? "down" : "flat";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <em className={`av-delta ${dir}`}>
      <Icon size={14} aria-hidden="true" />
      {c.pct > 0 ? "+" : ""}
      {c.pct} %
    </em>
  );
}

function Bars({ c, unit }: { c: Change; unit: string }) {
  const max = Math.max(c.before, c.now, 1);
  return (
    <dl className="av-bars">
      {(
        [
          ["Antes", c.before, "before"],
          ["Ahora", c.now, "now"],
        ] as const
      ).map(([label, v, kind]) => (
        <div key={kind}>
          <dt>{label}</dt>
          <dd>
            <span className={`av-bar ${kind}`} style={{ width: `${(v / max) * 100}%` }} />
          </dd>
          <dd className="av-val">
            {num(v)} {unit}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STEP = 4;

export function AnswerVisuals({ answer, snapshot }: { answer: string; snapshot: HerdSnapshot }) {
  const farms = useFarms();
  const [limit, setLimit] = useState(STEP);
  const today = todayLocal();
  const { herd, events } = snapshot;
  const tags = tagsIn(
    answer,
    herd.map((a) => a.tag),
  );
  const milk = /leche|producci|ordeñ/i.test(answer) ? milkByFarm(events, today) : [];
  if (tags.length === 0 && milk.length === 0) return null;
  const info = animalInfo(events, today);
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? "Finca";
  const maxMilk = Math.max(...milk.flatMap((m) => [m.before, m.now]), 1);

  return (
    <div className="av">
      {milk.length > 0 && (
        <section className="av-card">
          <h3>Leche por finca: semana anterior y esta</h3>
          <ul className="av-farms">
            {milk.map((m) => (
              <li key={m.farmId}>
                <span className="av-farm-head">
                  <strong>{farmName(m.farmId)}</strong>
                  <Delta c={m} />
                </span>
                <span className="av-pair">
                  <span
                    className="av-bar before"
                    style={{ width: `${(m.before / maxMilk) * 100}%` }}
                  />
                  <span className="av-bar now" style={{ width: `${(m.now / maxMilk) * 100}%` }} />
                </span>
                <small>
                  {num(Math.round(m.before))} L → {num(Math.round(m.now))} L
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && <h3 className="av-title">Los animales que menciono</h3>}
      {tags.slice(0, limit).map((tag) => {
        const a = herd.find((x) => x.tag === tag);
        if (!a) return null;
        const mine = events.filter((e) => e.animalId === a.id);
        const c = compareAnimal(mine, today);
        const flags = info.get(a.id)?.flags ?? [];
        const line = c.milk ? sparkPath(c.milk.daily, 140, 34) : "";
        return (
          <article key={a.id} className="av-card av-animal">
            <header>
              <img src={art(a.species === "bufalino" ? "ficha-buffalo" : "ficha-cow")} alt="" />
              <div>
                <strong>{a.tag}</strong>
                <small>
                  {[CATEGORY_LABEL[a.category], ageText(a.birthDate, today), farmName(a.farmId)]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                {flags.length > 0 && (
                  <span className="herd-flags">
                    {flags.map((f) => (
                      <em key={f} className={`f-${f}`}>
                        {FLAG_LABEL[f]}
                      </em>
                    ))}
                  </span>
                )}
              </div>
            </header>
            {c.milk && (
              <div className="av-metric">
                <span className="av-farm-head">
                  <b>Leche, 7 días</b>
                  <Delta c={c.milk} />
                </span>
                <Bars c={c.milk} unit="L" />
                {line && (
                  <svg
                    viewBox="0 0 140 34"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Litros por día, últimos 14 días"
                  >
                    <path d={line} />
                  </svg>
                )}
              </div>
            )}
            {c.weight && (
              <div className="av-metric">
                <span className="av-farm-head">
                  <b>Peso</b>
                  <Delta c={c.weight} />
                </span>
                {c.weight.beforeOn ? (
                  <Bars c={c.weight} unit="kg" />
                ) : (
                  <span>
                    {num(c.weight.now)} kg el {fecha(c.weight.on)}
                  </span>
                )}
              </div>
            )}
            {(c.served || c.health) && (
              <p className="av-last">
                {c.served && <span>Último servicio: {fecha(c.served)}</span>}
                {c.health && (
                  <span>
                    Último manejo sanitario: {c.health.product} · {fecha(c.health.on)}
                  </span>
                )}
              </p>
            )}
          </article>
        );
      })}
      {tags.length > limit && (
        <button
          type="button"
          className="btn btn-ghost av-more"
          onClick={() => setLimit((l) => l + 6)}
        >
          Ver {tags.length - limit} animales más
        </button>
      )}
    </div>
  );
}
