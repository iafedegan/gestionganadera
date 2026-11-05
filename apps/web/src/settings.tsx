import {
  Bluetooth,
  CheckCircle2,
  MapPin,
  Nfc,
  Radio,
  ScanLine,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FarmsCard } from "./FarmForm";
import { TeamPanel } from "./TeamPanel";
import { CardHead, PageHead } from "./components";
import {
  type TagRead,
  captureWedge,
  describeIso11784,
  detectCapabilities,
  scanNfc,
} from "./lib/reader";
import { useApp } from "./state";

const KEY = "gg.lecturas";

function loadReads(): TagRead[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as TagRead[];
    return Array.isArray(v) ? v.slice(0, 20) : [];
  } catch {
    return [];
  }
}
function saveReads(v: TagRead[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v.slice(0, 20)));
  } catch {
    /* sin almacenamiento: la lista vive solo en pantalla */
  }
}

function Support({ ok, label, hint }: { ok: boolean; label: ReactNode; hint: string }) {
  return (
    <li className="dev-row">
      {ok ? (
        <CheckCircle2 size={20} className="dev-ok" aria-hidden="true" />
      ) : (
        <XCircle size={20} className="dev-no" aria-hidden="true" />
      )}
      <span className="dev-text">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className={ok ? "chip chip-ok" : "chip chip-soon"}>{ok ? "Disponible" : "No"}</span>
    </li>
  );
}

const TECH: { icon: ReactNode; name: string; use: string; reach: string; note: string }[] = [
  {
    icon: <Nfc size={22} aria-hidden="true" />,
    name: "NFC (13,56 MHz)",
    use: "Hoja de vida en el corral: acercar el celular a la chapeta o al collar.",
    reach: "2–4 cm",
    note: "Funciona sin bastón. Android con Chrome; iPhone no lo permite desde una app web.",
  },
  {
    icon: <Radio size={22} aria-hidden="true" />,
    name: "RFID baja frecuencia (134,2 kHz, ISO 11784/5)",
    use: "Identificación oficial del animal: botón, chapeta o bolo ruminal con bastón lector.",
    reach: "10–60 cm",
    note: "Es la base del DIN colombiano. El bastón Bluetooth o USB escribe el código como un teclado.",
  },
  {
    icon: <ScanLine size={22} aria-hidden="true" />,
    name: "RFID UHF (860–960 MHz)",
    use: "Conteo masivo en mangas, básculas y portales de embarque.",
    reach: "1–6 m",
    note: "Requiere lector fijo y antena; se integra por red con el servidor de la finca.",
  },
  {
    icon: <MapPin size={22} aria-hidden="true" />,
    name: "GPS, BLE y LoRaWAN",
    use: "Posición del lote y localización de animales con collar; alertas de salida de potrero.",
    reach: "Potrero a finca",
    note: "Se recibe en el servidor y se muestra en Pasturas. Collares y pasarelas LoRa de terceros.",
  },
  {
    icon: <ScanLine size={22} aria-hidden="true" />,
    name: "Código QR",
    use: "Respaldo universal para chapetas y fichas impresas; no necesita pilas ni lector especial.",
    reach: "Visual",
    note: "Previsto para iPhone, donde NFC web no está disponible.",
  },
];

