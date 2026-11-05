-- 008 · Perfil de la finca respondido por el ganadero (cuestionario y diagnóstico inicial).
ALTER TABLE organization
  ADD COLUMN profile jsonb,
  ADD COLUMN profile_updated_at timestamptz;
