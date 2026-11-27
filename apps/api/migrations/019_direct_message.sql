-- 019 · Mensajes entre personas del mismo equipo (veterinario, propietario, trabajadores).
CREATE TABLE direct_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  body text,
  media_type text,
  media bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (body IS NOT NULL OR media IS NOT NULL),
  CHECK (media IS NULL OR octet_length(media) <= 3500000)
);
CREATE INDEX direct_message_pair ON direct_message (sender_id, recipient_id, created_at);
CREATE INDEX direct_message_inbox ON direct_message (recipient_id, created_at);

-- Solo la usa el servidor con su conexión administrativa; el acceso se decide en el código.
ALTER TABLE direct_message ENABLE ROW LEVEL SECURITY;
