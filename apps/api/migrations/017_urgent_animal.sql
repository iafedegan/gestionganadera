-- 017 · El aviso urgente dice de qué animal se trata, para enviar su hoja de vida.
ALTER TABLE urgent_alert ADD COLUMN IF NOT EXISTS animal_id uuid REFERENCES animal(id);
