import type { ChatContact, UrgentAlertDto } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import { buildChats } from "./chats";
import { type Thread, buildThreads } from "./threads";

const contact = (userId: string, at: string | null, unread = 0): ChatContact => ({
  userId,
  name: userId,
  avatar: null,
  role: "veterinario",
  organizationName: "Finca",
  unread,
  lastMessage: at ? { id: at, mine: false, preview: "hola", createdAt: at } : null,
  clearedAt: null,
});
const thread = (userId: string, at: string, pending: number): Thread => ({
  key: `u:${userId}`,
  userId,
  name: userId,
  alerts: [],
  pending: Array(pending).fill({}),
  preview: "urgencia",
  at,
});

describe("lista de chats", () => {
  it("una fila por persona: urgentes primero, luego lo reciente y al final los demás", () => {
    const rows = buildChats(
      [contact("ana", "2026-01-03", 2), contact("beto", null), contact("caro", "2026-01-01")],
      [thread("caro", "2026-01-02", 1)],
      () => 1,
    );
    expect(rows.map((r) => r.name)).toEqual(["caro", "ana", "beto"]);
    expect(rows[0]).toMatchObject({ preview: "urgencia", unread: 1 });
    expect(rows[1]).toMatchObject({ preview: "hola", unread: 2 });
  });

  it("un chat borrado no vuelve a mostrar lo viejo, pero sí lo que falta por atender", () => {
    const alert = (id: string, createdAt: string, ackBy: string | null) =>
      ({
        id,
        authorId: "vet",
        authorName: "vet",
        ackById: ackBy ? "yo" : null,
        ackBy,
        attending: ackBy !== null,
        mine: false,
        canAck: true,
        createdAt,
        lastMessage: null,
        message: id,
      }) as unknown as UrgentAlertDto;
    const threads = buildThreads([
      alert("vieja", "2026-01-01", "Yo"),
      alert("sin-atender", "2026-01-01", null),
    ]);
    const cleared = { ...contact("vet", null), clearedAt: "2026-01-02" };
    const [row] = buildChats([cleared], threads, () => 0);
    expect(row?.alerts.map((a) => a.id)).toEqual(["sin-atender"]);
    expect(row?.pending).toHaveLength(1);

    const attended = buildThreads([alert("vieja", "2026-01-01", "Yo")]);
    const [empty] = buildChats([cleared], attended, () => 0);
    expect(empty).toMatchObject({ alerts: [], preview: "", at: "" });
  });
});
