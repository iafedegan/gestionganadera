-- 001 · Núcleo: identidad, fincas, animales, eventos inmutables, sincronización y auditoría.
-- Aislamiento por organización con RLS (defensa en profundidad además de la capa de aplicación).

DO $$ BEGIN
  CREATE ROLE app_rw NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE organization (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  role text NOT NULL CHECK (role IN ('admin_entidad','propietario','operario','tecnico')),
  farm_id uuid, -- NULL = toda la organización
  valid_until timestamptz, -- vigencia (técnicos y asesores)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX membership_scope
  ON membership (user_id, organization_id, COALESCE(farm_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE session (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text
);
CREATE INDEX session_by_user ON session (user_id);

CREATE TABLE org_counter (
  organization_id uuid PRIMARY KEY REFERENCES organization(id),
  version bigint NOT NULL DEFAULT 0
);

CREATE TABLE farm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  code text NOT NULL,
  name text NOT NULL,
  location_text text,
  species_present text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE animal (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid NOT NULL REFERENCES farm(id),
  tag text NOT NULL,
  species text NOT NULL CHECK (species IN ('bovino','bufalino')),
  sex text NOT NULL CHECK (sex IN ('hembra','macho')),
  category text NOT NULL,
  status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','vendido','muerto','otra_salida')),
  birth_date date,
  birth_date_precision text CHECK (birth_date_precision IN ('exacta','estimada')),
  mother_id uuid REFERENCES animal(id),
  father_id uuid REFERENCES animal(id),
  notes text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((birth_date IS NULL) = (birth_date_precision IS NULL))
);
-- No se puede duplicar un identificador activo dentro de una organización (RF L02).
CREATE UNIQUE INDEX animal_tag_activo ON animal (organization_id, tag) WHERE status = 'activo';
CREATE INDEX animal_farm ON animal (farm_id);

-- Eventos: solo se agregan. Las correcciones se hacen con un evento que referencia al anterior.
CREATE TABLE animal_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid NOT NULL REFERENCES farm(id),
  animal_id uuid NOT NULL REFERENCES animal(id),
  type text NOT NULL,
  occurred_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  tz text NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  source text NOT NULL,
  payload jsonb NOT NULL,
  supersedes_event_id uuid REFERENCES animal_event(id)
);
CREATE INDEX animal_event_animal ON animal_event (animal_id, occurred_on);

CREATE TABLE command_log (
  command_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(id),
  user_id uuid NOT NULL REFERENCES app_user(id),
  device_id text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  response jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change (
  organization_id uuid NOT NULL REFERENCES organization(id),
  version bigint NOT NULL,
  farm_id uuid NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (organization_id, version)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(id),
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text NOT NULL,
  hash text NOT NULL
);
CREATE INDEX audit_org ON audit_log (organization_id, id);

-- Inmutabilidad: eventos y auditoría no se modifican ni se borran.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo agregar', TG_TABLE_NAME;
END $$;

CREATE TRIGGER animal_event_immutable BEFORE UPDATE OR DELETE ON animal_event
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Row Level Security por organización.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_counter','farm','animal','animal_event','command_log','change','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON org_counter, farm, animal, command_log TO app_rw;
GRANT SELECT, INSERT ON animal_event, change, audit_log TO app_rw;
GRANT SELECT ON organization TO app_rw;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO app_rw;
