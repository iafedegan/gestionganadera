-- 006 · Equipo: invitaciones a empleados, administradores y veterinarios.
-- El código se guarda como hash; vence a los 7 días y sirve una sola vez.

CREATE TABLE invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  code_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin_entidad','operario','tecnico')),
  farm_id uuid REFERENCES farm(id),
  label text NOT NULL,
  access_days integer CHECK (access_days BETWEEN 1 AND 730),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES app_user(id),
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX invitation_org ON invitation (organization_id, created_at DESC);

-- Tabla de identidad: la usa solo el servicio de autenticación. Sin acceso por API pública.
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON invitation FROM anon, authenticated';
  END IF;
END $$;
