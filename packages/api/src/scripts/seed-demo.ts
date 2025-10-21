import { db } from '../db';

async function seedDemo() {
  try {
    console.log('Seeding demo user...');

    // Insert demo user
    const userResult = await db.query(
      `INSERT INTO users (id, email, name)
       VALUES ('00000000-0000-0000-0000-000000000001', 'demo@stremio-ai.com', 'Demo User')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

    const userId = userResult.rows[0].id;

    // Ensure wallet exists
    const walletResult = await db.query(
      `INSERT INTO wallets (user_id, balance_credits)
       VALUES ($1, 100.00)
       ON CONFLICT (user_id) DO UPDATE SET balance_credits = 100.00
       RETURNING id`,
      [userId]
    );

    const walletId = walletResult.rows[0].id;

    // Add transaction
    await db.query(
      `INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference)
       VALUES ($1, $2, 100.00, 'Demo seed', 'DEMO_SEED')`,
      [userId, walletId]
    );

    console.log('✅ Demo user seeded successfully');
    console.log('   Email: demo@stremio-ai.com');
    console.log('   Credits: 100');

    process.exit(0);
  } catch (err) {
    console.error('Failed to seed demo:', err);
    process.exit(1);
  }
}

seedDemo();
