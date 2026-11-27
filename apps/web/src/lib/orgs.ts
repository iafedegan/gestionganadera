import type { SessionDto } from "@ganaderia/contracts";

/**
 * Una persona puede estar en varias ganaderías (p. ej. un veterinario). La aplicación trabaja
 * con la primera de la lista: aquí se pone de primera la que la persona eligió.
 */
export function preferOrg(session: SessionDto, orgId: string | null): SessionDto {
  if (!orgId || session.memberships[0]?.organizationId === orgId) return session;
  const chosen = session.memberships.filter((m) => m.organizationId === orgId);
  if (chosen.length === 0) return session;
  const rest = session.memberships.filter((m) => m.organizationId !== orgId);
  return { ...session, memberships: [...chosen, ...rest] };
}

/** Las ganaderías de la persona, sin repetir (puede tener un acceso por cada finca). */
export function myOrgs(session: SessionDto | null) {
  const seen = new Map<string, SessionDto["memberships"][number]>();
  for (const m of session?.memberships ?? [])
    if (!seen.has(m.organizationId)) seen.set(m.organizationId, m);
  return [...seen.values()];
}

const key = (userId: string) => `gg.org.${userId}`;

export function chosenOrg(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function rememberOrg(userId: string, orgId: string): void {
  try {
    localStorage.setItem(key(userId), orgId);
  } catch {
    /* sin almacenamiento: vale mientras la app siga abierta */
  }
}
