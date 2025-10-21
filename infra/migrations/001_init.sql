-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_credits NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create credit_transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    delta NUMERIC(12, 2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    reference VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create pricing_rules table
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    charge_mode VARCHAR(50) NOT NULL CHECK (charge_mode IN ('always', 'first_only', 'within_time_window')),
    amount_per_use_credits NUMERIC(12, 2) NOT NULL,
    time_window_ms BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create artifacts table
CREATE TABLE IF NOT EXISTS artifacts (
    hash VARCHAR(64) PRIMARY KEY,
    src_registry VARCHAR(255) NOT NULL,
    src_id VARCHAR(255) NOT NULL,
    src_lang VARCHAR(10) NOT NULL,
    dst_lang VARCHAR(10) NOT NULL,
    model VARCHAR(50) NOT NULL,
    cost_chars INTEGER NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    checks_passed JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create serve_events table
CREATE TABLE IF NOT EXISTS serve_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artifact_hash VARCHAR(64) NOT NULL REFERENCES artifacts(hash) ON DELETE CASCADE,
    pricing_rule_id UUID NOT NULL REFERENCES pricing_rules(id) ON DELETE CASCADE,
    credits_debited NUMERIC(12, 2) NOT NULL,
    served_at TIMESTAMP NOT NULL DEFAULT NOW(),
    request_meta JSONB NOT NULL DEFAULT '{}'
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(50) NOT NULL CHECK (kind IN ('ingest', 'translate', 'postcheck')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_serve_events_user_id ON serve_events(user_id);
CREATE INDEX idx_serve_events_artifact_hash ON serve_events(artifact_hash);
CREATE INDEX idx_serve_events_served_at ON serve_events(served_at);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_kind ON jobs(kind);
CREATE INDEX idx_artifacts_src_registry_src_id ON artifacts(src_registry, src_id);

-- Insert default pricing rule
INSERT INTO pricing_rules (name, charge_mode, amount_per_use_credits, time_window_ms)
VALUES ('Standard Usage', 'always', 1.00, NULL)
ON CONFLICT DO NOTHING;
