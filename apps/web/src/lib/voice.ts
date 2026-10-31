/**
 * Interpreta lo que el usuario dice al llenar un formulario por voz. Son funciones puras:
 * reciben el texto reconocido y devuelven el valor para el campo, o null si no se entendió.
 */

export interface VoiceChoice {
  value: string;
  label: string;
}

export interface VoiceField {
  name: string;
  label: string;
  type: "text" | "tag" | "number" | "date" | "select" | "textarea";
  choices?: VoiceChoice[];
  required?: boolean;
}

export type VoiceCommand = "atras" | "repetir" | "saltar" | "detener";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ,.\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COMMANDS: Record<string, VoiceCommand> = {
  atras: "atras",
  volver: "atras",
  anterior: "atras",
  "pregunta anterior": "atras",
  repetir: "repetir",
  repite: "repetir",
  repita: "repetir",
  "otra vez": "repetir",
  como: "repetir",
  saltar: "saltar",
  salta: "saltar",
  siguiente: "saltar",
  ninguno: "saltar",
  ninguna: "saltar",
  nada: "saltar",
  "sin dato": "saltar",
  "no tengo": "saltar",
  "no se": "saltar",
  detener: "detener",
  deten: "detener",
  parar: "detener",
  para: "detener",
  cancelar: "detener",
  terminar: "detener",
};

export function detectCommand(text: string): VoiceCommand | null {
  return COMMANDS[norm(text).replace(/[,.]/g, "")] ?? null;
}

export function detectConfirmation(text: string): "si" | "no" | null {
  const t = norm(text).replace(/[,.]/g, "");
  if (
    /^(si|si señor|claro|guardar?|guarde|guardalo|listo|correcto|confirmo|dale|ok|okay)\b/.test(t)
  )
    return "si";
  if (/^no\b/.test(t)) return "no";
  return null;
}

/** «corregir litros» o «cambiar la fecha»: devuelve el campo a corregir. */
export function detectCorrection(text: string, fields: VoiceField[]): VoiceField | null {
  const m = /^(corregir|corrige|corrija|cambiar|cambia|cambie)\s+(?:el |la |los |las )?(.+)$/.exec(
    norm(text).replace(/[,.]/g, ""),
  );
  if (!m?.[2]) return null;
  const said = m[2];
  const hits = fields.filter((f) => {
    const label = norm(speakableLabel(f.label));
    return label === said || label.includes(said) || said.includes(label);
  });
  return hits.length === 1 ? (hits[0] as VoiceField) : null;
}

/** Quita las unidades entre paréntesis para que la pregunta suene natural. */
export function speakableLabel(label: string) {
  return label.replace(/\s*\([^)]*\)/g, "").trim();
}

const UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

function wordsValue(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const t of tokens) {
    if (t === "y") continue;
    if (t === "mil") {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else if (t === "millon" || t === "millones") {
      total += (current || 1) * 1_000_000;
      current = 0;
      seen = true;
    } else {
      const v = UNITS[t];
      if (v === undefined) {
        if (seen) break;
        continue;
      }
      current += v;
      seen = true;
    }
  }
  return seen ? total + current : null;
}

function digitsValue(raw: string): number {
  // En español el punto separa miles y la coma, decimales; los motores usan ambos.
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ""));
  return Number(raw.replace(",", "."));
}

export function parseSpokenNumber(text: string): number | null {
  const t = norm(text)
    .replace(/\by medio\b/, "y 0,5")
    .replace(/\by media\b/, "y 0,5");
  const half = /\by 0,5\b/.test(t);
  const clean = t.replace(/\by 0,5\b/, "").trim();
  const digit = /\d[\d.,]*\d|\d/.exec(clean);
  if (digit) return digitsValue(digit[0]) + (half ? 0.5 : 0);
  const parts = clean.split(/\b(?:punto|coma)\b/);
  const whole = wordsValue((parts[0] ?? "").split(" "));
  if (whole === null) return null;
  const decimals = parts[1]?.trim();
  if (decimals) {
    const tokens = decimals.split(" ").filter((d) => UNITS[d] !== undefined);
    const digits = tokens.map((d) => String(UNITS[d])).join("");
    if (digits) return Number(`${whole}.${digits}`);
  }
  return whole + (half ? 0.5 : 0);
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (today: string, days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

function validDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;
}

export function parseSpokenDate(text: string, today: string): string | null {
  const t = norm(text).replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (/\bhoy\b/.test(t)) return today;
  if (/\b(anteayer|antier|antes de ayer)\b/.test(t)) return shift(today, 2);
  if (/\bayer\b/.test(t)) return shift(today, 1);

  const ago = /\bhace (.+?) (dia|dias|semana|semanas|mes|meses)\b/.exec(t);
  if (ago?.[1] && ago[2]) {
    const n = parseSpokenNumber(ago[1]);
    if (n === null) return null;
    const unit = ago[2].startsWith("dia") ? 1 : ago[2].startsWith("semana") ? 7 : 30;
    return shift(today, Math.round(n * unit));
  }

  const numeric = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(t);
  if (numeric) return validDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const named =
    /(?:^|\s)(?:el\s+)?(.*?)\s*de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(.+))?$/.exec(
      t,
    );
  if (named?.[1] !== undefined && named[2]) {
    const day = /primero/.test(named[1]) ? 1 : parseSpokenNumber(named[1]);
    const month = MONTHS[named[2]] as number;
    if (day === null) return null;
    if (named[3]) {
      const year = parseSpokenNumber(named[3]);
      return year === null ? null : validDate(year, month, day);
    }
    const thisYear = Number(today.slice(0, 4));
    const candidate = validDate(thisYear, month, day);
    // Sin año se entiende la fecha pasada más cercana.
    return candidate && candidate > today ? validDate(thisYear - 1, month, day) : candidate;
  }
  return null;
}

