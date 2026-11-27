import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AskFn } from "./assistant.js";
import type { Db } from "./db.js";

/**
 * Clave de Google Gemini que pone cada ganadería. Se guarda cifrada (AES-256-GCM) con un
 * secreto que solo conoce el servidor: SECRETS_KEY o, si no está, la cadena de conexión de la
 * base. Si ese secreto cambia, la clave deja de poder leerse y hay que escribirla de nuevo.
 */

const secret = () =>
  createHash("sha256")
    .update(`gg-ai:${process.env.SECRETS_KEY ?? process.env.DATABASE_URL ?? "desarrollo-local"}`)
    .digest();

export function seal(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function open(sealed: string): string | null {
  try {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
    if (!iv || !tag || !data) return null;
    const d = createDecipheriv("aes-256-gcm", secret(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Comprueba con Google que la clave y el modelo existan. La clave viaja en una cabecera. */
export async function checkGemini(
  key: string,
  model: string,
  doFetch: typeof fetch = fetch,
): Promise<"ok" | "clave" | "modelo" | "sin_respuesta"> {
  try {
    const res = await doFetch(`${BASE}/models/${model}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "ok";
    if (res.status === 404) return "modelo";
    return res.status >= 500 ? "sin_respuesta" : "clave";
  } catch {
    return "sin_respuesta";
  }
}

export function geminiAsk(key: string, model: string, doFetch: typeof fetch = fetch): AskFn {
  return async ({ system, messages }) => {
    const res = await doFetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: typeof m.content === "string" ? m.content : "" }],
        })),
        generationConfig: { maxOutputTokens: 8192 },
      }),
    });
    // El cuerpo del error puede repetir datos de la petición: solo se registra el código.
    if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      promptFeedback?: { blockReason?: string };
    };
    const text = (j.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return {
      text,
      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
      refused: Boolean(j.promptFeedback?.blockReason),
    };
  };
}

export interface OrgAi {
  key_cipher: string;
  key_last4: string;
  model: string;
}

export async function orgAi(db: Db, orgId: string): Promise<OrgAi | null> {
  const [row] = await db.admin((q) =>
    q<OrgAi>("SELECT key_cipher, key_last4, model FROM org_ai WHERE organization_id = $1", [orgId]),
  );
  return row ?? null;
}
