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
  // Quien lo dice con sus palabras: «tengo una urgencia», «es urgente», «auxilio».
  [
    /(tengo|hay|es) (una )?(urgencia|emergencia)|urgente|auxilio|^\W*(urgencia|emergencia)/,
    "urgencia reportada",
  ],
];

const PREVENTION =
  /^\W*(como (prevengo|evito|controlo|se previene|prevenir|evitar)|que es|que hago para (evitar|prevenir)|cuales son los sintomas)/;

export function detectEmergency(text: string): string | null {
  const t = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (PREVENTION.test(t)) return null;
  return RULES.find(([re]) => re.test(t))?.[1] ?? null;
}
