/* Alcance de los datos: organización y modo demostración. */

/**
 * Los datos de ejemplo solo se muestran en la organización demostrativa; una cuenta real
 * empieza vacía. Lo guardado en el navegador queda separado por organización.
 * AppProvider lo actualiza al cambiar la sesión.
 */
export const dataScope = { org: "", demo: false };
export function setDataScope(org: string, demo: boolean): void {
  dataScope.org = org;
  dataScope.demo = demo;
}
export const isDemoScope = () => dataScope.demo;
/** La lista de ejemplo en la cuenta demo; vacía en cualquier otra. */
export function demoOnly<T>(list: T[]): T[] {
  return dataScope.demo ? list : [];
}
export const isDemoOrg = (organizationName: string | undefined) =>
  Boolean(organizationName?.toLowerCase().includes("demostrativa"));
