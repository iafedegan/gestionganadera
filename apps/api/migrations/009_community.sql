-- 009 · Comunidad de productores (FEDEGÁN 5.0): preguntas y experiencias entre ganaderos.
-- Es un espacio común a todas las ganaderías: no pertenece a una organización y no lleva datos
-- de la finca. Del autor solo se muestra su nombre y, si la tiene, la región de su ganadería.

CREATE TABLE community_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES app_user(id),
  topic text NOT NULL CHECK (topic IN (
    'experiencias','sanidad','reproduccion','pasturas','leche','carne','bufalos','mercado','tecnologia'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 140),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 4000),
  region text,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_post_recent ON community_post (created_at DESC) WHERE hidden_at IS NULL;

CREATE TABLE community_reply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_post(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app_user(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 3000),
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_reply_post ON community_reply (post_id, created_at);

-- Un reporte por persona y publicación; con tres reportes la publicación se oculta para revisión.
CREATE TABLE community_report (
  target_kind text NOT NULL CHECK (target_kind IN ('post','reply')),
  target_id uuid NOT NULL,
  reporter_id uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, reporter_id)
);

-- Solo las usa el servidor con su conexión administrativa. Sin acceso por API pública.
ALTER TABLE community_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reply ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_report ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON community_post, community_reply, community_report FROM anon, authenticated';
  END IF;
END $$;
