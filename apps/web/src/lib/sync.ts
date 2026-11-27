import type { CommandEnvelope } from "@ganaderia/contracts";
import { ApiError, NetworkError, api } from "./api";
import { localdb } from "./localdb";
import { deviceId } from "./session";

export type SyncOutcome =
  | {
      kind: "ok";
      sent: number;
      accepted: number;
      rejected: number;
      conflicts: number;
      received: number;
      at: string;
    }
  | { kind: "offline" }
  | { kind: "session_expired" }
  | { kind: "error"; message: string };

const BATCH = 50;

/**
 * Sincronización explícita: se ejecuta al abrir la app, al recuperar red y con el botón.
 * Primero envía los comandos pendientes (con sus identificadores, por lo que reintentar es seguro)
 * y luego descarga los cambios desde el cursor guardado.
 */
export async function runSync(orgId: string): Promise<SyncOutcome> {
  let sent = 0;
  let accepted = 0;
  let rejected = 0;
  let conflicts = 0;
  let received = 0;
  try {
    for (;;) {
      const batch: CommandEnvelope[] = await localdb.outboxPending(BATCH, orgId);
      if (batch.length === 0) break;
      const res = await api.push(orgId, deviceId(), batch);
      sent += batch.length;
      await localdb.outboxMark(
        res.results.map((r) => ({
          id: r.id,
          status: r.status,
          ...("code" in r ? { code: r.code, message: r.message } : {}),
        })),
      );
      for (const r of res.results) {
        if (r.status === "accepted") accepted++;
        else if (r.status === "rejected") rejected++;
        else conflicts++;
      }
      // Si un comando no quedó marcado (respuesta incompleta), se evita un ciclo infinito.
      if (res.results.length < batch.length) break;
    }

    // Cada ganadería lleva su propia marca de descarga. Las copias antiguas tenían una sola.
    const saved = async (name: "cursor" | "scope") =>
      (await localdb.getMeta(`${name}:${orgId}`)) ??
      ((await localdb.listFarms(orgId)).length > 0 ? await localdb.getMeta(name) : null);
    let cursor = Number(await saved("cursor")) || 0;
    let storedScope = await saved("scope");
    for (;;) {
      const page = await api.pull(orgId, cursor);
      if (storedScope && storedScope !== page.scope && cursor !== 0) {
        // Cambió el conjunto de fincas autorizadas: se descarga desde cero.
        await localdb.resetSynced(orgId);
        cursor = 0;
        storedScope = null;
        continue;
      }
      await localdb.applyPull({
        orgId,
        changes: page.changes,
        cursor: page.cursor,
        scope: page.scope,
      });
      received += page.changes.length;
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    return {
      kind: "ok",
      sent,
      accepted,
      rejected,
      conflicts,
      received,
      at: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof NetworkError) return { kind: "offline" };
    if (err instanceof ApiError && err.status === 401) return { kind: "session_expired" };
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
