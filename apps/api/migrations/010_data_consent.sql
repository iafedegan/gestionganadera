-- 010 · Protocolo de datos del productor (Plan CTeI 2026–2030, §6.2.6): consentimiento informado
-- y solicitudes de rectificación o supresión (Ley 1581 de 2012). El consentimiento se guarda como
-- historial: cada cambio es una fila nueva y vale la más reciente.

CREATE TABLE data_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  version text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 20),
  -- Uso agregado y anónimo de los datos de la finca para análisis sectorial.
  sector_analysis boolean NOT NULL,
  -- Compartir el expediente de la finca con el equipo técnico del gremio (Secretario Técnico).
  share_technical boolean NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_consent_user ON data_consent (user_id, accepted_at DESC);

CREATE TABLE data_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  kind text NOT NULL CHECK (kind IN ('rectificacion', 'supresion', 'consulta')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'recibida' CHECK (status IN ('recibida', 'en_tramite', 'resuelta')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_request_user ON data_request (user_id, created_at DESC);

-- Solo las usa el servidor con su conexión administrativa. Sin acceso por API pública.
ALTER TABLE data_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_request ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON data_consent, data_request FROM anon, authenticated';
  END IF;
END $$;
