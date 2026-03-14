-- 011: Analytics reports table for AI-generated user analytics
-- Stores daily and weekly reports produced by the user-analytics-agent script.

CREATE TABLE IF NOT EXISTS analytics_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type     TEXT NOT NULL,              -- 'daily' or 'weekly'
    report_date     DATE NOT NULL,              -- the date (or week-start) the report covers
    summary         TEXT NOT NULL,              -- GPT-4o generated executive summary (markdown)
    metrics         JSONB NOT NULL DEFAULT '{}',-- structured metrics snapshot
    user_insights   JSONB NOT NULL DEFAULT '[]',-- per-user recommendations array
    raw_prompt      TEXT,                       -- prompt sent to LLM (for debugging)
    raw_response    TEXT,                       -- full LLM response (for auditing)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_analytics_report UNIQUE (report_type, report_date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_reports_type_date
    ON analytics_reports (report_type, report_date DESC);
