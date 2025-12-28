-- User entitlement table: charge once per (content + target language)
CREATE TABLE IF NOT EXISTS user_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    library_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, library_key)
);

CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON user_library(user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_library_key ON user_library(library_key);

-- Request tracking for cache-miss flows (can exist before artifact exists)
CREATE TABLE IF NOT EXISTS translation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artifact_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    request_meta JSONB NOT NULL DEFAULT '{}',
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, artifact_hash)
);

CREATE INDEX IF NOT EXISTS idx_translation_requests_user_id ON translation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_translation_requests_artifact_hash ON translation_requests(artifact_hash);
CREATE INDEX IF NOT EXISTS idx_translation_requests_status ON translation_requests(status);
