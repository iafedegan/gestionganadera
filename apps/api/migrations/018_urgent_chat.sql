-- 018 · Chat de la urgencia entre quien reporta y quien atiende, con fotos y videos cortos.
CREATE TABLE urgent_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES urgent_alert(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app_user(id),
  body text,
  media_type text,
  media bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR media IS NOT NULL),
  CHECK (media IS NULL OR octet_length(media) <= 3500000)
);
CREATE INDEX urgent_message_alert ON urgent_message (alert_id, created_at);

-- Solo la usa el servidor con su conexión administrativa; el acceso se decide en el código.
ALTER TABLE urgent_message ENABLE ROW LEVEL SECURITY;
