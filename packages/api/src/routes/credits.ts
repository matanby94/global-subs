import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';
import { TopUpCreditsSchema, PurchaseBundleSchema } from '@stremio-ai-subs/shared';
import { AppError } from '../lib/app-error';
import Stripe from 'stripe';

// ── Stripe setup (gated by env var) ──────────────────────
// When STRIPE_SECRET_KEY is set, all purchases require a valid Stripe payment.
// When unset, the API runs in "sandbox" mode (credits added without payment).
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;
const isSandbox = !stripe;

export async function creditsRoutes(fastify: FastifyInstance) {
  if (isSandbox) {
    fastify.log.warn(
      'STRIPE_SECRET_KEY not set — credits routes running in SANDBOX mode (no payment verification)'
    );
  }

  // Get wallet balance
  fastify.get('/balance', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      'SELECT balance_credits FROM wallets WHERE user_id = $1',
      [user.userId]
    );

    if (result.rows.length === 0) {
      throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
    }

    return reply.send({ balance: result.rows[0].balance_credits });
  });

  // Purchase credit bundle
  fastify.post('/purchase', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const body = PurchaseBundleSchema.parse(request.body);

    // Define bundle packages
    const bundles = {
      starter: { credits: 100, price: 9 },
      pro: { credits: 1000, price: 29 },
    };

    const selectedBundle = bundles[body.bundle];

    // ── Stripe payment verification ──────────────────────
    // In production (when stripe is configured), require a paymentIntentId
    // and verify the payment succeeded before granting credits.
    if (stripe) {
      const { paymentIntentId } = request.body as { paymentIntentId?: string };
      if (!paymentIntentId) {
        throw AppError.badRequest(
          'paymentIntentId is required for purchases',
          'MISSING_PAYMENT_INTENT'
        );
      }

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (intent.status !== 'succeeded') {
        throw AppError.paymentRequired(
          `Payment not completed. Status: ${intent.status}`,
          'PAYMENT_NOT_SUCCEEDED'
        );
      }

      // Verify amount matches the bundle price (in cents)
      if (intent.amount !== selectedBundle.price * 100) {
        throw AppError.badRequest(
          'Payment amount does not match bundle price',
          'PAYMENT_AMOUNT_MISMATCH'
        );
      }

      // Verify this payment intent hasn't already been used
      const existingTx = await fastify.db.query(
        'SELECT id FROM credit_transactions WHERE reference = $1',
        [`stripe_${paymentIntentId}`]
      );
      if (existingTx.rows.length > 0) {
        throw AppError.conflict('Payment already processed', 'PAYMENT_ALREADY_PROCESSED');
      }
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      // Get wallet
      const walletResult = await client.query(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
        [user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const wallet = walletResult.rows[0];

      // Update balance
      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits + $1 WHERE id = $2',
        [selectedBundle.credits, wallet.id]
      );

      // Record transaction with payment reference
      const reference = stripe
        ? `stripe_${(request.body as { paymentIntentId: string }).paymentIntentId}`
        : `sandbox_${body.bundle}_${Date.now()}`;

      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [
          user.userId,
          wallet.id,
          selectedBundle.credits,
          `Bundle purchase: ${body.bundle}`,
          reference,
        ]
      );

      await client.query('COMMIT');

      const newBalance = parseFloat(wallet.balance_credits) + selectedBundle.credits;

      return reply.send({
        success: true,
        bundle: body.bundle,
        creditsAdded: selectedBundle.credits,
        amountPaid: selectedBundle.price,
        newBalance,
        sandbox: isSandbox,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Top up credits (sandbox mode for demo — disabled when Stripe is configured)
  fastify.post('/topup', { preHandler: authenticateUser }, async (request, reply) => {
    if (!isSandbox) {
      throw AppError.forbidden(
        'Direct top-up is disabled in production. Use /purchase with a Stripe payment.',
        'TOPUP_DISABLED'
      );
    }

    const user = request.user as { userId: string };
    const body = TopUpCreditsSchema.parse(request.body);

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      // Get wallet
      const walletResult = await client.query(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
        [user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const wallet = walletResult.rows[0];

      // Update balance
      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits + $1 WHERE id = $2',
        [body.amount, wallet.id]
      );

      // Record transaction
      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [user.userId, wallet.id, body.amount, 'Top-up (sandbox)', `sandbox_topup_${Date.now()}`]
      );

      await client.query('COMMIT');

      const newBalance = parseFloat(wallet.balance_credits) + body.amount;

      return reply.send({ success: true, newBalance, sandbox: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Get transaction history
  fastify.get('/history', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      'SELECT id, delta, reason, reference, created_at FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user.userId]
    );

    return reply.send({ transactions: result.rows });
  });
}
