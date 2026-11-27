-- 015 · Clave propia de IA (Google Gemini) de cada ganadería. La clave se guarda cifrada y
-- nunca se devuelve a la aplicación; solo se muestran sus últimos 4 caracteres.
CREATE TABLE org_ai (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  provider text NOT NULL CHECK (provider IN ('gemini')),
  key_cipher text NOT NULL,
  key_last4 text NOT NULL,
  model text NOT NULL,
  updated_by uuid NOT NULL REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo la usa el servidor con su conexión administrativa; el acceso se decide en el código.
ALTER TABLE org_ai ENABLE ROW LEVEL SECURITY;