export function SettingsScreen() {
  const { notify } = useApp();
  const [caps] = useState(detectCapabilities);
  const [reads, setReads] = useState<TagRead[]>(loadReads);
  const [scanning, setScanning] = useState(false);
  const [wedge, setWedge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  function add(r: TagRead) {
    setReads((prev) => {
      const next = [r, ...prev.filter((x) => x.code !== r.code)].slice(0, 20);
      saveReads(next);
      return next;
    });
    notify(`Lectura ${r.code}`, "ok");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: add solo usa estado funcional
  useEffect(() => {
    if (!wedge) return;
    return captureWedge(add);
  }, [wedge]);

  useEffect(() => () => abort.current?.abort(), []);

  async function readNfc() {
    setError(null);
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setScanning(true);
    try {
      add(await scanNfc(ac.signal));
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Se negó el permiso de NFC. Actívelo en los permisos del sitio."
            : (e as Error).message || "No se pudo iniciar la lectura NFC.",
        );
      }
    } finally {
      ac.abort();
      setScanning(false);
    }
  }

  return (
    <section className="page">
      <PageHead
        kicker="Configuración"
        icon={<Settings size={30} aria-hidden="true" />}
        title="Configuración"
        lead="Sus fincas y los dispositivos de identificación: lea la chapeta o el chip del animal para abrir su hoja de vida o registrarlo sin escribir."
      />

      <TeamPanel />

      <FarmsCard />

      <div className="settings-grid">
        <article className="card">
          <CardHead
            icon={<Smartphone size={24} aria-hidden="true" />}
            title="Este dispositivo"
            sub="Lo que su celular o computador permite hoy."
          />
          <ul className="dev-list">
            <Support
              ok={caps.nfc}
              label="Lectura NFC"
              hint={
                caps.nfc
                  ? "Acerque el celular a la etiqueta."
                  : "Use Chrome en un Android con NFC. En iPhone, use el bastón RFID o escriba el código."
              }
            />
            <Support
              ok={caps.bluetooth}
              label="Bluetooth (BLE)"
              hint="Para lectores y básculas con perfil BLE. Los bastones clásicos funcionan como teclado."
            />
            <Support
              ok={caps.geolocation}
              label="Ubicación (GPS)"
              hint="Posición del celular al registrar un evento."
            />
            <Support
              ok={caps.secure}
              label="Conexión segura (HTTPS)"
              hint="Obligatoria para NFC, Bluetooth y GPS fuera de localhost."
            />
          </ul>
        </article>

        <article className="card">
          <CardHead
            icon={<Nfc size={24} aria-hidden="true" />}
            title="Probar lectura"
            sub="Compruebe su lector antes de salir al potrero."
          />
          <div className="dev-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!caps.nfc || scanning}
              onClick={() => void readNfc()}
            >
              <Nfc size={18} aria-hidden="true" /> {scanning ? "Acerque la etiqueta…" : "Leer NFC"}
            </button>
            <label className="switch-row">
              <input type="checkbox" checked={wedge} onChange={(e) => setWedge(e.target.checked)} />
              <span>
                <strong>Escuchar bastón RFID</strong>
                <small>Conecte el bastón por Bluetooth o USB y pase el chip.</small>
              </span>
            </label>
          </div>
          {error && (
            <p className="banner banner-warn" role="alert">
              {error}
            </p>
          )}
          <h3 className="dev-sub">Últimas lecturas</h3>
          {reads.length === 0 ? (
            <p className="hint">Aún no hay lecturas en este dispositivo.</p>
          ) : (
            <ul className="dev-list">
              {reads.map((r) => (
                <li key={r.code} className="dev-row">
                  <ShieldCheck size={20} className="dev-ok" aria-hidden="true" />
                  <span className="dev-text">
                    <strong className="mono">{r.code}</strong>
                    <small>
                      {describeIso11784(r.code) ?? "Código de etiqueta"} ·{" "}
                      {new Date(r.at).toLocaleTimeString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                  <span className="chip">{r.source}</span>
                </li>
              ))}
            </ul>
          )}
          {reads.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setReads([]);
                saveReads([]);
              }}
            >
              <Trash2 size={16} aria-hidden="true" /> Borrar lecturas
            </button>
          )}
        </article>
      </div>

      <article className="card">
        <CardHead
          icon={<Radio size={24} aria-hidden="true" />}
          title="Tecnologías de identificación y posición"
          sub="Qué usar según lo que quiere lograr. La hoja de vida siempre se enlaza por el código del animal."
        />
        <ul className="tech-list">
          {TECH.map((t) => (
            <li key={t.name}>
              <span className="tech-icon">{t.icon}</span>
              <div>
                <strong>{t.name}</strong>
                <p>{t.use}</p>
                <small>
                  Alcance {t.reach} · {t.note}
                </small>
              </div>
            </li>
          ))}
        </ul>
        <p className="hint">
          <Bluetooth size={14} aria-hidden="true" /> La integración con lectores UHF fijos, collares
          GPS y pasarelas LoRaWAN llega en una fase posterior; hoy el sistema ya lee NFC y bastones
          tipo teclado.
        </p>
      </article>
    </section>
  );
}
