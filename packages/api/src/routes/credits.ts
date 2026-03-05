import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';
import {
  TopUpCreditsSchema,
  PurchaseBundleSchema,
  CreateSubscriptionSchema,
  CancelSubscriptionSchema,
} from '@stremio-ai-subs/shared';
import { AppError } from '../lib/app-error';
import Stripe from 'stripe';
import {
  paypalEnabled,
  createOrder as ppCreateOrder,
  captureOrder as ppCaptureOrder,
  createSubscription as ppCreateSubscription,
  getSubscriptionDetails as ppGetSubscription,
  cancelSubscription as ppCancelSubscription,
} from '../lib/paypal';

// ── Stripe setup (gated by env var) ──────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;
const isSandbox = !stripe;

// ── Bundle definitions ───────────────────────────────────
export const BUNDLES = {
  pack50: { credits: 50, priceInCents: 900, label: '50 Pack' },
  pack100: { credits: 100, priceInCents: 1500, label: '100 Pack' },
} as const;

export type BundleKey = keyof typeof BUNDLES;

// ── Subscription config ──────────────────────────────────
const SUBSCRIPTION_PRICE_ID = process.env.STRIPE_PRICE_UNLIMITED?.trim();
const PAYPAL_PLAN_UNLIMITED = process.env.PAYPAL_PLAN_UNLIMITED?.trim();

// Frontend redirect URLs after checkout
// CORS_ORIGIN may contain multiple comma-separated origins; use only the first for redirects
const FRONTEND_ORIGIN = process.env.STRIPE_SUCCESS_URL?.trim()
  ? undefined
  : (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0].trim();
const SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL?.trim() || `${FRONTEND_ORIGIN}/app?payment=success`;
const CANCEL_URL =
  process.env.STRIPE_CANCEL_URL?.trim() || `${FRONTEND_ORIGIN}/app?payment=canceled`;

/**
 * Helper: ensure Stripe Customer exists for a user, creating one if needed.
 * Stores the stripe_customer_id on the users table.
 */
async function ensureStripeCustomer(fastify: FastifyInstance, userId: string): Promise<string> {
  if (!stripe) throw AppError.badRequest('Stripe not configured');

  // Check if user already has a Stripe customer
  const userResult = await fastify.db.query(
    'SELECT stripe_customer_id, email, name FROM users WHERE id = $1',
    [userId]
  );
  if (userResult.rows.length === 0) throw AppError.notFound('User not found');

  const user = userResult.rows[0];

  if (user.stripe_customer_id) return user.stripe_customer_id;

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId },
  });

  await fastify.db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
    customer.id,
    userId,
  ]);

  return customer.id;
}

/**
 * Helper: check if user has an active subscription.
 */
export async function hasActiveSubscription(
  fastify: FastifyInstance,
  userId: string
): Promise<boolean> {
  const result = await fastify.db.query(
    `SELECT id FROM subscriptions
     WHERE user_id = $1 AND status = 'active' AND current_period_end > NOW()`,
    [userId]
  );
  return result.rows.length > 0;
}

