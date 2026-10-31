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
  /** El valor inicial sirve aunque no se diga (solo opciones); no se pregunta. */
  defaultOk?: boolean;
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

/** Pregunta corta. Con `detail` (cuando no se entendió) también lee las opciones si son pocas. */
export function questionFor(field: VoiceField, detail = false): string {
  const label = speakableLabel(field.label);
  const list = field.choices ?? [];
  if (detail && field.type === "select" && list.length > 0 && list.length <= 5) {
    return `${label}: ${list.map((c) => c.label.replace(/\s*\([^)]*\)/g, "")).join(", ")}.`;
  }
  return `${label}?`;
}

/** Lo que falta preguntar: obligatorio y sin un valor que el usuario haya dado o aceptado. */
export function needsAnswer(field: VoiceField, value: string | undefined): boolean {
  if (field.required === false) return false;
  if (field.type === "date") return !value;
  if (field.type === "select") {
    if ((field.choices?.length ?? 0) <= 1) return false;
    return !(field.defaultOk && value);
  }
  return !value;
}

/* ───────────── Varios datos en una sola frase ───────────── */

const STOP = new Set(
  "de del la el los las en y o a al para con por un una area edad fecha tipo numero total_".split(
    " ",
  ),
);
const UNIT_WORDS: Record<string, string[]> = {
  kg: ["kg", "kilo", "kilos", "kilogramo", "kilogramos"],
  cop: ["peso", "pesos"],
  l: ["litro", "litros"],
  "%": ["porciento", "porcentaje"],
};
const MEMO_WORDS = ["nota", "notas", "observacion", "observaciones", "comentario"];
const TAG_WORDS = ["arete", "chapeta", "numero", "identificacion", "chip"];

function unitWords(field: VoiceField): string[] {
  const unit = /\(([^)]*)\)/.exec(field.label)?.[1];
  return norm(unit ?? "")
    .split(/[\s/]+/)
    .flatMap((u) => UNIT_WORDS[u] ?? []);
}

/** Palabras con las que el usuario nombraría este dato: «litros», «peso», «motivo»… */
function keysFor(field: VoiceField): string[] {
  const keys = new Set(
    norm(speakableLabel(field.label))
      .replace(/[,.]/g, " ")
      .split(" ")
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
  for (const w of unitWords(field)) keys.add(w);
  // «Litros» y «litro» cuentan igual.
  for (const k of [...keys]) keys.add(k.endsWith("s") ? k.slice(0, -1) : `${k}s`);
  if (field.type === "tag") for (const w of TAG_WORDS) keys.add(w);
  if (field.type === "textarea") for (const w of MEMO_WORDS) keys.add(w);
  return [...keys];
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length] as number;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Parecido tolerante a errores del reconocedor («baca 01», «mañanas»); las cifras no se perdonan. */
function closeEnough(said: string, target: string): boolean {
  if (said === target) return true;
  if (digitsOf(said) !== digitsOf(target)) return false;
  const letters = target.replace(/\d/g, "").length;
  if (letters < 4) return false;
  return editDistance(said, target) <= (target.length >= 9 ? 2 : 1);
}

const DATE_PATTERNS = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/,
  /\bhace [a-z0-9 ]{1,24}? (?:dia|dias|semana|semanas|mes|meses)\b/,
  /\b(?:el )?(?:primero|\d{1,2}|[a-z]+(?: y [a-z]+)?) de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de(?:l)? (?:\d{4}|dos mil(?: [a-z]+)?))?\b/,
  /\b(?:anteayer|antier|antes de ayer|ayer|hoy)\b/,
];

const isNumberToken = (t: string) =>
  /^\d[\d.,]*$/.test(t) || UNITS[t] !== undefined || t === "mil" || t === "medio" || t === "media";

export interface Extraction {
  values: Record<string, string>;
  /** Lo que sobró de la frase después de sacar los datos reconocidos. */
  rest: string;
}

/**
 * Saca de una frase todos los datos que reconozca, en cualquier orden. `current` es el campo que
 * se acaba de preguntar: tiene prioridad cuando un valor le serviría a más de uno.
 */
