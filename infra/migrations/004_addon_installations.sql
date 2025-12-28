-- Add per-user addon installation tokens (opaque, URL-safe)
-- Used to install a personalized Stremio addon without exposing user JWTs in URLs.

CREATE TABLE IF NOT EXISTS addon_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dst_lang TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addon_installations_user_id ON addon_installations(user_id);

CREATE OR REPLACE FUNCTION set_updated_at_addon_installations()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_addon_installations ON addon_installations;
CREATE TRIGGER trg_set_updated_at_addon_installations
BEFORE UPDATE ON addon_installations
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_addon_installations();
