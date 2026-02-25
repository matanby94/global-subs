-- Negative caching for scrape_requests + priority support for ad-hoc scrapes

-- 1. Add 'not_found' status to scrape_requests
-- Drop old constraint and recreate with new status
ALTER TABLE scrape_requests
  DROP CONSTRAINT IF EXISTS scrape_requests_status_check;
ALTER TABLE scrape_requests
  ADD CONSTRAINT scrape_requests_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'not_found'));

-- 2. Add checked_at column for TTL-based negative cache expiry
ALTER TABLE scrape_requests
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

-- Backfill checked_at for existing completed/failed rows
UPDATE scrape_requests SET checked_at = updated_at WHERE checked_at IS NULL AND status IN ('completed', 'failed');

-- 3. Add priority column (lower number = higher priority, 1 = ad-hoc user request, 10 = background)
ALTER TABLE scrape_requests
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 10;

-- 4. Index for efficient negative-cache lookups and priority ordering
CREATE INDEX IF NOT EXISTS idx_scrape_requests_negative_cache
  ON scrape_requests (src_registry, src_id, lang, status, checked_at)
  WHERE status = 'not_found';

CREATE INDEX IF NOT EXISTS idx_scrape_requests_pending_priority
  ON scrape_requests (status, priority, updated_at)
  WHERE status = 'pending';
