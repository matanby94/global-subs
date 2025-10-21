-- Seed demo user with credits
INSERT INTO users (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo@stremio-ai.com', 'Demo User')
ON CONFLICT (email) DO NOTHING;

INSERT INTO wallets (user_id, balance_credits)
VALUES ('00000000-0000-0000-0000-000000000001', 100.00)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference)
SELECT 
    '00000000-0000-0000-0000-000000000001',
    w.id,
    100.00,
    'Initial demo credits',
    'DEMO_SEED'
FROM wallets w
WHERE w.user_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;
