/**
 * ¿Lo que escribió la persona describe una emergencia del ganado? Se decide con reglas fijas
 * (sin depender de la IA ni de la señal) para avisar de inmediato al técnico. Ante la duda se
 * prefiere avisar; las preguntas de prevención o de explicación no cuentan.
 */

const RULES: [RegExp, string][] = [
  [
    /no se (puede )?(levantar?|para|incorpora)|animal caid[oa]|vaca caida|(esta|amanecio) (tirad|echad)[oa] y no/,
    "animal caído",
  ],
  [/sangr(a|ando) mucho|sangrado|hemorragia|botando sangre|desangr/, "sangrado"],
  [
    /parto.{0,60}(horas|atascad|trabad|dificil|no sale|no avanza|complicad)|(ternero|cria).{0,30}(atascad|atravesad|trabad|no sale)|distocia/,
    "parto difícil",
  ],
  [/prolapso|se le sali[oó] (la )?(matriz|vagina|recto)|matriz afuera/, "prolapso"],
  [
    /timpan|(panza|barriga|vientre|ijar).{0,30}(inflad|hinchad)|(inflad|hinchad).{0,20}(panza|barriga)|empanzad/,
    "timpanismo",
  ],
  [/convulsi|temblando y caid|ataques? y/, "convulsiones"],
  [/intoxic|envenen|comio (veneno|raticida|plaguicida|herbicida)/, "intoxicación"],
  [/no (puede )?respirar?|no respira|se esta ahogando|ahogand/, "dificultad para respirar"],
  [/mordedura|(lo|la) (pico|mordio) (una )?(culebra|serpiente)/, "mordedura"],
  [/fractura|pata (quebrada|partida|rota)/, "fractura"],
  [
    /se (me )?(esta )?muri(o|endo)|amanecio muert|varios (animales )?muert|agonizando/,
    "muerte o agonía",
  ],
  [
    /aftosa|rabia|carbon (bacteridiano|sintomatico)|ampollas en la (boca|lengua|ubre)/,
    "posible enfermedad de reporte",
  ],
  // Síntomas de un animal enfermo ahora: se avisa aunque no diga que es urgente.
  [
    /(tiene|tienen|esta con|estan con|amanecio con|presenta|le dio|con mucha) (mucha |alta )?(fiebre|calentura)|\bfiebre y\b/,
    "fiebre",
  ],
  [/\btiembla\b|\btiemblan\b|temblando|temblores|tembladera/, "temblores"],
  [
    /(orina|orinando|mea|meando).{0,20}(sangre|roj[oa]|cafe|oscur[oa])|(diarrea|boniga|estiercol).{0,20}sangre/,
    "sangre en orina o diarrea",
  ],
  [
    /(no (quiere )?(come|comer)|dejo de comer).{0,40}(decaid|triste|babea|echad)|(muy|esta|amanecio) decaid[oa]|babeando mucho/,
    "animal decaído",
  ],
  [
    /(no ha (botado|expulsado) (la )?(placenta|pares)|retencion de (la )?(placenta|pares))|(la )?vaca (aborto|esta abortando)/,
    "problema de parto",
  ],
  [/ubre (muy )?(inflamada|caliente|dura|morada|negra)/, "ubre inflamada"],
  // Quien lo dice con sus palabras: «tengo una urgencia», «es urgente», «auxilio».
  [
    // Se toleran los errores de digitación más comunes: «ugente», «urjente», «emerjencia».
    /(tengo|hay|es) (una )?(urgencia|emergencia)|urgente|auxilio|^\W*(urgencia|emergencia)|\b(ugente|urjente|ujente|urgnete|urgete)\b|^\W*(ugencia|urjencia|urgensia|emerjencia|emergensia)\b/,
    "urgencia reportada",
  ],
];

/** Preguntas de consulta o de prevención: se responden, no alarman. */
const PREVENTION =
  /^\W*(como (prevengo|evito|controlo|se |prevenir|evitar)|que es|que hago para (evitar|prevenir)|que (animales|vacas|terneros)|cuales|cuant[oa]s|por que se)/;

export function detectEmergency(text: string): string | null {
  const t = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (PREVENTION.test(t)) return null;
  return RULES.find(([re]) => re.test(t))?.[1] ?? null;
}