export async function creditsRoutes(fastify: FastifyInstance) {
  if (isSandbox) {
    fastify.log.warn(
      'STRIPE_SECRET_KEY not set — credits routes running in SANDBOX mode (no payment verification)'
    );
  }
  if (paypalEnabled) {
    fastify.log.info('PayPal payment method enabled');
  }

  // ── GET /balance ── wallet balance + subscription status ──
  fastify.get('/balance', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const walletResult = await fastify.db.query(
      'SELECT balance_credits FROM wallets WHERE user_id = $1',
      [user.userId]
    );

    if (walletResult.rows.length === 0) {
      throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
    }

    const subResult = await fastify.db.query(
      `SELECT plan, status, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE user_id = $1`,
      [user.userId]
    );

    const subscription =
      subResult.rows.length > 0
        ? {
            plan: subResult.rows[0].plan,
            status: subResult.rows[0].status,
            currentPeriodEnd: subResult.rows[0].current_period_end,
            cancelAtPeriodEnd: subResult.rows[0].cancel_at_period_end,
          }
        : null;

    return reply.send({
      balance: walletResult.rows[0].balance_credits,
      subscription,
    });
  });

  // ── POST /purchase ── Create Stripe Checkout Session for credit bundle ──
  fastify.post('/purchase', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const body = PurchaseBundleSchema.parse(request.body);
    const selectedBundle = BUNDLES[body.bundle];

    if (body.paymentMethod === 'paypal' && paypalEnabled) {
      // PayPal: create an order and return the approval URL
      const customId = JSON.stringify({
        userId: user.userId,
        bundle: body.bundle,
        credits: selectedBundle.credits,
      });

      const order = await ppCreateOrder({
        amountCents: selectedBundle.priceInCents,
        description: `GlobalSubs ${selectedBundle.label} — ${selectedBundle.credits} subtitle translations`,
        customId,
        returnUrl: SUCCESS_URL,
        cancelUrl: CANCEL_URL,
      });

      return reply.send({
        checkoutUrl: order.approvalUrl,
        orderId: order.orderId,
        provider: 'paypal',
      });
    }

    if (stripe) {
      // Stripe: create Stripe Checkout Session
      const customerId = await ensureStripeCustomer(fastify, user.userId);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: selectedBundle.priceInCents,
              product_data: {
                name: `GlobalSubs ${selectedBundle.label}`,
                description: `${selectedBundle.credits} subtitle translations`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: user.userId,
          bundle: body.bundle,
          credits: String(selectedBundle.credits),
        },
        success_url: `${SUCCESS_URL}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: CANCEL_URL,
      });

      return reply.send({
        checkoutUrl: session.url,
        sessionId: session.id,
        provider: 'stripe',
      });
    }

    // Sandbox: grant credits directly without payment
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      const walletResult = await client.query(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
        [user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const wallet = walletResult.rows[0];

      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits + $1 WHERE id = $2',
        [selectedBundle.credits, wallet.id]
      );

      const reference = `sandbox_${body.bundle}_${Date.now()}`;
      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [
          user.userId,
          wallet.id,
          selectedBundle.credits,
          `Bundle purchase: ${selectedBundle.label}`,
          reference,
        ]
      );

      await client.query('COMMIT');

      const newBalance = parseFloat(wallet.balance_credits) + selectedBundle.credits;

      return reply.send({
        success: true,
        bundle: body.bundle,
        creditsAdded: selectedBundle.credits,
        newBalance,
        sandbox: true,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── POST /subscribe ── Create Stripe Checkout Session for unlimited subscription ──
  fastify.post('/subscribe', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const subBody = CreateSubscriptionSchema.parse(request.body || {});

    // Check for existing active subscription
    const existing = await hasActiveSubscription(fastify, user.userId);
    if (existing) {
      throw AppError.conflict('You already have an active subscription', 'ALREADY_SUBSCRIBED');
    }

    if (subBody.paymentMethod === 'paypal' && paypalEnabled && PAYPAL_PLAN_UNLIMITED) {
      // PayPal: Create a subscription and return the approval URL
      const result = await ppCreateSubscription({
        planId: PAYPAL_PLAN_UNLIMITED,
        customId: JSON.stringify({ userId: user.userId, plan: 'unlimited' }),
        returnUrl: SUCCESS_URL,
        cancelUrl: CANCEL_URL,
      });

      return reply.send({
        checkoutUrl: result.approvalUrl,
        subscriptionId: result.subscriptionId,
        provider: 'paypal',
      });
    }

    if (stripe && SUBSCRIPTION_PRICE_ID) {
      const customerId = await ensureStripeCustomer(fastify, user.userId);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: SUBSCRIPTION_PRICE_ID, quantity: 1 }],
        metadata: {
          userId: user.userId,
          plan: 'unlimited',
        },
        success_url: `${SUCCESS_URL}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: CANCEL_URL,
      });

      return reply.send({
        checkoutUrl: session.url,
        sessionId: session.id,
        provider: 'stripe',
      });
    }

    // Sandbox: create a mock subscription
    await fastify.db.query(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'unlimited', 'active', NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'active',
         current_period_start = NOW(),
         current_period_end = NOW() + INTERVAL '30 days',
         cancel_at_period_end = FALSE,
         updated_at = NOW()`,
      [user.userId, `sandbox_sub_${Date.now()}`, `sandbox_cus_${Date.now()}`]
    );

    return reply.send({ success: true, sandbox: true, plan: 'unlimited' });
  });

  // ── POST /cancel-subscription ── Cancel a subscription at period end ──
  fastify.post('/cancel-subscription', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    CancelSubscriptionSchema.parse(request.body || {});

    const subResult = await fastify.db.query(
      'SELECT stripe_subscription_id, status FROM subscriptions WHERE user_id = $1',
      [user.userId]
    );

    if (subResult.rows.length === 0) {
      throw AppError.notFound('No subscription found', 'NO_SUBSCRIPTION');
    }

    const sub = subResult.rows[0];

    if (sub.status === 'canceled') {
      throw AppError.badRequest('Subscription is already canceled', 'ALREADY_CANCELED');
    }

    if (
      stripe &&
      !sub.stripe_subscription_id.startsWith('sandbox_') &&
      !sub.stripe_subscription_id.startsWith('paypal_')
    ) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    // PayPal subscription cancellation — defer to period end like Stripe.
    // We set cancel_at_period_end=TRUE in our DB now; the actual PayPal cancel
    // happens via a scheduled task or when period expires. This keeps UX consistent.
    // If we must cancel immediately at PayPal (e.g., refund), handle it separately.
    if (paypalEnabled && sub.stripe_subscription_id.startsWith('paypal_')) {
      // Note: PayPal doesn't have a native "cancel at period end" — we track it
      // ourselves and the user keeps access until current_period_end.
      // The actual PayPal subscription will be cancelled via webhook or when period expires.
      const ppSubId = sub.stripe_subscription_id.replace('paypal_', '');
      try {
        await ppCancelSubscription(ppSubId, 'Canceled by user — effective at period end');
      } catch (err) {
        fastify.log.warn(
          { err, ppSubId },
          'PayPal cancel API call failed — marking cancel_at_period_end anyway'
        );
      }
    }

    await fastify.db.query(
      'UPDATE subscriptions SET cancel_at_period_end = TRUE, updated_at = NOW() WHERE user_id = $1',
      [user.userId]
    );

    return reply.send({ success: true, cancelAtPeriodEnd: true });
  });

  // ── GET /subscription ── Get current subscription details ──
  fastify.get('/subscription', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      `SELECT plan, status, current_period_start, current_period_end, cancel_at_period_end, created_at
       FROM subscriptions WHERE user_id = $1`,
      [user.userId]
    );

    if (result.rows.length === 0) {
      return reply.send({ subscription: null });
    }

    const row = result.rows[0];
    return reply.send({
      subscription: {
        plan: row.plan,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        createdAt: row.created_at,
      },
    });
  });

  // ── POST /topup ── sandbox only for development ──
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

      const walletResult = await client.query(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
        [user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const wallet = walletResult.rows[0];

      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits + $1 WHERE id = $2',
        [body.amount, wallet.id]
      );

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

  // ── GET /bundles ── Return available bundles (for frontend display) ──
  fastify.get('/bundles', async (_request, reply) => {
    const providers: string[] = [];
    if (stripe || isSandbox) providers.push('stripe');
    if (paypalEnabled) providers.push('paypal');

    return reply.send({
      bundles: Object.entries(BUNDLES).map(([key, b]) => ({
        id: key,
        credits: b.credits,
        priceInCents: b.priceInCents,
        label: b.label,
      })),
      subscription: {
        plan: 'unlimited',
        priceInCents: 1200,
        label: 'Unlimited Monthly',
        interval: 'month',
      },
      paymentProviders: providers,
    });
  });

  // ── GET /history ── Transaction history ──
  fastify.get('/history', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      'SELECT id, delta, reason, reference, created_at FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user.userId]
    );

    return reply.send({ transactions: result.rows });
  });

  // ── POST /paypal-capture ── Capture a PayPal order after user approval ──
  fastify.post('/paypal-capture', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const { orderId, subscriptionId } = (request.body || {}) as {
      orderId?: string;
      subscriptionId?: string;
    };

    if (!paypalEnabled) {
      throw AppError.badRequest('PayPal is not configured', 'PAYPAL_NOT_CONFIGURED');
    }

    // ── Handle subscription approval ──
    if (subscriptionId) {
      const details = await ppGetSubscription(subscriptionId);

      if (details.status !== 'ACTIVE' && details.status !== 'APPROVED') {
        throw AppError.badRequest(
          `PayPal subscription is not active (status: ${details.status})`,
          'PP_SUBSCRIPTION_NOT_ACTIVE'
        );
      }

      // Verify customId matches the user
      let meta: { userId?: string } = {};
      try {
        meta = JSON.parse(details.customId || '{}');
      } catch {
        /* ignore */
      }

      if (meta.userId && meta.userId !== user.userId) {
        throw AppError.forbidden('Subscription does not belong to this user', 'PP_USER_MISMATCH');
      }

      const periodEnd = details.currentPeriodEnd
        ? new Date(details.currentPeriodEnd)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await fastify.db.query(
        `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
         VALUES ($1, $2, $3, 'unlimited', 'active', NOW(), $4)
         ON CONFLICT (user_id) DO UPDATE SET
           stripe_subscription_id = EXCLUDED.stripe_subscription_id,
           stripe_customer_id = EXCLUDED.stripe_customer_id,
           status = 'active',
           current_period_start = NOW(),
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = FALSE,
           updated_at = NOW()`,
        [
          user.userId,
          `paypal_${subscriptionId}`,
          `paypal_${details.payerEmail || 'unknown'}`,
          periodEnd,
        ]
      );

      fastify.log.info({ userId: user.userId, subscriptionId }, 'PayPal subscription activated');

      return reply.send({ success: true, provider: 'paypal', type: 'subscription' });
    }

    // ── Handle one-time order capture ──
    if (!orderId) {
      throw AppError.badRequest('Either orderId or subscriptionId is required', 'MISSING_PARAM');
    }

    // Prevent duplicate processing
    const existing = await fastify.db.query(
      'SELECT id FROM credit_transactions WHERE reference = $1',
      [`paypal_order_${orderId}`]
    );
    if (existing.rows.length > 0) {
      return reply.send({ success: true, alreadyProcessed: true, provider: 'paypal' });
    }

    const captured = await ppCaptureOrder(orderId);

    if (captured.status !== 'COMPLETED') {
      throw AppError.badRequest(
        `PayPal order not completed (status: ${captured.status})`,
        'PP_ORDER_NOT_COMPLETED'
      );
    }

    // Parse our metadata from custom_id
    let meta: { userId?: string; bundle?: string; credits?: number } = {};
    try {
      meta = JSON.parse(captured.customId || '{}');
    } catch {
      /* ignore */
    }

    if (meta.userId && meta.userId !== user.userId) {
      throw AppError.forbidden('Order does not belong to this user', 'PP_USER_MISMATCH');
    }

    const bundleKey = meta.bundle as BundleKey | undefined;
    const credits = meta.credits || 0;

    if (!bundleKey || !BUNDLES[bundleKey] || credits <= 0) {
      throw AppError.badRequest('Invalid bundle metadata in PayPal order', 'PP_INVALID_META');
    }

    // Grant credits in a transaction
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      const walletResult = await client.query(
        'SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE',
        [user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw AppError.notFound('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const walletId = walletResult.rows[0].id;

      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits + $1, updated_at = NOW() WHERE id = $2',
        [credits, walletId]
      );

      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [
          user.userId,
          walletId,
          credits,
          `Bundle purchase: ${BUNDLES[bundleKey].label} (PayPal)`,
          `paypal_order_${orderId}`,
        ]
      );

      await client.query('COMMIT');

      fastify.log.info(
        { userId: user.userId, credits, bundle: bundleKey, orderId },
        'Credits granted via PayPal'
      );

      return reply.send({ success: true, creditsAdded: credits, provider: 'paypal' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
