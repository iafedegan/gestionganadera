import {
  ANIMAL_HEADER,
  EXPORT_USE_LABEL,
  type ExportAnimal,
  type ExportUse,
  ICA_QUARANTINE_EMAIL,
  PREDIO_HEADER,
  type PredioInfo,
  animalListRows,
  embarkDeadlines,
  predioAnnexRows,
  restrictionFlags,
  solicitudText,
} from "@ganaderia/domain";
import { Download, Mail } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadCsv } from "./kit";
import { fecha, todayLocal } from "./labels";
import { type LocalFarm, type LocalHerdAnimal, localdb } from "./lib/localdb";
import { useApp } from "./state";

/**
 * Prepara los datos para exportar ganado en pie: el anexo de predios y el listado de animales de
 * la solicitud al ICA, y el texto del correo a Cuarentena. No presenta nada: eso lo hace el
 * exportador en los sistemas del ICA.
 */

const storeKey = (org: string) => `gg.export.${org}`;

interface Saved {
  predios: Record<string, Omit<PredioInfo, "farmId" | "name">>;
  embarque: string;
  puerto: string;
  buque: string;
  use: ExportUse;
  fobValue: string;
}

const EMPTY_PREDIO = { departamento: "", municipio: "", vereda: "", propietario: "" };

function load(org: string): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(storeKey(org)) ?? "{}") as Partial<Saved>;
  } catch {
    return {};
  }
}

