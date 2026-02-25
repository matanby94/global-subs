-- Add OAuth provider columns to users table
-- Supports: 'email' (legacy), 'google', 'apple'
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider_id VARCHAR(255);

-- Allow users to have NULL email when using Apple Sign-In (Apple can hide email)
-- but ensure uniqueness within provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_id
  ON users (auth_provider, auth_provider_id)
  WHERE auth_provider_id IS NOT NULL;

-- Add avatar_url for profile pictures from OAuth providers
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
