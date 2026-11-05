-- 007 · Asistente con IA: conteo diario de preguntas por organización (límite de uso y de costo).
-- No se guarda el contenido de las preguntas ni de las respuestas.

CREATE TABLE assistant_usage (
  organization_id uuid NOT NULL REFERENCES organization(id),
  day date NOT NULL,
  questions integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, day)
);

-- La usa solo el servidor con su conexión administrativa. Sin acceso por API pública.
ALTER TABLE assistant_usage ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON assistant_usage FROM anon, authenticated';
  END IF;
END $$;
