-- 004 · Perfil de la finca: especialidad, áreas, punto en el mapa y parámetros de manejo por especie.
-- Las áreas se guardan siempre en hectáreas; area_unit es la unidad en que el usuario las ve.

ALTER TABLE farm
  ADD COLUMN production_focus text,
  ADD COLUMN production_system text,
  ADD COLUMN total_area_ha double precision CHECK (total_area_ha > 0),
  ADD COLUMN livestock_area_ha double precision CHECK (livestock_area_ha > 0),
  ADD COLUMN area_unit text NOT NULL DEFAULT 'ha',
  ADD COLUMN latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN species_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT farm_livestock_within_total CHECK (livestock_area_ha <= total_area_ha),
  ADD CONSTRAINT farm_location_pair CHECK ((latitude IS NULL) = (longitude IS NULL));
