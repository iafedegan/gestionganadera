import { describe, expect, it } from "vitest";
import { baseType, fitWithin, pickVoiceFormat } from "./media";

describe("fotos del chat", () => {
  it("reduce al lado mayor sin agrandar", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 });
    expect(fitWithin(600, 900, 1280)).toEqual({ w: 600, h: 900 });
  });
});

describe("notas de voz", () => {
  it("graba en el formato que el navegador permite y el servidor acepta", () => {
    expect(baseType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(pickVoiceFormat(() => true)).toBe("audio/webm;codecs=opus");
    // Safari y iPhone graban en mp4.
    expect(pickVoiceFormat((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(pickVoiceFormat(() => false)).toBeNull();
  });
});