export function ExportFormsDialog(props: { country: string; onClose(): void }) {
  const { orgId, session, notify } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [farms, setFarms] = useState<LocalFarm[]>([]);
  const [herd, setHerd] = useState<LocalHerdAnimal[]>([]);
  const saved = useMemo(() => load(orgId), [orgId]);
  const [predios, setPredios] = useState<Saved["predios"]>(saved.predios ?? {});
  const [embarque, setEmbarque] = useState(saved.embarque ?? "");
  const [puerto, setPuerto] = useState(saved.puerto ?? "");
  const [buque, setBuque] = useState(saved.buque ?? "");
  const [use, setUse] = useState<ExportUse>(saved.use ?? "sacrificio");
  const [fobValue, setFobValue] = useState(saved.fobValue ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    ref.current?.showModal();
    void localdb.listFarms(orgId).then(setFarms);
    void localdb.herdAnimals(orgId).then(setHerd);
  }, [orgId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storeKey(orgId),
        JSON.stringify({ predios, embarque, puerto, buque, use, fobValue }),
      );
    } catch {
      /* sin almacenamiento: los datos solo viven en pantalla */
    }
  }, [orgId, predios, embarque, puerto, buque, use, fobValue]);

  const today = todayLocal();
  const animals: ExportAnimal[] = herd.map((a) => ({
    tag: a.tag,
    species: a.species,
    sex: a.sex,
    category: a.category,
    birthDate: a.birthDate,
    farmId: a.farmId,
  }));
  const chosen = animals.filter((a) => picked.has(a.tag));
  const predioList: PredioInfo[] = farms.map((f) => ({
    farmId: f.id,
    name: f.name,
    ...EMPTY_PREDIO,
    municipio: f.locationText ?? "",
    ...predios[f.id],
  }));
  const flags = restrictionFlags(chosen, today);
  const farmNames = Object.fromEntries(farms.map((f) => [f.id, f.name]));
  const deadlines = embarque ? embarkDeadlines(embarque) : null;
  const late = deadlines ? deadlines.solicitud < today : false;

  const setPredio = (id: string, k: keyof typeof EMPTY_PREDIO, v: string) =>
    setPredios((p) => ({ ...p, [id]: { ...EMPTY_PREDIO, ...p[id], [k]: v } }));

  const missingPredio = predioAnnexRows(predioList, chosen).filter((r) =>
    r.slice(1, 4).some((x) => x.trim() === ""),
  ).length;
  const ready = chosen.length > 0 && embarque !== "";

  function toggle(tag: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(tag)) n.delete(tag);
      else n.add(tag);
      return n;
    });
  }

  const mail = () =>
    solicitudText({
      country: props.country,
      embarque,
      puerto,
      buque,
      use,
      fobValue,
      animals: chosen.length,
      species: [...new Set(chosen.map((a) => a.species))],
      contact: session?.displayName ?? "",
    });

  function close() {
    ref.current?.close();
    props.onClose();
  }

  return (
    <dialog ref={ref} className="dialog" onClose={props.onClose} aria-labelledby="xf-title">
      <div className="xf">
        <h2 id="xf-title">Preparar los formularios del ICA</h2>
        <p className="hint">
          Exportar ganado en pie a {props.country}. Aquí se arman los datos y los documentos; la
          solicitud, el certificado y el pago se hacen en los sistemas del ICA.
        </p>

        <h3 className="fsec-t">1. Embarque</h3>
        <div className="grid">
          <label>
            Fecha estimada de embarque
            <input type="date" value={embarque} onChange={(e) => setEmbarque(e.target.value)} />
          </label>
          <label>
            Uso de los animales
            <select value={use} onChange={(e) => setUse(e.target.value as ExportUse)}>
              {Object.entries(EXPORT_USE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Puerto de salida
            <input value={puerto} maxLength={80} onChange={(e) => setPuerto(e.target.value)} />
          </label>
          <label>
            Nombre del buque
            <input value={buque} maxLength={80} onChange={(e) => setBuque(e.target.value)} />
          </label>
          <label>
            Valor FOB total de los animales
            <input
              value={fobValue}
              maxLength={40}
              placeholder="Con su moneda, por ejemplo 250.000 USD"
              onChange={(e) => setFobValue(e.target.value)}
            />
          </label>
        </div>
        {deadlines && (
          <p className={late ? "form-error" : "hint"}>
            La autorización debe pedirse a más tardar el <b>{fecha(deadlines.solicitud)}</b> y la
            cuarentena de mínimo 30 días debe empezar a más tardar el{" "}
            <b>{fecha(deadlines.cuarentena)}</b>.{late && " Esa fecha ya pasó: mueva el embarque."}
          </p>
        )}

        <h3 className="fsec-t">2. Predios de origen</h3>
        {farms.length === 0 && <p className="hint">Primero registre su finca en Configuración.</p>}
        {predioList.map((p) => (
          <div key={p.farmId} className="xf-predio">
            <strong>{p.name}</strong>
            <div className="grid">
              {(
                [
                  ["departamento", "Departamento"],
                  ["municipio", "Municipio"],
                  ["vereda", "Vereda"],
                  ["propietario", "Propietario"],
                ] as const
              ).map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input
                    value={p[k]}
                    maxLength={80}
                    onChange={(e) => setPredio(p.farmId, k, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <h3 className="fsec-t">3. Animales a exportar ({chosen.length})</h3>
        <div className="xf-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPicked(new Set(herd.map((a) => a.tag)))}
          >
            Todos
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setPicked(new Set())}
          >
            Ninguno
          </button>
        </div>
        {herd.length === 0 ? (
          <p className="hint">Todavía no hay animales registrados.</p>
        ) : (
          <ul className="xf-animals">
            {herd.map((a) => (
              <li key={a.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={picked.has(a.tag)}
                    onChange={() => toggle(a.tag)}
                  />
                  <span>
                    {a.tag} · {a.category} · {a.sex}
                    {a.birthDate ? "" : " · sin fecha de nacimiento"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {(flags.young > 0 || flags.breedingFemales > 0 || flags.unknownAge > 0) && (
          <p className="banner banner-warn" role="alert">
            <span>
              En abril de 2026 el Gobierno anunció una restricción a exportar ganado en pie menor de
              dos años y vientres; no se confirmó que esté vigente. De los elegidos hay{" "}
              {flags.young} menores de 24 meses, {flags.breedingFemales} vacas o novillas y{" "}
              {flags.unknownAge} sin fecha de nacimiento. Consulte al Ministerio de Comercio y al
              ICA antes de comprometerlos.
            </span>
          </p>
        )}
        {missingPredio > 0 && (
          <p className="hint">
            Faltan departamento, municipio o vereda en {missingPredio} predio(s).
          </p>
        )}

        <h3 className="fsec-t">4. Documentos</h3>
        <div className="xf-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!ready}
            onClick={() =>
              downloadCsv("anexo-predios-ica", PREDIO_HEADER, predioAnnexRows(predioList, chosen))
            }
          >
            <Download size={16} aria-hidden="true" /> Anexo de predios
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!ready}
            onClick={() =>
              downloadCsv("animales-exportacion", ANIMAL_HEADER, animalListRows(chosen, farmNames))
            }
          >
            <Download size={16} aria-hidden="true" /> Listado de animales
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!ready}
            onClick={() => {
              const t = mail();
              void navigator.clipboard
                ?.writeText(`${t.subject}\n\n${t.body}`)
                .then(() => notify("Texto de la solicitud copiado.", "ok"))
                .catch(() => notify("No se pudo copiar el texto.", "warn"));
            }}
          >
            Copiar texto de la solicitud
          </button>
          {ready && (
            <a
              className="btn btn-ghost btn-sm"
              href={`mailto:${ICA_QUARANTINE_EMAIL}?subject=${encodeURIComponent(mail().subject)}&body=${encodeURIComponent(mail().body)}`}
            >
              <Mail size={16} aria-hidden="true" /> Abrir correo al ICA
            </a>
          )}
        </div>
        <p className="hint">
          Para el correo, adjunte los dos archivos que descargó. Revise todo antes de enviarlo: el
          correo se abre en su aplicación y no se envía solo.
        </p>

        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={close}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}
