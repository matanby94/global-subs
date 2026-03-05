-- Add retry tracking columns to user_library so retry state survives
-- translation_requests being cleaned up / recreated by the ensure pipeline.
ALTER TABLE user_library ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE user_library ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;
