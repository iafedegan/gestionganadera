/** Colores del Manual de identidad CONtexto Ganadero v1.0 (octubre de 2026). En pantalla manda el HEX. */
export const brand = {
  verdePasto: "#589120",
  carmesiCita: "#C21A3B",
  obsidiana: "#05100B",
  esmeralda: "#2F9C62",
  oro: "#D8B558",
  marfil: "#F4F2E9",
  niebla: "#9FB7A8",
  insigniaMarfil: "#F6F8F3",
  marmol: "#F5F4F0",
  verdeBotella: "#0F3D2E",
} as const;

export const status = {
  error: "#C0392B",
  exito: "#2F9C62",
  aviso: "#D8B558",
  info: "#9FB7A8",
} as const;

/** Radio de botones y tarjetas (0,25 rem); píldora solo en etiquetas y buscador. */
export const radius = { base: "0.25rem", pill: "9999px" } as const;

export const fonts = {
  titular: '"Playfair Display", Georgia, serif',
  interfaz: '"Inter", system-ui, sans-serif',
  lectura: '"Spectral", Georgia, serif',
  datos: '"JetBrains Mono", ui-monospace, monospace',
} as const;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Relación de contraste WCAG 2.1 entre dos colores HEX. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
