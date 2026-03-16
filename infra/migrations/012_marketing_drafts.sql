-- 012: Marketing drafts table for AI-generated marketing content
-- Stores platform-specific content drafts produced by the marketing-agent script.
-- Semi-automated workflow: draft → approved → posted (or rejected).

CREATE TABLE IF NOT EXISTS marketing_drafts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform          TEXT NOT NULL,              -- 'reddit', 'twitter', 'discord', 'hackernews', 'producthunt', 'stremio_forum'
    content_type      TEXT NOT NULL,              -- 'social_post', 'forum_reply', 'changelog'
    title             TEXT,                       -- post title (nullable — some platforms don't need it)
    body              TEXT NOT NULL,              -- main content (markdown)
    target            TEXT,                       -- subreddit name, channel, thread URL, etc.
    metadata          JSONB NOT NULL DEFAULT '{}',-- platform-specific extras (hashtags, flair, tags, etc.)
    status            TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'approved', 'posted', 'rejected'
    source_report_id  UUID REFERENCES analytics_reports(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    posted_at         TIMESTAMPTZ,
    rejection_reason  TEXT,
    raw_prompt        TEXT,                       -- prompt sent to LLM (for debugging)
    raw_response      TEXT,                       -- full LLM response (for auditing)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_status_platform
    ON marketing_drafts (status, platform);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_created_at
    ON marketing_drafts (created_at DESC);
