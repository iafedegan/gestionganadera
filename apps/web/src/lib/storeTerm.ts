/** Del nombre del insumo a una búsqueda de tienda: sin presentación ni concentración («1 %», «40 kg»). */
export function storeTerm(name: string): string {
  const words = name
    .split(/\s+/)
    .filter(
      (w) => w && !/\d/.test(w) && !/^[%×x/+-]$/i.test(w) && !/^(kg|g|l|ml|cc|un|und)$/i.test(w),
    );
  return (words.join(" ") || name).trim();
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** ¿El nombre contiene todas las palabras buscadas? Sin tildes ni mayúsculas; tolera plurales. */
export function matchesStore(name: string, query: string): boolean {
  const n = norm(name);
  return norm(query)
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .every(
      (w) => n.includes(w) || (w.length > 3 && /e?s$/.test(w) && n.includes(w.replace(/e?s$/, ""))),
    );
}

/** «$ 18.909,30» → 18909.3 (formato colombiano). */
export function priceValue(price: string | null | undefined): number | null {
  if (!price) return null;
  const digits = price.replace(/[^\d,]/g, "").replace(",", ".");
  const v = Number(digits);
  return digits && Number.isFinite(v) ? v : null;
}
