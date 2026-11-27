import { describe, expect, it } from "vitest";
import { phoneNumber, smsLink, smsText } from "./sms";

describe("SMS de emergencia", () => {
  it("normaliza el número y arma el enlace", () => {
    expect(phoneNumber("310 555 12 34")).toBe("+573105551234");
    expect(phoneNumber("+57 310 555 1234")).toBe("+573105551234");
    expect(phoneNumber("abc")).toBe("");
    expect(smsLink("3105551234", "Hola finca")).toBe("sms:+573105551234?&body=Hola%20finca");
    expect(smsLink("", "x")).toBe("sms:?&body=x");
  });

  it("resume el animal y su último manejo", () => {
    const text = smsText({
      reason: "sangrado",
      message: "No para de sangrar",
      who: "Ana",
      farm: "La Ceiba",
      animal: {
        tag: "CE-004",
        detail: "Vaca, 6 años",
        withdrawal: true,
        events: [
          {
            animalId: "a",
            type: "salud",
            occurredOn: "2026-11-24",
            data: { product: "Cefquinoma" },
          },
        ],
      },
    });
    expect(text).toContain("Animal CE-004 (Vaca, 6 años). Finca La Ceiba.");
    expect(text).toContain("Ultimo manejo: Cefquinoma 24/11. En retiro.");
    expect(text.length).toBeLessThanOrEqual(420);
  });
});
