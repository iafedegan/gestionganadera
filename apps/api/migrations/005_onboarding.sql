-- 005 · Registro de cuentas y asistente inicial: perfil del usuario y de la organización.
-- onboarding_pending solo se activa en cuentas creadas por registro; las existentes no lo ven.

ALTER TABLE app_user
  ADD COLUMN phone text,
  ADD COLUMN job_role text,
  ADD COLUMN experience_years integer CHECK (experience_years BETWEEN 0 AND 80),
  ADD COLUMN onboarding_pending boolean NOT NULL DEFAULT false;

ALTER TABLE organization
  ADD COLUMN kind text,
  ADD COLUMN tax_id text,
  ADD COLUMN department text,
  ADD COLUMN municipality text,
  ADD COLUMN goals text[] NOT NULL DEFAULT '{}',
  ADD COLUMN herd_estimate jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN created_by uuid REFERENCES app_user(id);
