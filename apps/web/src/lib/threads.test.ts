import type { UrgentAlertDto } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import { buildThreads } from "./threads";

const alert = (id: string, extra: Partial<UrgentAlertDto>): UrgentAlertDto =>
  ({
    id,
    authorId: "ana",
    authorName: "Ana",
    message: `aviso ${id}`,
    createdAt: `2026-01-01T0${id}:00:00.000Z`,
    mine: false,
    canAck: true,
    attending: false,
    ackBy: null,
    lastMessage: null,
    ...extra,
  }) as UrgentAlertDto;

describe("conversaciones por persona", () => {
  it("el veterinario ve una por quien reportó, con lo pendiente primero", () => {
    const t = buildThreads([
      alert("3", { authorId: "luis", authorName: "Luis", ackBy: "Yo", attending: true }),
      alert("1", {}),
      alert("2", {}),
      alert("4", { authorId: "eva", ackBy: "Otro" }),
    ]);
    expect(t.map((x) => x.name)).toEqual(["Ana", "Luis"]);
    expect(t[0]?.alerts.map((a) => a.id)).toEqual(["1", "2"]);
    expect(t[0]?.pending).toHaveLength(2);
    expect(t[0]?.preview).toBe("aviso 2");
  });

  it("quien reporta ve a su veterinario", () => {
    const t = buildThreads([
      alert("1", { mine: true, ackBy: "Dra. Ruiz", ackById: "ruiz" }),
      alert("2", { mine: true }),
    ]);
    expect(t.map((x) => x.name).sort()).toEqual(["Dra. Ruiz", "Su veterinario"]);
    expect(t.every((x) => x.pending.length === 0)).toBe(true);
  });
});