/** «be o be cero cero uno» y similares: palabras de cifras a dígitos, sin separadores. */
function compactKey(text: string) {
  const tokens = norm(text).split(/[\s-]+/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    const tens = UNITS[t];
    const unit = UNITS[tokens[i + 2] ?? ""];
    // «setenta y ocho» es un solo número; «cero cero uno» son cifras seguidas.
    if (tens && tens >= 30 && tens < 100 && tokens[i + 1] === "y" && unit && unit < 10) {
      out.push(String(tens + unit));
      i += 2;
    } else if (UNITS[t] !== undefined && (UNITS[t] as number) < 100) {
      out.push(String(UNITS[t]));
    } else {
      out.push(t);
    }
  }
  return out.join("").replace(/[^a-z0-9ñ]/g, "");
}

const trailingNumber = (s: string) => {
  const m = /(\d+)\D*$/.exec(s);
  return m?.[1] ? Number(m[1]) : null;
};

export function matchChoice(choices: VoiceChoice[], text: string): VoiceChoice | null {
  const said = norm(text).replace(/[,.]/g, "");
  if (!said) return null;
  const key = (c: VoiceChoice) => norm(c.label).replace(/[,.]/g, "");

  const exact = choices.filter((c) => key(c) === said);
  if (exact.length === 1) return exact[0] as VoiceChoice;

  const compact = compactKey(said);
  const byCompact = choices.filter((c) => compactKey(c.label) === compact);
  if (byCompact.length === 1) return byCompact[0] as VoiceChoice;

  const contained = choices.filter((c) => {
    const k = key(c).replace(/\s*\([^)]*\)/g, "");
    return (
      new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(said) ||
      (said.length >= 3 && new RegExp(`\\b${said}`).test(k))
    );
  });
  if (contained.length === 1) return contained[0] as VoiceChoice;
  if (contained.length > 1) return null;

  // «la setenta y ocho» cuando el arete es CRIA-78: vale si solo uno termina en ese número.
  const n = parseSpokenNumber(said);
  if (n !== null) {
    const byNumber = choices.filter((c) => trailingNumber(c.label) === n);
    if (byNumber.length === 1) return byNumber[0] as VoiceChoice;
  }
  return null;
}

/** Aretes y códigos dictados: mayúsculas, cifras en dígitos y sin espacios. */
export function parseSpokenTag(text: string): string | null {
  const key = compactKey(text).toUpperCase();
  return key || null;
}

export function interpretAnswer(field: VoiceField, text: string, today: string): string | null {
  const said = text.trim();
  if (!said) return null;
  switch (field.type) {
    case "number": {
      const n = parseSpokenNumber(said);
      return n === null ? null : String(n);
    }
    case "date":
      return parseSpokenDate(said, today);
    case "select":
      return matchChoice(field.choices ?? [], said)?.value ?? null;
    case "tag":
      return parseSpokenTag(said);
    default:
      return said.charAt(0).toUpperCase() + said.slice(1);
  }
}

/** Texto de la pregunta. Lee las opciones cuando son pocas; una lista larga solo se muestra. */
export function questionFor(field: VoiceField): string {
  const label = speakableLabel(field.label);
  const optional = field.required === false ? " Si no aplica, diga saltar." : "";
  if (field.type === "date") return `${label}. Diga hoy, ayer o la fecha.${optional}`;
  if (field.type === "select") {
    const list = field.choices ?? [];
    if (list.length > 0 && list.length <= 5)
      return `${label}. ${list.map((c) => c.label).join(", ")}.${optional}`;
  }
  return `${label}.${optional}`;
}

/** Cómo se lee el valor al repasar el formulario. */
export function speakableValue(field: VoiceField, value: string): string {
  if (!value) return "sin dato";
  if (field.type === "select") {
    return field.choices?.find((c) => c.value === value)?.label ?? value;
  }
  if (field.type === "date") {
    const [y, m, d] = value.split("-");
    const month = Object.entries(MONTHS).find(([, n]) => n === Number(m))?.[0];
    return month ? `${Number(d)} de ${month} de ${y}` : value;
  }
  return value;
}
