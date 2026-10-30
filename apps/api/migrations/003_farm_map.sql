-- 003 · Mapa de la finca: lindero y potreros dibujados (coordenadas WGS84).
-- farm_map guarda la versión vigente; farm_map_revision conserva cada versión y no se modifica.

CREATE TABLE farm_map (
  farm_id uuid PRIMARY KEY REFERENCES farm(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  revision integer NOT NULL CHECK (revision > 0),
  boundary jsonb,
  paddocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid NOT NULL REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE farm_map_revision (
  farm_id uuid NOT NULL REFERENCES farm(id),
  organization_id uuid NOT NULL REFERENCES organization(id),
  revision integer NOT NULL,
  boundary jsonb,
  paddocks jsonb NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  command_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (farm_id, revision)
);

CREATE TRIGGER farm_map_revision_immutable BEFORE UPDATE OR DELETE ON farm_map_revision
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['farm_map','farm_map_revision']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON farm_map TO app_rw;
GRANT SELECT, INSERT ON farm_map_revision TO app_rw;
