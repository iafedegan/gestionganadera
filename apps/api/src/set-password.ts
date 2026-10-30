import { appendAudit } from "./audit.js";
import { hashPassword, revokeUserSessions } from "./auth.js";
import { createPgDb, createPgliteDb } from "./db.js";

/**
 * Cambia la contraseña de un usuario existente (soporte local y recuperación).
 * Uso: pnpm --filter @ganaderia/api set-password <correo> <contraseña>
 * Cierra todas sus sesiones abiertas y deja constancia en la auditoría.
 * Con PGlite, el servidor debe estar detenido: la base admite un solo proceso.
 */
if (process.env.NODE_ENV === "production") {
  throw new Error("Este comando no se ejecuta con NODE_ENV=production.");
}

const [emailArg, password] = process.argv.slice(2);
if (!emailArg || !password) {
  console.error("Uso: set-password <correo> <contraseña>");
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();

const db = process.env.DATABASE_URL
  ? await createPgDb(process.env.DATABASE_URL)
  : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");

const hash = await hashPassword(password);
const user = await db.admin(async (q) => {
  const rows = await q<{ id: string }>("SELECT id FROM app_user WHERE email = $1", [email]);
  const found = rows[0];
  if (!found) return null;
  await q("UPDATE app_user SET password_hash = $1 WHERE id = $2", [hash, found.id]);
  return found;
});

if (!user) {
  console.error(`No existe un usuario con el correo ${email}.`);
  await db.close();
  process.exit(1);
}

await revokeUserSessions(db, user.id);
const orgs = await db.admin((q) =>
  q<{ organization_id: string }>("SELECT organization_id FROM membership WHERE user_id = $1", [
    user.id,
  ]),
);
for (const o of orgs) {
  await db.tenant(
    o.organization_id,
    (q) =>
      appendAudit(q, o.organization_id, {
        userId: user.id,
        action: "auth.password_change",
        entity: "user",
        entityId: user.id,
        detail: { via: "set-password" },
      }),
    { write: true },
  );
}
console.log(`Contraseña actualizada para ${email}. Sus sesiones abiertas se cerraron.`);
await db.close();
