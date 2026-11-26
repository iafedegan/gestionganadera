-- 011 · Extensión híbrida con adopción verificada (Plan CTeI 2026–2030, §6.1.1 y apuesta 2).
-- Primer nivel: el asistente con IA. Segundo nivel: el Secretario Técnico Ganadero del TECNIG@N,
-- que atiende por la plataforma las consultas de las ganaderías de su región que autorizaron
-- compartir su expediente. Cada recomendación lleva su estado de adopción y su verificación.

-- Personal del gremio con acceso de segundo nivel (no pertenece a ninguna ganadería).
CREATE TABLE gremio_staff (
  user_id uuid PRIMARY KEY REFERENCES app_user(id),
  role text NOT NULL CHECK (role IN ('secretario_tecnico')),
  tecnigan text NOT NULL CHECK (char_length(tecnigan) BETWEEN 3 AND 120),
  departments text[] NOT NULL CHECK (cardinality(departments) BETWEEN 1 AND 10),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta escalada al segundo nivel.
CREATE TABLE tech_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid REFERENCES farm(id),
  created_by uuid NOT NULL REFERENCES app_user(id),
  topic text NOT NULL CHECK (topic IN (
    'reproduccion','nutricion','sanidad','praderas','leche','gestion','ambiental','otro'
  )),
  question text NOT NULL CHECK (char_length(question) BETWEEN 10 AND 2000),
  -- Lo que respondió el asistente (primer nivel), para que el técnico no empiece de cero.
  ai_answer text CHECK (char_length(ai_answer) <= 6000),
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','respondida','cerrada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tech_case_org ON tech_case (organization_id, created_at DESC);
CREATE INDEX tech_case_open ON tech_case (status, created_at DESC);

CREATE TABLE tech_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES tech_case(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app_user(id),
  from_staff boolean NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tech_message_case ON tech_message (case_id, created_at);

-- Recomendación técnica con su estado de adopción y su verificación en finca.
CREATE TABLE recommendation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid REFERENCES farm(id),
  case_id uuid REFERENCES tech_case(id),
  author_id uuid NOT NULL REFERENCES app_user(id),
  from_staff boolean NOT NULL,
  topic text NOT NULL CHECK (topic IN (
    'reproduccion','nutricion','sanidad','praderas','leche','gestion','ambiental','otro'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 140),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 2000),
  -- Indicador sectorial al que contribuye (el plan pide declararlo desde el diseño).
  indicator text CHECK (indicator IN (
    'edadPrimerParto','intervaloPartos','natalidad','litrosVacaDia','gananciaDiaria','carga'
  )),
  due_on date,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_curso','adoptada','descartada')),
  adopted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid REFERENCES app_user(id),
  verification_note text CHECK (char_length(verification_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verified_at IS NULL OR status = 'adoptada')
);
CREATE INDEX recommendation_org ON recommendation (organization_id, created_at DESC);

-- Visita de verificación en campo: lleva el expediente del predio al nivel 3.
CREATE TABLE field_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid NOT NULL REFERENCES farm(id),
  verified_by uuid NOT NULL REFERENCES app_user(id),
  visited_on date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_verification_farm ON field_verification (farm_id, visited_on DESC);

-- Solo las usa el servidor con su conexión administrativa; el acceso se decide en el código
-- (miembro de la ganadería, o Secretario Técnico de su región con autorización del dueño).
ALTER TABLE gremio_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_verification ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON gremio_staff, tech_case, tech_message, recommendation, field_verification FROM anon, authenticated';
  END IF;
END $$;
