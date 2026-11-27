-- 014 · Foto de perfil: una imagen pequeña (256 px) que cada persona sube para sí misma.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar text
  CHECK (avatar IS NULL OR (length(avatar) <= 200000 AND avatar LIKE 'data:image/%'));
