import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { can, uuidv7 } from "@ganaderia/domain";
import {
  Crosshair,
  Download,
  Footprints,
  MapPin,
  Pencil,
  Scissors,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FORAGES } from "./herd";
import { Badge, FormDialog, downloadCsv, num } from "./kit";
import { api } from "./lib/api";
import { type LocalFarmMap, localdb } from "./lib/localdb";
import { useApp } from "./state";

/**
 * Mapa de la finca: linderos y potreros dibujados sobre imagen satelital, a mano o caminando con
 * el GPS del celular. Los dibujos se guardan en este dispositivo; los mosaicos del mapa necesitan internet.
 */

type Pt = [number, number]; // [lat, lng]
interface Potrero {
  id: string;
  nombre: string;
  forraje: string;
  pts: Pt[];
}
interface MapData {
  lindero: Pt[] | null;
  potreros: Potrero[];
}
type Mode = "ver" | "lindero" | "potrero" | "dividir";

const KEY = "gg.mapa";
const R = 6378137;

/** Área geodésica aproximada de un polígono en hectáreas. */
export function areaHa(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [la1, lo1] = pts[i] as Pt;
    const [la2, lo2] = pts[(i + 1) % pts.length] as Pt;
    s +=
      (((lo2 - lo1) * Math.PI) / 180) *
      (2 + Math.sin((la1 * Math.PI) / 180) + Math.sin((la2 * Math.PI) / 180));
  }
  return Math.abs((s * R * R) / 2) / 10000;
}
const perimeterM = (pts: Pt[]) =>
  pts.reduce((s, p, i) => s + L.latLng(p).distanceTo(L.latLng(pts[(i + 1) % pts.length] as Pt)), 0);

/** Divide un polígono con la recta que pasa por a y b. Devuelve dos polígonos o null. */
function splitPolygon(poly: Pt[], a: Pt, b: Pt): [Pt[], Pt[]] | null {
  const side = (p: Pt) => (b[1] - a[1]) * (p[0] - a[0]) - (b[0] - a[0]) * (p[1] - a[1]);
  const left: Pt[] = [];
  const right: Pt[] = [];
  let cuts = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    const sp = side(p);
    const sq = side(q);
    (sp >= 0 ? left : right).push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      const x: Pt = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      left.push(x);
      right.push(x);
      cuts++;
    }
  }
  return cuts >= 2 && left.length >= 3 && right.length >= 3 ? [left, right] : null;
}

/** Finca de ejemplo en el Caribe colombiano, dividida en potreros. */
function demo(): MapData {
  const o: Pt = [8.4705, -75.7312];
  const dLat = 0.0057; // ≈ 630 m
  const dLng = 0.0059; // ≈ 650 m
  const lindero: Pt[] = [
    o,
    [o[0], o[1] + dLng],
    [o[0] + dLat, o[1] + dLng * 1.04],
    [o[0] + dLat * 1.02, o[1] - dLng * 0.02],
  ];
  const names = [
    "La Loma 1",
    "La Loma 2",
    "La Loma 3",
    "Potrero Sur",
    "Potrero Norte",
    "El Bajo 1",
    "El Bajo 2",
    "Banco de forraje",
  ];
  const forr = [
    "Mombasa (Megathyrsus)",
    "Mombasa (Megathyrsus)",
    "Mombasa (Megathyrsus)",
    "Brachiaria brizantha",
    "Estrella (Cynodon)",
    "Brachiaria humidicola",
    "Brachiaria humidicola",
    "Pasto elefante",
  ];
  const potreros: Potrero[] = names.map((n, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const la = o[0] + 0.0003 + row * (dLat / 2);
    const lo = o[1] + 0.0003 + col * (dLng / 4);
    const h = dLat / 2 - 0.0005;
    const w = dLng / 4 - 0.0005;
    return {
      id: `P${i + 1}`,
      nombre: n,
      forraje: forr[i] ?? "Brachiaria brizantha",
      pts: [
        [la, lo],
        [la, lo + w],
        [la + h, lo + w],
        [la + h, lo],
      ],
    };
  });
  return { lindero, potreros };
}

function load(): MapData {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as MapData | null;
    return v && Array.isArray(v.potreros) ? v : demo();
  } catch {
    return demo();
  }
}

/** Mensaje según la causa real del fallo de ubicación. */
function geoErrorMessage(e: GeolocationPositionError) {
  if (e.code === e.PERMISSION_DENIED)
    return "El permiso de ubicación está bloqueado. Actívelo en los ajustes del navegador.";
  return "No se pudo determinar su posición en este momento. Si está bajo techo, salga a cielo abierto e intente de nuevo.";
}

