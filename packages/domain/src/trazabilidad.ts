/**
 * Geolocalización de la finca para la debida diligencia del Reglamento (UE) 2023/1115 (productos
 * libres de deforestación): GeoJSON en WGS84, coordenadas [longitud, latitud] con 6 decimales y el
 * polígono cerrado y en sentido antihorario (RFC 7946). Las propiedades siguen la descripción del
 * archivo GeoJSON del sistema de información de la UE; conviene validarlas con el comprador.
 */

/** Punto [latitud, longitud] como lo guarda el mapa de la finca. */
export type LatLngPt = [number, number];

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Área de un anillo [lat, lng] en hectáreas (proyección local, suficiente a escala de finca). */
export function boundaryAreaHa(ring: LatLngPt[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ((ring.reduce((s, p) => s + p[0], 0) / ring.length) * Math.PI) / 180;
  const m = 40_075_016.686 / 360;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i] as LatLngPt;
    const [yj, xj] = ring[j] as LatLngPt;
    a += xj * Math.cos(lat0) * m * yi * m - xi * Math.cos(lat0) * m * yj * m;
  }
  return Math.round((Math.abs(a / 2) / 10_000) * 100) / 100;
}

export interface EudrPlace {
  producerName: string;
  /** Nombre de la finca (lugar de producción). */
  productionPlace: string;
  boundary: LatLngPt[] | null;
  /** Punto de la finca si no hay lindero (el reglamento lo admite para predios de hasta 4 ha). */
  point?: LatLngPt | null;
}

export function eudrGeoJson(places: EudrPlace[]) {
  const features = [];
  for (const p of places) {
    const props = {
      ProducerName: p.producerName,
      ProducerCountry: "CO",
      ProductionPlace: p.productionPlace,
    };
    if (p.boundary && p.boundary.length >= 3) {
      let ring = p.boundary.map(([lat, lng]) => [r6(lng), r6(lat)] as [number, number]);
      // Sentido antihorario: área con signo positiva (x = longitud, y = latitud).
      let signed = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        signed +=
          ((ring[j] as number[])[0] as number) * ((ring[i] as number[])[1] as number) -
          ((ring[i] as number[])[0] as number) * ((ring[j] as number[])[1] as number);
      if (signed < 0) ring = ring.reverse();
      const first = ring[0] as [number, number];
      const last = ring[ring.length - 1] as [number, number];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      features.push({
        type: "Feature" as const,
        properties: { ...props, Area: boundaryAreaHa(p.boundary) },
        geometry: { type: "Polygon" as const, coordinates: [ring] },
      });
    } else if (p.point) {
      features.push({
        type: "Feature" as const,
        properties: props,
        geometry: { type: "Point" as const, coordinates: [r6(p.point[1]), r6(p.point[0])] },
      });
    }
  }
  return { type: "FeatureCollection" as const, features };
}
