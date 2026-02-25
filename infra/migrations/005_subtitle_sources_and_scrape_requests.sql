-- Baseline subtitle sources scraped from external providers (internal use only)

CREATE TABLE IF NOT EXISTS subtitle_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_registry TEXT NOT NULL,
  src_id TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  download_url TEXT,
  content_hash VARCHAR(64) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  original_format TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'invalid', 'blocked', 'takedown', 'failed')),
  validation JSONB NOT NULL DEFAULT '{}',
  meta JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (src_registry, src_id, lang, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_subtitle_sources_lookup ON subtitle_sources (src_registry, src_id, lang);
CREATE INDEX IF NOT EXISTS idx_subtitle_sources_fetched_at ON subtitle_sources (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_subtitle_sources_content_hash ON subtitle_sources (content_hash);
CREATE INDEX IF NOT EXISTS idx_subtitle_sources_provider_ref ON subtitle_sources (provider, provider_ref);

CREATE OR REPLACE FUNCTION set_updated_at_subtitle_sources()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_subtitle_sources ON subtitle_sources;
CREATE TRIGGER trg_set_updated_at_subtitle_sources
BEFORE UPDATE ON subtitle_sources
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_subtitle_sources();

-- Idempotent scrape status tracking per (content, language)
CREATE TABLE IF NOT EXISTS scrape_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_registry TEXT NOT NULL,
  src_id TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  provider TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (src_registry, src_id, lang)
);

CREATE INDEX IF NOT EXISTS idx_scrape_requests_status ON scrape_requests (status);
CREATE INDEX IF NOT EXISTS idx_scrape_requests_lookup ON scrape_requests (src_registry, src_id, lang);

CREATE OR REPLACE FUNCTION set_updated_at_scrape_requests()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_scrape_requests ON scrape_requests;
CREATE TRIGGER trg_set_updated_at_scrape_requests
BEFORE UPDATE ON scrape_requests
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at_scrape_requests();
