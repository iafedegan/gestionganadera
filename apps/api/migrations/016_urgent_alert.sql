-- 016 · Avisos urgentes: lo que alguien de la finca reporta como emergencia y el veterinario
-- (o asesor) del equipo debe atender.
CREATE TABLE urgent_alert (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization(id),
  farm_id uuid REFERENCES farm(id),
  created_by uuid NOT NULL REFERENCES app_user(id),
  reason text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ack_by uuid REFERENCES app_user(id),
  ack_at timestamptz
);
CREATE INDEX urgent_alert_org ON urgent_alert (organization_id, created_at DESC);

-- Solo la usa el servidor con su conexión administrativa; el acceso se decide en el código.
ALTER TABLE urgent_alert ENABLE ROW LEVEL SECURITY;
