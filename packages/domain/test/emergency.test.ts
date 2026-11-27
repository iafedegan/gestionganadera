import { describe, expect, it } from "vitest";
import { detectEmergency } from "../src/emergency.js";

describe("detectEmergency", () => {
  it("reconoce las urgencias como las cuenta un ganadero", () => {
    expect(detectEmergency("La vaca CE-004 no se puede levantar desde anoche")).toBe(
      "animal caído",
    );
    expect(detectEmergency("tengo un parto de 3 horas y el ternero no sale")).toBe("parto difícil");
    expect(detectEmergency("Amaneció con la barriga muy inflada")).toBe("timpanismo");
    expect(detectEmergency("creo que comió veneno y está convulsionando")).toBe("convulsiones");
    expect(detectEmergency("Se me murió una novilla")).toBe("muerte o agonía");
    expect(detectEmergency("Tengo una urgencia")).toBe("urgencia reportada");
    expect(detectEmergency("¡Emergencia!")).toBe("urgencia reportada");
    for (const typo of ["ugente", "Urjente", "emerjencia", "es ugente"])
      expect(detectEmergency(typo), typo).toBe("urgencia reportada");
    expect(detectEmergency("¿Qué dice la gente del precio vigente?")).toBeNull();
    for (const [said, reason] of [
      ["Mi vaca tiene fiebre y tiembla", "fiebre"],
      ["La novilla está temblando", "temblores"],
      ["El ternero está orinando rojo", "sangre en orina o diarrea"],
      ["La CE-004 amaneció decaída", "animal decaído"],
      ["La vaca no ha botado la placenta", "problema de parto"],
      ["Tiene la ubre muy caliente", "ubre inflamada"],
    ])
      expect(detectEmergency(said as string), said).toBe(reason);
    for (const q of [
      "¿Qué vacas han tenido fiebre este año?",
      "¿Cuántos animales tienen fiebre aftosa vacunada?",
      "¿Cómo se maneja la fiebre de leche?",
    ])
      expect(detectEmergency(q), q).toBeNull();
  });

  it("no alarma con preguntas normales o de prevención", () => {
    for (const q of [
      "¿Qué debo revisar hoy en la finca?",
      "¿Qué partos vienen en los próximos dos meses?",
      "¿Cómo prevengo el timpanismo?",
      "¿Qué es la rabia bovina?",
      "¿Cómo controlo la garrapata sin crear resistencia?",
    ])
      expect(detectEmergency(q), q).toBeNull();
  });
});
