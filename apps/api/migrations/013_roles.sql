-- 013 · Roles por función: veterinario y mayordomo (jefe de finca), además de propietario,
-- administrador, operario y asesor técnico.
ALTER TABLE membership DROP CONSTRAINT IF EXISTS membership_role_check;
ALTER TABLE membership ADD CONSTRAINT membership_role_check
  CHECK (role IN ('admin_entidad','propietario','mayordomo','operario','veterinario','tecnico'));
ALTER TABLE invitation DROP CONSTRAINT IF EXISTS invitation_role_check;
ALTER TABLE invitation ADD CONSTRAINT invitation_role_check
  CHECK (role IN ('admin_entidad','mayordomo','operario','veterinario','tecnico'));
