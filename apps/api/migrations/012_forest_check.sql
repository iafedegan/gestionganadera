-- 012 · Trazabilidad libre de deforestación (Plan CTeI 2026–2030; Ley 2585 de 2026; Reglamento (UE)
-- 2023/1115, corte 31-dic-2020): cada revisión de pérdida de bosque dentro del lindero de una finca
-- se guarda con el lindero usado y el resultado, como soporte ante compradores y autoridades.

CREATE TABLE forest_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid NOT NULL REFERENCES farm(id),
  checked_by uuid NOT NULL REFERENCES app_user(id),
  boundary jsonb NOT NULL,
  area_ha double precision NOT NULL,
  loss_after_cutoff_ha double precision NOT NULL,
  result jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forest_check_farm ON forest_check (farm_id, checked_at DESC);

-- Solo la usa el servidor con su conexión administrativa; el acceso se decide en el código.
ALTER TABLE forest_check ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON forest_check FROM anon, authenticated';
  END IF;
END $$;
