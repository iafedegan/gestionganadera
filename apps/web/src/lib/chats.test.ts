import type { ChatContact } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import { buildChats } from "./chats";
import type { Thread } from "./threads";

const contact = (userId: string, at: string | null, unread = 0): ChatContact => ({
  userId,
  name: userId,
  avatar: null,
  role: "veterinario",
  organizationName: "Finca",
  unread,
  lastMessage: at ? { id: at, mine: false, preview: "hola", createdAt: at } : null,
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
});
