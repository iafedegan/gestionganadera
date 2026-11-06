import { describe, expect, it } from "vitest";
import { isDemoOrg } from "./scope";

describe("isDemoOrg", () => {
  it("las cuentas de muestra con datos usan ejemplos; la cuenta nueva no", () => {
    expect(isDemoOrg("La Esperanza (muestra)")).toBe(true);
    expect(isDemoOrg("Agropecuaria Los Llanos (muestra)")).toBe(true);
    expect(isDemoOrg("Cuenta nueva (muestra)")).toBe(false);
    expect(isDemoOrg("Finca demostrativa")).toBe(true);
    expect(isDemoOrg("Mi finca real")).toBe(false);
    expect(isDemoOrg(undefined)).toBe(false);
  });
});
