/** Mensaje para la persona cuando algo falla al ingresar. */
export const IN_USE =
  "GanSmart ya está abierta en otra pestaña o ventana de este navegador. Cierre las demás, recargue esta página y vuelva a ingresar. Para usar dos cuentas a la vez, abra otro navegador o una ventana de incógnito.";

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/Access Handle|NoModificationAllowed/i.test(msg)) return IN_USE;
  if (msg.startsWith("ALMACENAMIENTO"))
    return "No se pudo abrir la copia local de este dispositivo. Cierre las otras pestañas e intente de nuevo.";
  return msg || "Error inesperado.";
}
