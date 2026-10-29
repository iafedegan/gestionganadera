import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hashPassword } from "./auth.js";
import { createPgDb, createPgliteDb } from "./db.js";
import { createFarm } from "./sync.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("El seed de demostración no se ejecuta en producción.");
}

const db = process.env.DATABASE_URL
  ? await createPgDb(process.env.DATABASE_URL)
  : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");

let ownerId = "";
const credentials: Record<string, { email: string; password: string; role: string }> = {};

const users = [
  {
    key: "propietario",
    email: "propietario@demo.local",
    name: "Propietario Demostrativo",
    role: "propietario",
  },
  {
    key: "operario",
    email: "operario@demo.local",
    name: "Operario Demostrativo",
    role: "operario",
  },
  { key: "tecnico", email: "tecnico@demo.local", name: "Técnico Demostrativo", role: "tecnico" },
] as const;

const existing = await db.admin((q) =>
  q("SELECT 1 FROM organization WHERE name = 'Organización demostrativa'"),
);
if (existing.length > 0) {
  console.log("El seed ya fue ejecutado; no se hace nada.");
} else {
  const orgId = await db.admin(async (q) => {
    const [org] = await q<{ id: string }>(
      "INSERT INTO organization (name) VALUES ('Organización demostrativa') RETURNING id",
    );
    const id = org?.id as string;
    return id;
  });
  for (const u of users) {
    const password = randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(password);
    await db.admin(async (q) => {
      const [row] = await q<{ id: string }>(
        "INSERT INTO app_user (email, display_name, password_hash) VALUES ($1,$2,$3) RETURNING id",
        [u.email, u.name, passwordHash],
      );
      await q("INSERT INTO membership (user_id, organization_id, role) VALUES ($1,$2,$3)", [
        row?.id,
        orgId,
        u.role,
      ]);
      if (u.role === "propietario") ownerId = row?.id as string;
    });
    credentials[u.key] = { email: u.email, password, role: u.role };
  }
  // La finca se crea por el servicio, para que quede en el feed de cambios y en la auditoría.
  await createFarm(
    db,
    { id: ownerId, email: "propietario@demo.local", displayName: "Propietario Demostrativo" },
    {
      organizationId: orgId,
      code: "FD-001",
      name: "Finca demostrativa",
      locationText: "Vereda demostrativa",
      speciesPresent: ["bovino", "bufalino"],
    },
  );
  writeFileSync(".seed-credentials.json", `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    "Seed listo. Credenciales de desarrollo guardadas en apps/api/.seed-credentials.json",
  );
}
await db.close();
