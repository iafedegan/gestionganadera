/**
 * Lectura de identificadores desde el celular: NFC (Web NFC, solo Chrome en Android) y
 * bastones RFID que funcionan como teclado (Bluetooth HID o USB): escriben el código y
 * terminan con Enter. Todo lo leído se trata como texto no confiable y se normaliza.
 */

interface NdefRecordLike {
  recordType: string;
  data?: DataView;
}
interface NdefEventLike extends Event {
  serialNumber: string;
  message: { records: NdefRecordLike[] };
}
interface NdefReaderLike extends EventTarget {
  scan(opts?: { signal?: AbortSignal }): Promise<void>;
}
type NdefReaderCtor = new () => NdefReaderLike;

const ndef = (): NdefReaderCtor | undefined =>
  (globalThis as unknown as { NDEFReader?: NdefReaderCtor }).NDEFReader;

export interface Capabilities {
  nfc: boolean;
  bluetooth: boolean;
  serial: boolean;
  geolocation: boolean;
  secure: boolean;
}

export function detectCapabilities(): Capabilities {
  const nav = navigator as Navigator & { bluetooth?: unknown; serial?: unknown };
  return {
    nfc: Boolean(ndef()),
    bluetooth: Boolean(nav.bluetooth),
    serial: Boolean(nav.serial),
    geolocation: "geolocation" in navigator,
    secure: globalThis.isSecureContext,
  };
}

export type TagSource = "nfc" | "bastón" | "manual";

export interface TagRead {
  /** Código normalizado (mayúsculas, sin espacios ni caracteres de control). */
  code: string;
  source: TagSource;
  at: string;
}

/** Quita caracteres de control y espacios, pasa a mayúsculas y limita la longitud. */
export function cleanCode(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const c = ch.charCodeAt(0);
    if (c > 0x20 && c !== 0x7f && !/\s/.test(ch)) out += ch;
  }
  return out.toUpperCase().slice(0, 40);
}

const text = (r: NdefRecordLike): string | null => {
  if (!r.data || (r.recordType !== "text" && r.recordType !== "url")) return null;
  const bytes = new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength);
  // En un registro de texto el primer byte lleva el idioma; se descarta.
  const body = r.recordType === "text" ? bytes.slice(1 + ((bytes[0] ?? 0) & 0x3f)) : bytes;
  return new TextDecoder().decode(body);
};

export class ReaderUnavailable extends Error {}

/**
 * Escanea una etiqueta NFC. Prefiere el contenido de texto (p. ej. «BOV-014»); si la
 * etiqueta está vacía usa su número de serie físico. Se cancela con el AbortSignal.
 */
export function scanNfc(signal: AbortSignal): Promise<TagRead> {
  const Ctor = ndef();
  if (!Ctor) return Promise.reject(new ReaderUnavailable("Este navegador no lee NFC."));
  return new Promise<TagRead>((resolve, reject) => {
    const reader = new Ctor();
    reader.addEventListener("reading", (e) => {
      const ev = e as NdefEventLike;
      const fromText = ev.message.records.map(text).find((t) => t?.trim());
      const code = cleanCode(fromText ?? ev.serialNumber ?? "");
      if (code) resolve({ code, source: "nfc", at: new Date().toISOString() });
    });
    reader.addEventListener("readingerror", () =>
      reject(new Error("No se pudo leer la etiqueta. Acérquela de nuevo.")),
    );
    signal.addEventListener("abort", () => reject(new DOMException("cancelado", "AbortError")));
    reader.scan({ signal }).catch(reject);
  });
}

/**
 * Captura de bastón RFID tipo teclado: junta las teclas que llegan muy seguidas
 * y entrega el código al recibir Enter. Devuelve la función para desactivarlo.
 */
export function captureWedge(onRead: (r: TagRead) => void, maxGapMs = 60): () => void {
  let buf = "";
  let last = 0;
  const onKey = (e: KeyboardEvent) => {
    const now = performance.now();
    if (now - last > maxGapMs) buf = "";
    last = now;
    if (e.key === "Enter") {
      const code = cleanCode(buf);
      buf = "";
      // Un humano no escribe 8+ caracteres con menos de 60 ms entre teclas.
      if (code.length >= 8) {
        e.preventDefault();
        onRead({ code, source: "bastón", at: new Date().toISOString() });
      }
    } else if (e.key.length === 1) {
      buf += e.key;
    }
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

/** Código nacional de 15 dígitos (ISO 11784): país(3) + identificador(12). Solo informativo. */
export function describeIso11784(code: string): string | null {
  if (!/^\d{15}$/.test(code)) return null;
  return `País ${code.slice(0, 3)} · Identificador ${code.slice(3)}`;
}
