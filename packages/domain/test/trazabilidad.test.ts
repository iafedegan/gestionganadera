import { describe, expect, it } from "vitest";
import { type LatLngPt, boundaryAreaHa, eudrGeoJson } from "../src/trazabilidad";

describe("geolocalización para el Reglamento (UE) 2023/1115", () => {
  // Cuadro de ~1,1 km en sentido horario (como suele dibujarse a mano), sin cerrar.
  const cw: LatLngPt[] = [
    [8.71, -75.9],
    [8.71, -75.8899999],
    [8.7, -75.89],
    [8.7, -75.9],
  ];

  it("polígono cerrado, [longitud, latitud], 6 decimales y antihorario", () => {
    const g = eudrGeoJson([
      { producerName: "Ana Pérez", productionPlace: "El Roble", boundary: cw },
    ]);
    const f = g.features[0];
    expect(f?.geometry.type).toBe("Polygon");
    const ring = (f?.geometry.coordinates as number[][][])[0] as number[][];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
    expect(ring.some((p) => p[0] === -75.89 && p[1] === 8.71)).toBe(true);
    let signed = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      signed +=
        ((ring[j] as number[])[0] as number) * ((ring[i] as number[])[1] as number) -
        ((ring[i] as number[])[0] as number) * ((ring[j] as number[])[1] as number);
    expect(signed).toBeGreaterThan(0);
    expect(f?.properties).toMatchObject({
      ProducerName: "Ana Pérez",
      ProducerCountry: "CO",
      ProductionPlace: "El Roble",
    });
    expect((f?.properties as { Area: number }).Area).toBeGreaterThan(118);
  });

  it("sin lindero usa el punto de la finca; sin nada, no inventa geometría", () => {
    const g = eudrGeoJson([
      {
        producerName: "Beto",
        productionPlace: "La Loma",
        boundary: null,
        point: [8.123456789, -75.987654321],
      },
      { producerName: "Caro", productionPlace: "Sin datos", boundary: null },
    ]);
    expect(g.features).toHaveLength(1);
    expect(g.features[0]?.geometry).toEqual({ type: "Point", coordinates: [-75.987654, 8.123457] });
  });

  it("área en hectáreas", () => {
    expect(boundaryAreaHa([])).toBe(0);
    expect(boundaryAreaHa(cw)).toBeGreaterThan(118);
    expect(boundaryAreaHa(cw)).toBeLessThan(124);
  });
});
