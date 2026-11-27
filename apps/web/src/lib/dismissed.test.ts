import { describe, expect, it } from "vitest";
import { chatKey } from "./dismissed";

describe("notificaciones borradas", () => {
  it("una conversación borrada vuelve cuando pasa algo nuevo", () => {
    const row = { key: "u:1", at: "2026-01-01", pending: [] };
    expect(chatKey({ ...row })).toBe(chatKey(row));
    expect(chatKey({ ...row, at: "2026-01-02" })).not.toBe(chatKey(row));
  });
});
