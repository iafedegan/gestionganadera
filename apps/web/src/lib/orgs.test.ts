import type { SessionDto } from "@ganaderia/contracts";
import { describe, expect, it } from "vitest";
import { myOrgs, preferOrg } from "./orgs";

const session = {
  userId: "u",
  memberships: [
    { organizationId: "a", organizationName: "A", role: "veterinario" },
    { organizationId: "b", organizationName: "B", role: "veterinario" },
    { organizationId: "b", organizationName: "B", role: "veterinario" },
  ],
} as unknown as SessionDto;

describe("varias ganaderías", () => {
  it("pone de primera la elegida y conserva todos los accesos", () => {
    const s = preferOrg(session, "b");
    expect(s.memberships.map((m) => m.organizationId)).toEqual(["b", "b", "a"]);
  });
  it("ignora una elección que ya no existe", () => {
    expect(preferOrg(session, "z")).toBe(session);
    expect(preferOrg(session, null)).toBe(session);
  });
  it("lista cada ganadería una vez", () => {
    expect(myOrgs(session).map((m) => m.organizationId)).toEqual(["a", "b"]);
  });
});
