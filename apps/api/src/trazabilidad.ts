import type { ForestCheckDto, ForestCheckRequest } from "@ganaderia/contracts";
import type { Db } from "./db.js";
import { type ForestLossOptions, type Pt, forestLoss, ringAreaHa } from "./forestLoss.js";

/** Tope de área por revisión y de revisiones por ganadería al día (la fuente es pública y gratuita). */
export const MAX_AREA_HA = 200_000;
export const CHECKS_PER_DAY = 20;

interface Row {
  id: string;
  farm_id: string;
  checked_at: Date | string;
  checked_by: string;
  boundary: [number, number][];
  result: {
    areaHa: number;
    lossAfterCutoffHa: number;
    lossBeforeCutoffHa: number;
    byYear: Record<string, number>;
    source: string;
    version: string;
    pixelHa: number;
  };
}
const toDto = (r: Row): ForestCheckDto => ({
  id: r.id,
  farmId: r.farm_id,
  checkedAt: (r.checked_at instanceof Date ? r.checked_at : new Date(r.checked_at)).toISOString(),
  checkedBy: r.checked_by,
  areaHa: r.result.areaHa,
  lossAfterCutoffHa: r.result.lossAfterCutoffHa,
  lossBeforeCutoffHa: r.result.lossBeforeCutoffHa,
  byYear: r.result.byYear,
  source: r.result.source,
  version: r.result.version,
  pixelHa: r.result.pixelHa,
  boundary: r.boundary,
});
const SELECT = `SELECT c.id, c.farm_id, c.checked_at, u.display_name AS checked_by, c.boundary, c.result
  FROM forest_check c JOIN app_user u ON u.id = c.checked_by`;

/** Última revisión de cada finca de la ganadería. */
export async function latestChecks(db: Db, orgId: string): Promise<ForestCheckDto[]> {
  const rows = await db.admin((q) =>
    q<Row>(
      `SELECT DISTINCT ON (c.farm_id) c.id, c.farm_id, c.checked_at, u.display_name AS checked_by, c.boundary, c.result
         FROM forest_check c JOIN app_user u ON u.id = c.checked_by
        WHERE c.organization_id = $1 ORDER BY c.farm_id, c.checked_at DESC`,
      [orgId],
    ),
  );
  return rows.map(toDto);
}

export type CheckError = { error: "NO_EXISTE" | "AREA" | "LIMITE" };

export async function runCheck(
  db: Db,
  userId: string,
  input: ForestCheckRequest,
  opts: ForestLossOptions = {},
): Promise<ForestCheckDto | CheckError> {
  const ring = input.boundary as Pt[];
  if (ringAreaHa(ring) > MAX_AREA_HA) return { error: "AREA" };
  const ok = await db.admin(async (q) => {
    const [f] = await q("SELECT 1 FROM farm WHERE id = $1 AND organization_id = $2", [
      input.farmId,
      input.organizationId,
    ]);
    if (!f) return "NO_EXISTE" as const;
    const [n] = await q<{ n: string }>(
      "SELECT count(*) AS n FROM forest_check WHERE organization_id = $1 AND checked_at > now() - interval '1 day'",
      [input.organizationId],
    );
    return Number(n?.n ?? 0) >= CHECKS_PER_DAY ? ("LIMITE" as const) : null;
  });
  if (ok) return { error: ok };
  const r = await forestLoss(ring, opts);
  const [row] = await db.admin((q) =>
    q<{ id: string }>(
      `INSERT INTO forest_check (organization_id, farm_id, checked_by, boundary, area_ha, loss_after_cutoff_ha, result)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        input.organizationId,
        input.farmId,
        userId,
        JSON.stringify(ring),
        r.areaHa,
        r.lossAfterCutoffHa,
        JSON.stringify(r),
      ],
    ),
  );
  const [saved] = await db.admin((q) => q<Row>(`${SELECT} WHERE c.id = $1`, [row?.id]));
  return toDto(saved as Row);
}
