-- 002 · ERP 1: catálogo de insumos y movimientos de existencias (solo se agregan).

CREATE TABLE supply (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organization(id),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('alimento','medicamento','suplemento','fertilizante','material')),
  unit text NOT NULL CHECK (unit IN ('kg','L','dosis','bulto','unidad')),
  min_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  notes text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supply_name_unique ON supply (organization_id, lower(name));

CREATE TABLE stock_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid NOT NULL REFERENCES farm(id),
  supply_id uuid NOT NULL REFERENCES supply(id),
  kind text NOT NULL CHECK (kind IN ('entrada','consumo')),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  lot_code text,
  expires_on date,
  unit_cost numeric(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  supplier text,
  target_kind text,
  target_label text,
  occurred_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  command_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  note text
);
CREATE INDEX stock_movement_balance ON stock_movement (farm_id, supply_id, lot_code, expires_on);

CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supply','stock_movement']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) WITH CHECK (organization_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON supply, stock_movement TO app_rw;
