-- 020 · Borrar un chat: cada persona borra su copia. Lo anterior a `cleared_at` deja de verse
-- para quien borró; cuando las dos personas borraron, esos mensajes se eliminan del todo.
CREATE TABLE chat_clear (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, other_id)
);

-- Solo la usa el servidor con su conexión administrativa; el acceso se decide en el código.
ALTER TABLE chat_clear ENABLE ROW LEVEL SECURITY;
