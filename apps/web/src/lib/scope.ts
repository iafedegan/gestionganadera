/* Alcance de los datos: organización y modo demostración. */

/**
 * Los datos de ejemplo solo se muestran en la organización demostrativa; una cuenta real
 * empieza vacía. Lo guardado en el navegador queda separado por organización.
 * AppProvider lo actualiza al cambiar la sesión.
 */
export const dataScope = { org: "", demo: false, rich: false };
export function setDataScope(org: string, demo: boolean, rich = false): void {
  dataScope.org = org;
  dataScope.demo = demo;
  dataScope.rich = demo && rich;
}

/**
 * La cuenta de muestra con todos los módulos llenos (Agropecuaria Los Llanos, de «Ganadero
 * grande»): sus módulos de gestión usan datos de ejemplo a la escala de la finca.
 */
export function isRichDemo(organizationName: string | undefined): boolean {
  return (organizationName ?? "").toLowerCase().startsWith("agropecuaria los llanos (muestra)");
}

/**
 * Quien tenga datos de ejemplo más completos para un módulo los registra aquí (ver `erpRich.ts`);
 * así `useStore` no depende de ese archivo.
 */
let override: (<T>(key: string, base: T) => T) | null = null;
export function setSeedOverride(fn: <T>(key: string, base: T) => T): void {
  override = fn;
}
export function seedFor<T>(key: string, base: T): T {
  return override ? override(key, base) : base;
}
export const isDemoScope = () => dataScope.demo;
/** La lista de ejemplo en la cuenta demo; vacía en cualquier otra. */
export function demoOnly<T>(list: T[]): T[] {
  return dataScope.demo ? list : [];
}
/**
 * Organización con datos de ejemplo: la demostrativa y las cuentas de muestra del ingreso,
 * salvo "Cuenta nueva", que debe verse vacía.
 */
export function isDemoOrg(organizationName: string | undefined): boolean {
  const n = organizationName?.toLowerCase() ?? "";
  if (n.includes("demostrativa")) return true;
  return n.includes("(muestra)") && !n.includes("cuenta nueva");
}
