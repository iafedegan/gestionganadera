import { inflateSync } from "node:zlib";

/**
 * Revisión de pérdida de cobertura arbórea dentro del lindero de una finca (trazabilidad libre de
 * deforestación: Ley 2585 de 2026 y Reglamento (UE) 2023/1115, fecha de corte 31-dic-2020).
 *
 * Fuente: capa pública de pérdida de cobertura arbórea de Global Forest Watch (Hansen/UMD/Google/
 * USGS/NASA). Sus teselas codifican cada píxel así: alfa > 0 si hubo pérdida, canal azul = año de
 * la pérdida menos 2000 (1 = 2001 … 25 = 2025) y canal rojo = intensidad. Se cuentan los píxeles
 * cuyo centro cae dentro del lindero. Es una alerta satelital, no un concepto legal: la pérdida de
 * cobertura incluye cosechas forestales, incendios o errores, y debe revisarla un técnico.
 */

export const CUTOFF_YEAR = 2020;
const TILE = 512;
const EARTH = 40_075_016.686;
const BASE = "https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/dynamic";

/* ───────────── PNG (RGBA de 8 bits, sin entrelazado: lo que sirve la capa) ───────────── */

export interface Image {
  width: number;
  height: number;
  /** RGBA, 4 bytes por píxel. */
  data: Uint8Array;
}

export function decodePng(buf: Uint8Array): Image {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || sig.some((b, i) => buf[i] !== b)) throw new Error("no es PNG");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const [depth, color, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || color !== 6 || interlace !== 0) throw new Error("PNG no soportado");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error("PNG sin cabecera");
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) throw new Error("PNG incompleto");
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[src + x] as number;
      const a = x >= bpp ? (out[row + x - bpp] as number) : 0;
      const b = y > 0 ? (out[row - stride + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (out[row - stride + x - bpp] as number) : 0;
      let v = cur;
      if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + b;
      else if (filter === 3) v = cur + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[row + x] = v & 255;
    }
  }
  return { width, height, data: out };
}

/* ───────────── Geometría ───────────── */

/** Punto [latitud, longitud]. */
export type Pt = [number, number];

export function lonToTileX(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}
export function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
function tileXToLon(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}
function tileYToLat(y: number, z: number) {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** El punto (lat, lon) cae dentro del anillo (regla par-impar). */
export function inside(lat: number, lon: number, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i] as Pt;
    const [yj, xj] = ring[j] as Pt;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Área del anillo en hectáreas (proyección local; error despreciable a escala de finca). */
export function ringAreaHa(ring: Pt[]): number {
  const lat0 = (ring.reduce((s, p) => s + p[0], 0) / ring.length) * (Math.PI / 180);
  const mx = (EARTH / 360) * Math.cos(lat0);
  const my = EARTH / 360;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i] as Pt;
    const [yj, xj] = ring[j] as Pt;
    a += xj * mx * (yi * my) - xi * mx * (yj * my);
  }
  return Math.abs(a / 2) / 10_000;
}

/* ───────────── Cruce del lindero con la capa ───────────── */

export interface ForestLossResult {
  checkedAt: string;
  source: string;
  /** Versión de la capa (p. ej. «v1.13»). */
  version: string;
  areaHa: number;
  /** Pérdida dentro del lindero después del corte (2021 en adelante). */
  lossAfterCutoffHa: number;
  /** Pérdida antes del corte (2001–2020): informativa, no afecta la regla de la UE. */
  lossBeforeCutoffHa: number;
  /** Hectáreas por año desde 2021. */
  byYear: Record<string, number>;
  /** Zoom y tamaño de píxel usados (para el soporte). */
  zoom: number;
  pixelHa: number;
}

export interface ForestLossOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Tope de teselas por revisión (evita abusar de la fuente con linderos enormes). */
  maxTiles?: number;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export async function forestLoss(
  boundary: Pt[],
  opts: ForestLossOptions = {},
): Promise<ForestLossResult> {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  const maxTiles = opts.maxTiles ?? 16;
  const lats = boundary.map((p) => p[0]);
  const lons = boundary.map((p) => p[1]);
  const [minLat, maxLat, minLon, maxLon] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lons),
    Math.max(...lons),
  ];

  // El mayor detalle (zoom 12, ~19 m por píxel en el trópico) que quepa en el tope de teselas.
  let z = 12;
  const range = (zz: number) => ({
    x0: Math.floor(lonToTileX(minLon, zz)),
    x1: Math.floor(lonToTileX(maxLon, zz)),
    y0: Math.floor(latToTileY(maxLat, zz)),
    y1: Math.floor(latToTileY(minLat, zz)),
  });
  let r = range(z);
  while (z > 8 && (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > maxTiles) r = range(--z);

  const lastYear = now().getUTCFullYear() - 2000;
  const counts = new Map<number, number>();
  let version = "latest";
  let pixelM2Sum = 0;
  let pixelsInside = 0;

  for (let tx = r.x0; tx <= r.x1; tx++) {
    for (let ty = r.y0; ty <= r.y1; ty++) {
      const res = await doFetch(`${BASE}/${z}/${tx}/${ty}.png`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`capa de bosque respondió ${res.status}`);
      version = /\/(v\d+\.\d+)\//.exec(res.url)?.[1] ?? version;
      const img = decodePng(new Uint8Array(await res.arrayBuffer()));
      const scale = img.width;
      for (let py = 0; py < img.height; py++) {
        const lat = tileYToLat(ty + (py + 0.5) / scale, z);
        if (lat < minLat || lat > maxLat) continue;
        const pxM = (EARTH * Math.cos((lat * Math.PI) / 180)) / (scale * 2 ** z);
        for (let px = 0; px < img.width; px++) {
          const lon = tileXToLon(tx + (px + 0.5) / scale, z);
          if (lon < minLon || lon > maxLon || !inside(lat, lon, boundary)) continue;
          pixelsInside++;
          pixelM2Sum += pxM * pxM;
          const i = (py * img.width + px) * 4;
          const alpha = img.data[i + 3] as number;
          const year = img.data[i + 2] as number;
          if (alpha > 0 && year >= 1 && year <= lastYear)
            counts.set(year, (counts.get(year) ?? 0) + pxM * pxM);
        }
      }
    }
  }

  const byYear: Record<string, number> = {};
  let after = 0;
  let before = 0;
  for (const [y, m2] of [...counts].sort((a, b) => a[0] - b[0])) {
    const ha = m2 / 10_000;
    if (y + 2000 > CUTOFF_YEAR) {
      byYear[String(y + 2000)] = round(ha);
      after += ha;
    } else before += ha;
  }
  return {
    checkedAt: now().toISOString(),
    source: "Global Forest Watch · pérdida de cobertura arbórea (Hansen/UMD/Google/USGS/NASA)",
    version,
    areaHa: round(ringAreaHa(boundary)),
    lossAfterCutoffHa: round(after),
    lossBeforeCutoffHa: round(before),
    byYear,
    zoom: z,
    pixelHa: pixelsInside ? round(pixelM2Sum / pixelsInside / 10_000, 4) : 0,
  };
}