export function extractAnswers(
  fields: VoiceField[],
  text: string,
  today: string,
  current?: string,
): Extraction {
  const values: Record<string, string> = {};
  const order = [...fields].sort((a, b) => (a.name === current ? -1 : b.name === current ? 1 : 0));
  let rest = ` ${norm(text)
    .replace(/,(?!\d)/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  const cut = (piece: string) => {
    // El separador evita que dos números que no iban juntos se lean como uno solo.
    rest = rest.replace(piece, " | ").replace(/\s+/g, " ");
    if (!rest.startsWith(" ")) rest = ` ${rest}`;
    if (!rest.endsWith(" ")) rest = `${rest} `;
  };

  // 1. Fechas: «nacimiento» o «entrada» cerca deciden el campo si hay más de una.
  const dateFields = order.filter((f) => f.type === "date");
  for (const pattern of DATE_PATTERNS) {
    for (;;) {
      const m = pattern.exec(rest);
      if (!m) break;
      const value = parseSpokenDate(m[0], today);
      if (!value) break;
      const before = rest.slice(0, m.index).trim().split(" ").slice(-3);
      const target =
        dateFields.find((f) => !values[f.name] && keysFor(f).some((k) => before.includes(k))) ??
        dateFields.find((f) => !values[f.name] && f.required !== false) ??
        dateFields.find((f) => !values[f.name]);
      if (!target) break;
      values[target.name] = value;
      for (const k of keysFor(target)) {
        if (before.includes(k)) cut(` ${k} `);
      }
      cut(m[0]);
    }
  }

  // 2. Textos nombrados: «motivo ciclo nacional», «nota cojea»; llegan hasta el siguiente nombre.
  const textFields = order.filter((f) => f.type === "text" || f.type === "textarea");
  const marks: { field: VoiceField; at: number; key: string }[] = [];
  for (const f of textFields) {
    for (const key of keysFor(f)) {
      const at = rest.indexOf(` ${key} `);
      if (at >= 0 && !marks.some((m) => m.field === f)) marks.push({ field: f, at, key });
    }
  }
  marks.sort((a, b) => a.at - b.at);
  const pieces = marks.map((m, i) => ({
    ...m,
    raw: rest.slice(m.at, marks[i + 1]?.at ?? rest.length),
  }));
  for (const p of pieces) {
    const said = p.raw.trim().slice(p.key.length).trim();
    if (said) {
      values[p.field.name] =
        p.field.type === "textarea" || p.field.type === "text"
          ? said.charAt(0).toUpperCase() + said.slice(1)
          : said;
      cut(p.raw.trimEnd());
    }
  }

  // 3. Opciones, de la frase más larga a la más corta para no partir «doble propósito».
  const selects = order.filter((f) => f.type === "select" && f.choices?.length);
  for (const size of [4, 3, 2, 1]) {
    for (const f of selects) {
      if (values[f.name]) continue;
      const tokens = rest.trim().split(" ");
      for (let i = 0; i + size <= tokens.length && !values[f.name]; i++) {
        const piece = tokens.slice(i, i + size).join(" ");
        const said = compactKey(piece);
        if (!said || piece.includes("|")) continue;
        const hits = (f.choices ?? []).filter((c) =>
          closeEnough(said, compactKey(c.label.replace(/\s*\([^)]*\)/g, ""))),
        );
        const hit = hits.length === 1 ? hits[0] : undefined;
        if (hit) {
          values[f.name] = hit.value;
          cut(` ${piece} `);
        }
      }
    }
  }

  // 4. Aretes: nombrados («arete 05») o, si no hay números que llenar, palabra más cifras.
  const hasNumbers = order.some((f) => f.type === "number");
  for (const f of order.filter((x) => x.type === "tag")) {
    const tokens = rest.trim().split(" ");
    const keyAt = tokens.findIndex((t) => keysFor(f).includes(t));
    let from = -1;
    if (keyAt >= 0 && tokens[keyAt + 1]) from = keyAt + 1;
    else if (!hasNumbers) {
      const firstDigit = tokens.findIndex((t) => isNumberToken(t));
      if (firstDigit >= 0) from = firstDigit > 0 ? firstDigit - 1 : 0;
    }
    if (from < 0) continue;
    let to = from + 1;
    while (tokens[to] !== undefined && (isNumberToken(tokens[to] as string) || tokens[to] === "y"))
      to++;
    const piece = tokens.slice(from, to).join(" ");
    const tag = parseSpokenTag(piece);
    if (tag) {
      values[f.name] = tag;
      if (keyAt >= 0 && keyAt === from - 1) cut(` ${tokens[keyAt]} `);
      cut(` ${piece} `);
    }
  }

  // 5. Números: el que tenga nombre al lado; los demás, en orden, a los campos que falten.
  const numberFields = order.filter((f) => f.type === "number");
  if (numberFields.length > 0) {
    const tokens = rest.trim().split(" ");
    const runs: { from: number; to: number }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (!isNumberToken(tokens[i] as string)) continue;
      let to = i + 1;
      while (
        tokens[to] !== undefined &&
        // «doscientas ciento cincuenta» son dos cifras: una centena no sigue a otra.
        !(
          (UNITS[tokens[to] as string] ?? 0) >= 100 && (UNITS[tokens[to - 1] as string] ?? 0) >= 100
        ) &&
        (isNumberToken(tokens[to] as string) ||
          ((tokens[to] === "y" || tokens[to] === "punto" || tokens[to] === "coma") &&
            tokens[to + 1] !== undefined &&
            isNumberToken(tokens[to + 1] as string)))
      )
        to++;
      runs.push({ from: i, to });
      i = to - 1;
    }
    const near = (at: number, step: 1 | -1) => {
      const out: string[] = [];
      for (let k = at; k >= 0 && k < tokens.length && out.length < 2; k += step) {
        const t = tokens[k] as string;
        if (STOP.has(t)) continue;
        out.push(t);
      }
      return out;
    };
    const free: { from: number; to: number }[] = [];
    const used = new Set<number>();
    for (const run of runs) {
      const words = [...near(run.to, 1).slice(0, 1), ...near(run.from - 1, -1).slice(0, 1)];
      // Primero la unidad («pesos» es costo aunque otro campo se llame «Peso»), luego el nombre.
      const target =
        numberFields.find((f) => !values[f.name] && unitWords(f).some((k) => words.includes(k))) ??
        numberFields.find((f) => !values[f.name] && keysFor(f).some((k) => words.includes(k)));
      const n = parseSpokenNumber(tokens.slice(run.from, run.to).join(" "));
      if (target && n !== null) {
        values[target.name] = String(n);
        for (let k = run.from; k < run.to; k++) used.add(k);
        for (const w of [run.to, run.from - 1]) {
          if (keysFor(target).includes(tokens[w] ?? "")) used.add(w);
        }
      } else free.push(run);
    }
    for (const run of free) {
      const target = numberFields.find((f) => !values[f.name]);
      const n = parseSpokenNumber(tokens.slice(run.from, run.to).join(" "));
      if (!target || n === null) continue;
      values[target.name] = String(n);
      for (let k = run.from; k < run.to; k++) used.add(k);
    }
    rest = ` ${tokens.filter((_, i) => !used.has(i)).join(" ")} `;
  }

  return { values, rest: rest.replace(/\|/g, " ").replace(/\s+/g, " ").trim() };
}

/** Un valor posible pero raro merece una segunda mirada antes de guardar. */
export function sanityDoubt(field: VoiceField, value: string | undefined): string | null {
  if (field.type !== "number" || !value) return null;
  const n = Number(value);
  const label = norm(field.label);
  if (label.includes("litro") && n > 60) return `${value} litros parece mucho para un ordeño.`;
  if (label.includes("nacer") && (n < 10 || n > 80)) {
    return `${value} kilos no es un peso normal al nacer.`;
  }
  if (label.includes("peso") && !label.includes("nacer") && (n < 10 || n > 1500)) {
    return `${value} kilos no parece un peso normal.`;
  }
  return null;
}

/** «… guardar» o «… listo» al final de la frase: guardar sin que se pregunte. */
export function endsWithSave(text: string): boolean {
  return /\b(guardar|guarda|guardalo|guarde|listo)$/.test(norm(text).replace(/[,.]/g, "").trim());
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
