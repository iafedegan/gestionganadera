import type {
  CommunityPostCreate,
  CommunityPostDto,
  CommunityReplyCreate,
  CommunityReplyDto,
  CommunityThreadDto,
  CommunityTopic,
} from "@ganaderia/contracts";
import type { Db } from "./db.js";

/**
 * Comunidad de productores: espacio común a todas las ganaderías (no es de una organización).
 * Del autor solo se publica el nombre y la región; nunca datos de la finca.
 */

export const REPORTS_TO_HIDE = 3;
const PAGE = 30;

interface PostRow {
  id: string;
  topic: CommunityTopic;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  region: string | null;
  created_at: Date | string;
  replies: number | string;
}

interface ReplyRow {
  id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: Date | string;
}

const isoOf = (d: Date | string) => new Date(d).toISOString();

/** Nombre corto para mostrar: nombre y la inicial del apellido. */
export function publicName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Ganadero";
  const [first, second] = parts;
  return second ? `${first} ${second[0]?.toUpperCase()}.` : (first as string);
}

const toPost = (r: PostRow, me: string): CommunityPostDto => ({
  id: r.id,
  topic: r.topic,
  title: r.title,
  body: r.body,
  authorName: publicName(r.author_name),
  region: r.region,
  mine: r.author_id === me,
  createdAt: isoOf(r.created_at),
  replies: Number(r.replies),
});

const POST_SELECT = `
  SELECT p.id, p.topic, p.title, p.body, p.author_id, u.display_name AS author_name, p.region,
         p.created_at,
         (SELECT count(*) FROM community_reply r WHERE r.post_id = p.id AND r.hidden_at IS NULL) AS replies
    FROM community_post p JOIN app_user u ON u.id = p.author_id`;

export async function listPosts(
  db: Db,
  me: string,
  opts: { topic?: CommunityTopic; before?: string; q?: string },
): Promise<{ items: CommunityPostDto[]; nextBefore: string | null }> {
  const where = ["p.hidden_at IS NULL"];
  const params: unknown[] = [];
  if (opts.topic) {
    params.push(opts.topic);
    where.push(`p.topic = $${params.length}`);
  }
  if (opts.before) {
    params.push(opts.before);
    where.push(`p.created_at < $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.body ILIKE $${params.length})`);
  }
  params.push(PAGE + 1);
  const rows = await db.admin((q) =>
    q<PostRow>(
      `${POST_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC LIMIT $${params.length}`,
      params,
    ),
  );
  const items = rows.slice(0, PAGE).map((r) => toPost(r, me));
  return { items, nextBefore: rows.length > PAGE ? (items.at(-1)?.createdAt ?? null) : null };
}

export async function getThread(
  db: Db,
  me: string,
  id: string,
): Promise<CommunityThreadDto | null> {
  return db.admin(async (q) => {
    const [post] = await q<PostRow>(`${POST_SELECT} WHERE p.id = $1 AND p.hidden_at IS NULL`, [id]);
    if (!post) return null;
    const replies = await q<ReplyRow>(
      `SELECT r.id, r.body, r.author_id, u.display_name AS author_name, r.created_at
         FROM community_reply r JOIN app_user u ON u.id = r.author_id
        WHERE r.post_id = $1 AND r.hidden_at IS NULL
        ORDER BY r.created_at LIMIT 300`,
      [id],
    );
    return {
      post: toPost(post, me),
      replies: replies.map(
        (r): CommunityReplyDto => ({
          id: r.id,
          body: r.body,
          authorName: publicName(r.author_name),
          mine: r.author_id === me,
          createdAt: isoOf(r.created_at),
        }),
      ),
    };
  });
}

export async function createPost(
  db: Db,
  me: string,
  orgIds: string[],
  input: CommunityPostCreate,
): Promise<CommunityPostDto> {
  return db.admin(async (q) => {
    // Región: el departamento de la primera ganadería que lo tenga. Nada más de la finca.
    const [org] = orgIds.length
      ? await q<{ department: string | null }>(
          "SELECT department FROM organization WHERE id = ANY($1::uuid[]) AND department IS NOT NULL LIMIT 1",
          [orgIds],
        )
      : [];
    const [row] = await q<{ id: string }>(
      `INSERT INTO community_post (author_id, topic, title, body, region)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [me, input.topic, input.title, input.body, org?.department ?? null],
    );
    const [post] = await q<PostRow>(`${POST_SELECT} WHERE p.id = $1`, [row?.id]);
    return toPost(post as PostRow, me);
  });
}

export async function createReply(
  db: Db,
  me: string,
  postId: string,
  input: CommunityReplyCreate,
): Promise<CommunityReplyDto | null> {
  return db.admin(async (q) => {
    const [post] = await q("SELECT 1 FROM community_post WHERE id = $1 AND hidden_at IS NULL", [
      postId,
    ]);
    if (!post) return null;
    const [r] = await q<ReplyRow>(
      `WITH ins AS (
         INSERT INTO community_reply (post_id, author_id, body) VALUES ($1, $2, $3)
         RETURNING id, body, author_id, created_at
       )
       SELECT ins.*, u.display_name AS author_name FROM ins JOIN app_user u ON u.id = ins.author_id`,
      [postId, me, input.body],
    );
    const row = r as ReplyRow;
    return {
      id: row.id,
      body: row.body,
      authorName: publicName(row.author_name),
      mine: true,
      createdAt: isoOf(row.created_at),
    };
  });
}

/** El autor puede retirar lo suyo; queda oculto, no se borra (trazabilidad de moderación). */
export async function hideOwn(
  db: Db,
  me: string,
  kind: "post" | "reply",
  id: string,
): Promise<boolean> {
  const table = kind === "post" ? "community_post" : "community_reply";
  const rows = await db.admin((q) =>
    q(
      `UPDATE ${table} SET hidden_at = now() WHERE id = $1 AND author_id = $2 AND hidden_at IS NULL RETURNING id`,
      [id, me],
    ),
  );
  return rows.length > 0;
}

/** Reporte de contenido inapropiado. Con tres personas distintas, se oculta para revisión. */
export async function report(
  db: Db,
  me: string,
  kind: "post" | "reply",
  id: string,
): Promise<{ hidden: boolean } | null> {
  const table = kind === "post" ? "community_post" : "community_reply";
  return db.admin(async (q) => {
    const [target] = await q<{ author_id: string }>(
      `SELECT author_id FROM ${table} WHERE id = $1 AND hidden_at IS NULL`,
      [id],
    );
    if (!target) return null;
    if (target.author_id === me) return { hidden: false };
    await q(
      `INSERT INTO community_report (target_kind, target_id, reporter_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [kind, id, me],
    );
    const [c] = await q<{ n: number | string }>(
      "SELECT count(*) AS n FROM community_report WHERE target_kind = $1 AND target_id = $2",
      [kind, id],
    );
    const hidden = Number(c?.n ?? 0) >= REPORTS_TO_HIDE;
    if (hidden) await q(`UPDATE ${table} SET hidden_at = now() WHERE id = $1`, [id]);
    return { hidden };
  });
}