/** Roce tolerado entre rótulos vecinos antes de ocultar uno. */
const LABEL_OVERLAP_PX = 4;

/** Oculta los rótulos que chocan con otro ya visible; el orden de dibujo decide cuál queda. */
function declutterLabels(m: L.Map | null) {
  if (!m) return;
  const shown: DOMRect[] = [];
  for (const el of m.getContainer().querySelectorAll<HTMLElement>(".pd-label")) {
    const r = el.getBoundingClientRect();
    const hit = shown.some(
      (o) =>
        r.left < o.right - LABEL_OVERLAP_PX &&
        r.right > o.left + LABEL_OVERLAP_PX &&
        r.top < o.bottom - LABEL_OVERLAP_PX &&
        r.bottom > o.top + LABEL_OVERLAP_PX,
    );
    el.style.visibility = hit ? "hidden" : "";
    if (!hit) shown.push(r);
  }
}

const COLORS = [
  "#2e9e5b",
  "#3b82c4",
  "#d4a017",
  "#8b5cf6",
  "#e07a3f",
  "#14b8a6",
  "#c2410c",
  "#65a30d",
];

export function FarmMap() {
  const { notify, orgId, online, syncNow, dataVersion, role, session } = useApp();
  const canEdit = role ? can(role, "farm.write") : false;
  const [farmId, setFarmId] = useState<string | null>(null);
  const [meta, setMeta] = useState<LocalFarmMap | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const gpsLayer = useRef<L.LayerGroup | null>(null);
  const watch = useRef<number | null>(null);
  const [data, setData] = useState<MapData>(load);
  const [mode, setMode] = useState<Mode>("ver");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [pos, setPos] = useState<{ p: Pt; acc: number } | null>(null);
  const [naming, setNaming] = useState<Pt[] | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const fitted = useRef(false);
  const fitTo = (d: MapData) => {
    const all = [...(d.lindero ?? []), ...d.potreros.flatMap((p) => p.pts)];
    if (map.current && all.length)
      map.current.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
  };

  // Mapa guardado (servidor o cambios locales): se recarga tras cada sincronización.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recarga por organización y versión de datos
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    void (async () => {
      const farms = await localdb.listFarms(orgId);
      const f = farmId ?? farms[0]?.id ?? null;
      if (!live || !f) return;
      setFarmId(f);
      const m = await localdb.getFarmMap(f);
      if (!live || modeRef.current !== "ver") return;
      setMeta(m);
      if (m) {
        const d: MapData = {
          lindero: m.boundary,
          potreros: m.paddocks.map((x) => ({
            id: x.id,
            nombre: x.name,
            forraje: x.forage,
            pts: x.points,
          })),
        };
        setData(d);
        if (!fitted.current) {
          fitted.current = true;
          setTimeout(() => fitTo(d), 300);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [orgId, dataVersion]);

  const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
  const save = (d: MapData) => {
    setData(d);
    if (!orgId || !farmId || !canEdit) return;
    void localdb
      .enqueueFarmMap({
        orgId,
        updatedBy: session?.displayName ?? "",
        command: {
          id: uuidv7(),
          type: "farm.map.save",
          clientTs: new Date().toISOString(),
          payload: {
            farmId,
            baseRevision:
              meta && meta.syncState !== "pendiente" && meta.syncState !== "sincronizado"
                ? meta.serverRevision
                : (meta?.revision ?? 0),
            boundary:
              d.lindero && d.lindero.length >= 3
                ? d.lindero.map(([a, b]) => [r7(a), r7(b)] as Pt)
                : null,
            paddocks: d.potreros.map((x) => ({
              id: x.id.slice(0, 40),
              name: x.nombre,
              forage: x.forraje,
              points: x.pts.map(([a, b]) => [r7(a), r7(b)] as Pt),
            })),
          },
        },
      })
      .then(async () => {
        setMeta(await localdb.getFarmMap(farmId));
        if (online) void syncNow();
      });
  };

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
      },
    );
    const calles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });
    sat.addTo(m);
    L.control
      .layers({ Satélite: sat, Calles: calles }, undefined, { position: "topright" })
      .addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    gpsLayer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (modeRef.current === "ver") return;
      setDraft((d) => [...d, [e.latlng.lat, e.latlng.lng]]);
    });
    map.current = m;
    const d = load();
    const all = [...(d.lindero ?? []), ...d.potreros.flatMap((p) => p.pts)];
    const fit = () => {
      m.invalidateSize();
      if (all.length) m.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
      else m.setView([4.6, -74.1], 6);
    };
    fit();
    setTimeout(fit, 250);
    const relayout = () => declutterLabels(m);
    m.on("zoomend moveend", relayout);
    return () => {
      m.off("zoomend moveend", relayout);
      m.remove();
      map.current = null;
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    };
  }, []);

  // Redibujar
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (data.lindero && data.lindero.length >= 3) {
      L.polygon(data.lindero, {
        color: "#facc15",
        weight: 3,
        dashArray: "8 6",
        fill: false,
        interactive: false,
      }).addTo(g);
    }
    data.potreros.forEach((p, i) => {
      const color = COLORS[i % COLORS.length] ?? "#2e9e5b";
      const poly = L.polygon(p.pts, {
        color: p.id === sel ? "#ffffff" : color,
        weight: p.id === sel ? 4 : 2,
        fillColor: color,
        fillOpacity: p.id === sel ? 0.5 : 0.32,
      });
      poly.bindTooltip(`<b>${p.nombre}</b><br>${num(areaHa(p.pts), 2)} ha`, {
        permanent: true,
        direction: "center",
        className: "pd-label",
      });
      poly.on("click", (e) => {
        if (modeRef.current !== "ver") return;
        L.DomEvent.stopPropagation(e);
        setSel(p.id);
      });
      poly.addTo(g);
    });
    declutterLabels(map.current);
    if (draft.length) {
      const color = mode === "lindero" ? "#facc15" : mode === "dividir" ? "#ef4444" : "#ffffff";
      L.polyline(
        mode === "dividir" ? draft : [...draft, ...(draft.length >= 3 ? [draft[0] as Pt] : [])],
        { color, weight: 3, dashArray: "4 4" },
      ).addTo(g);
      for (const p of draft)
        L.circleMarker(p, { radius: 5, color, fillColor: color, fillOpacity: 1 }).addTo(g);
    }
  }, [data, draft, sel, mode]);

  // Posición GPS
  useEffect(() => {
    const g = gpsLayer.current;
    if (!g) return;
    g.clearLayers();
    if (pos) {
      L.circle(pos.p, { radius: pos.acc, color: "#3b82f6", weight: 1, fillOpacity: 0.12 }).addTo(g);
      L.circleMarker(pos.p, {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 1,
      }).addTo(g);
    }
  }, [pos]);

  // Dividir al marcar el segundo punto
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona al dibujo de la línea
  useEffect(() => {
    if (mode !== "dividir" || draft.length < 2) return;
    const target = data.potreros.find((p) => p.id === sel);
    const a = draft[0] as Pt;
    const b = draft[1] as Pt;
    setDraft([]);
    setMode("ver");
    if (!target) return;
    const parts = splitPolygon(target.pts, a, b);
    if (!parts) {
      notify("La línea debe cruzar el potrero de lado a lado.", "warn");
      return;
    }
    save({
      ...data,
      potreros: data.potreros.flatMap((p) =>
        p.id === target.id
          ? [
              { ...p, id: `${p.id}a`, nombre: `${p.nombre} A`, pts: parts[0] },
              { ...p, id: `${p.id}b`, nombre: `${p.nombre} B`, pts: parts[1] },
            ]
          : [p],
      ),
    });
    setSel(null);
    notify(`${target.nombre} quedó dividido en dos potreros.`, "ok");
  }, [draft, mode]);

  function locate(follow = true) {
    if (!("geolocation" in navigator)) {
      notify("Este dispositivo no tiene GPS disponible.", "warn");
      return;
    }
    const found = (g: GeolocationPosition) => {
      const p: Pt = [g.coords.latitude, g.coords.longitude];
      setPos({ p, acc: g.coords.accuracy });
      if (follow) map.current?.setView(p, 17);
    };
    const failed = (e: GeolocationPositionError) => {
      if (!follow || e.code === e.PERMISSION_DENIED) {
        notify(geoErrorMessage(e), "warn");
        return;
      }
      // Último recurso: centra el mapa por IP. No toca `pos` para que nunca se marque como punto.
      api
        .approxLocation()
        .then(({ lat, lng }) => {
          map.current?.setView([lat, lng], 12);
          notify(
            "Sin GPS en este dispositivo. El mapa se centró en su zona aproximada según su conexión, que puede variar varios kilómetros.",
            "warn",
          );
        })
        .catch(() => notify(geoErrorMessage(e), "warn"));
    };
    navigator.geolocation.getCurrentPosition(
      found,
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          failed(e);
          return;
        }
        // Sin señal precisa: reintenta con Wi-Fi o red móvil antes de avisar.
        navigator.geolocation.getCurrentPosition(found, failed, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
        });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function toggleWalk() {
    if (walking) {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      setWalking(false);
      return;
    }
    if (mode === "ver" || mode === "dividir") setMode("lindero");
    setWalking(true);
    watch.current = navigator.geolocation.watchPosition(
      (g) => {
        const p: Pt = [g.coords.latitude, g.coords.longitude];
        setPos({ p, acc: g.coords.accuracy });
        map.current?.panTo(p);
        if (g.coords.accuracy > 30) return;
        setDraft((d) => {
          const last = d[d.length - 1];
          return !last || L.latLng(last).distanceTo(L.latLng(p)) >= 5 ? [...d, p] : d;
        });
      },
      (e) => {
        notify(geoErrorMessage(e), "warn");
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        setWalking(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
  }

  function addHere() {
    if (pos) setDraft((d) => [...d, pos.p]);
    else locate(false);
  }

  function finish() {
    if (draft.length < 3) {
      notify("Marque al menos tres puntos.", "warn");
      return;
    }
    if (walking) toggleWalk();
    if (mode === "lindero") {
      save({ ...data, lindero: draft });
      notify(`Lindero guardado: ${num(areaHa(draft), 2)} ha.`, "ok");
      setDraft([]);
      setMode("ver");
    } else {
      setNaming(draft);
    }
  }

  function exportGeo() {
    const fc = {
      type: "FeatureCollection",
      features: [
        ...(data.lindero
          ? [
              {
                type: "Feature",
                properties: { tipo: "lindero", area_ha: areaHa(data.lindero) },
                geometry: {
                  type: "Polygon",
                  coordinates: [[...data.lindero, data.lindero[0]].map((p) => [p?.[1], p?.[0]])],
                },
              },
            ]
          : []),
        ...data.potreros.map((p) => ({
          type: "Feature",
          properties: {
            tipo: "potrero",
            nombre: p.nombre,
            forraje: p.forraje,
            area_ha: areaHa(p.pts),
          },
          geometry: {
            type: "Polygon",
            coordinates: [[...p.pts, p.pts[0]].map((q) => [q?.[1], q?.[0]])],
          },
        })),
      ],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "finca.geojson";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importGeo(file: File) {
    file.text().then((t) => {
      try {
        const fc = JSON.parse(t) as {
          features?: {
            properties?: Record<string, unknown>;
            geometry?: { type?: string; coordinates?: number[][][] };
          }[];
        };
        const feats = (fc.features ?? []).filter((f) => f.geometry?.type === "Polygon");
        const toPts = (c: number[][] | undefined): Pt[] =>
          (c ?? [])
            .slice(0, -1)
            .map((x) => [Number(x[1]), Number(x[0])] as Pt)
            .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        const lind = feats.find((f) => f.properties?.tipo === "lindero");
        const pots = feats.filter((f) => f !== lind);
        if (!feats.length) throw new Error("sin polígonos");
        const d: MapData = {
          lindero: lind ? toPts(lind.geometry?.coordinates?.[0]) : data.lindero,
          potreros: pots
            .map((f, i) => ({
              id: `I${i + 1}`,
              nombre: String(f.properties?.nombre ?? `Potrero ${i + 1}`).slice(0, 60),
              forraje: String(f.properties?.forraje ?? "Brachiaria brizantha").slice(0, 60),
              pts: toPts(f.geometry?.coordinates?.[0]),
            }))
            .filter((p) => p.pts.length >= 3),
        };
        save(d);
        const all = [...(d.lindero ?? []), ...d.potreros.flatMap((p) => p.pts)];
        if (all.length) map.current?.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
        notify(`Se importaron ${d.potreros.length} potreros.`, "ok");
      } catch {
        notify("El archivo no es un GeoJSON de polígonos válido.", "warn");
      }
    });
  }

  const linderoHa = data.lindero ? areaHa(data.lindero) : 0;
  const potrerosHa = data.potreros.reduce((s, p) => s + areaHa(p.pts), 0);
  const selected = data.potreros.find((p) => p.id === sel);

  const hint =
    mode === "lindero"
      ? walking
        ? "Caminando: se agrega un punto cada 5 metros con buena señal. Toque «Terminar» al cerrar el recorrido."
        : "Toque el mapa en cada esquina del lindero, o use «Caminar con GPS» o «Marcar mi posición»."
      : mode === "potrero"
        ? "Toque el mapa para trazar el potrero. Use «Deshacer» si se equivoca y «Terminar» para nombrarlo."
        : mode === "dividir"
          ? `Marque dos puntos que crucen ${selected?.nombre ?? "el potrero"} de lado a lado.`
          : "Toque un potrero para seleccionarlo. Cambie entre satélite y calles con el botón de capas.";

  return (
    <div className="farm-map-wrap">
      <div className="fm-toolbar">
        <div className="fm-group">
          <button
            type="button"
            className={mode === "lindero" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => {
              setMode("lindero");
              setDraft([]);
              setSel(null);
            }}
          >
            <MapPin size={16} aria-hidden="true" /> Lindero
          </button>
          <button
            type="button"
            className={mode === "potrero" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => {
              setMode("potrero");
              setDraft([]);
              setSel(null);
            }}
          >
            <Pencil size={16} aria-hidden="true" /> Dibujar potrero
          </button>
          <button
            type="button"
            className={mode === "dividir" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            disabled={!selected}
            onClick={() => {
              setMode("dividir");
              setDraft([]);
            }}
            title={selected ? "" : "Seleccione primero un potrero"}
          >
            <Scissors size={16} aria-hidden="true" /> Dividir
          </button>
        </div>
        <div className="fm-group">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => locate()}>
            <Crosshair size={16} aria-hidden="true" /> Mi ubicación
          </button>
          <button
            type="button"
            className={walking ? "btn btn-primary btn-sm pulse" : "btn btn-ghost btn-sm"}
            onClick={toggleWalk}
          >
            <Footprints size={16} aria-hidden="true" />{" "}
            {walking ? "Detener recorrido" : "Caminar con GPS"}
          </button>
          {mode !== "ver" && mode !== "dividir" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={addHere}>
              <MapPin size={16} aria-hidden="true" /> Marcar mi posición
            </button>
          )}
        </div>
      </div>
      <div className={`fm-status s-${meta?.syncState ?? "nuevo"}`}>
        {!canEdit ? (
          <span>Solo lectura: su perfil no puede editar el mapa.</span>
        ) : !meta ? (
          <span>Mapa de ejemplo, aún sin guardar. Al editarlo se guarda en el servidor.</span>
        ) : meta.syncState === "sincronizado" ? (
          <span>
            Guardado en el servidor · revisión {meta.revision}
            {meta.updatedBy ? ` · ${meta.updatedBy}` : ""}
          </span>
        ) : meta.syncState === "pendiente" ? (
          <span>Guardado en este dispositivo; se enviará al sincronizar.</span>
        ) : (
          <>
            <span>
              {meta.syncState === "conflicto"
                ? "Otro dispositivo cambió el mapa mientras usted lo editaba."
                : "El servidor rechazó el último cambio."}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(data)}>
              Conservar mis cambios
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (!farmId) return;
                void localdb.useServerFarmMap(farmId).then(async () => {
                  const m = await localdb.getFarmMap(farmId);
                  setMeta(m);
                  if (m)
                    setData({
                      lindero: m.boundary,
                      potreros: m.paddocks.map((x) => ({
                        id: x.id,
                        nombre: x.name,
                        forraje: x.forage,
                        pts: x.points,
                      })),
                    });
                });
              }}
            >
              Usar la del servidor
            </button>
          </>
        )}
        {canEdit && !meta && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save(data)}>
            Guardar este mapa
          </button>
        )}
      </div>
      <p className="hint fm-hint">{hint}</p>
      <div className="fm-stage">
        <div ref={el} className="farm-map" role="application" aria-label="Mapa de la finca" />
        {mode !== "ver" && mode !== "dividir" && (
          <div className="fm-draw-bar">
            <span>
              {draft.length} puntos{draft.length >= 3 ? ` · ${num(areaHa(draft), 2)} ha` : ""}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!draft.length}
              onClick={() => setDraft((d) => d.slice(0, -1))}
            >
              <Undo2 size={16} aria-hidden="true" /> Deshacer
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDraft([]);
                setMode("ver");
                if (walking) toggleWalk();
              }}
            >
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={finish}>
              Terminar
            </button>
          </div>
        )}
      </div>

      <div className="kit-grid2 fm-info">
        <article className="card">
          <h3 className="fsec-t">Finca</h3>
          <ul className="kit-facts big">
            <li>
              <span>Área dentro del lindero</span>
              <b>{data.lindero ? `${num(linderoHa, 2)} ha` : "Sin lindero"}</b>
            </li>
            <li>
              <span>Perímetro del lindero</span>
              <b>{data.lindero ? `${num(perimeterM(data.lindero), 0)} m` : "—"}</b>
            </li>
            <li>
              <span>Área en potreros</span>
              <b>
                {num(potrerosHa, 2)} ha ({data.potreros.length})
              </b>
            </li>
            <li>
              <span>Área sin potrero (vías, bosque, aguas)</span>
              <b>{data.lindero ? `${num(Math.max(0, linderoHa - potrerosHa), 2)} ha` : "—"}</b>
            </li>
          </ul>
          {data.lindero && potrerosHa > linderoHa * 1.02 && (
            <p className="hint neg">Los potreros suman más que el lindero: revise los dibujos.</p>
          )}
          <div className="fm-group">
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportGeo}>
              <Download size={16} aria-hidden="true" /> Exportar GeoJSON
            </button>
            <label className="btn btn-ghost btn-sm file-btn">
              <Upload size={16} aria-hidden="true" /> Importar GeoJSON
              <input
                type="file"
                accept=".geojson,.json,application/geo+json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importGeo(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                downloadCsv(
                  "potreros",
                  ["Potrero", "Forraje", "Área (ha)"],
                  data.potreros.map((p) => [p.nombre, p.forraje, Number(areaHa(p.pts).toFixed(2))]),
                )
              }
            >
              Exportar CSV
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Restablecer el mapa de ejemplo? Se borrarán sus dibujos en este dispositivo.",
                  )
                ) {
                  save(demo());
                  setSel(null);
                }
              }}
            >
              Mapa de ejemplo
            </button>
          </div>
        </article>
        <article className="card">
          <h3 className="fsec-t">Potreros dibujados</h3>
          <ul className="fm-list">
            {data.potreros.map((p, i) => (
              <li key={p.id} className={p.id === sel ? "on" : ""}>
                <button
                  type="button"
                  className="fm-item"
                  onClick={() => {
                    setSel(p.id);
                    map.current?.fitBounds(L.latLngBounds(p.pts), {
                      padding: [60, 60],
                      maxZoom: 18,
                    });
                  }}
                >
                  <i style={{ background: COLORS[i % COLORS.length] }} />
                  <span>
                    <b>{p.nombre}</b>
                    <small>{p.forraje}</small>
                  </span>
                  <Badge tone="verde">{num(areaHa(p.pts), 2)} ha</Badge>
                </button>
                {p.id === sel && (
                  <div className="fm-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const n = window.prompt("Nuevo nombre del potrero", p.nombre);
                        if (n?.trim())
                          save({
                            ...data,
                            potreros: data.potreros.map((x) =>
                              x.id === p.id ? { ...x, nombre: n.trim().slice(0, 60) } : x,
                            ),
                          });
                      }}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setMode("dividir");
                        setDraft([]);
                      }}
                    >
                      <Scissors size={14} aria-hidden="true" /> Dividir
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm danger"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar ${p.nombre}?`)) {
                          save({ ...data, potreros: data.potreros.filter((x) => x.id !== p.id) });
                          setSel(null);
                        }
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Eliminar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </article>
      </div>

      {naming && (
        <FormDialog
          open
          title="Nuevo potrero"
          sub={`${num(areaHa(naming), 2)} ha · ${naming.length} puntos`}
          fields={[
            {
              name: "nombre",
              label: "Nombre",
              type: "text",
              value: `Potrero ${data.potreros.length + 1}`,
            },
            {
              name: "forraje",
              label: "Forraje",
              type: "select",
              options: FORAGES.map((f) => f.name),
            },
          ]}
          onSubmit={(v) => {
            save({
              ...data,
              potreros: [
                ...data.potreros,
                {
                  id: `N${Date.now()}`,
                  nombre: (v.nombre ?? "Potrero").slice(0, 60),
                  forraje: v.forraje ?? "",
                  pts: naming,
                },
              ],
            });
            setNaming(null);
            setDraft([]);
            setMode("ver");
            notify("Potrero guardado.", "ok");
          }}
          onClose={() => setNaming(null)}
        />
      )}
    </div>
  );
}
