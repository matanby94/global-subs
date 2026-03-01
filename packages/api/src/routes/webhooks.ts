import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { BUNDLES, BundleKey } from './credits';
import { AppError } from '../lib/app-error';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim();

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

export async function webhookRoutes(fastify: FastifyInstance) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    fastify.log.warn(
      'Stripe webhook routes disabled (STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set)'
    );
    return;
  }

  // Add a custom content type parser to capture the raw body for Stripe signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      try {
        // Store raw buffer for signature verification, but also parse JSON for Fastify
        (_req as unknown as { rawBody: Buffer }).rawBody = body;
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    }
  );

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const sig = request.headers['stripe-signature'] as string;
    if (!sig) {
      throw AppError.badRequest('Missing stripe-signature header', 'MISSING_SIGNATURE');
    }

    let event: Stripe.Event;
    try {
      // Fastify stores raw body when rawBody config is set
      const rawBody =
        (request as unknown as { rawBody?: Buffer }).rawBody ||
        (typeof request.body === 'string' ? request.body : JSON.stringify(request.body));

      event = stripe.webhooks.constructEvent(
        rawBody as string | Buffer,
        sig,
        STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      fastify.log.error({ err }, 'Stripe webhook signature verification failed');
      throw AppError.badRequest('Webhook signature verification failed', 'INVALID_SIGNATURE');
    }

    fastify.log.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received');

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(fastify, event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(fastify, event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(fastify, event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(fastify, event.data.object as Stripe.Subscription);
        break;

      default:
        fastify.log.info({ eventType: event.type }, 'Unhandled Stripe event type');
    }

    return reply.send({ received: true });
  });
}

/**
 * checkout.session.completed — grant credits for bundle purchases,
 * or create subscription record for subscription checkouts.
 */
async function handleCheckoutCompleted(fastify: FastifyInstance, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    fastify.log.warn({ sessionId: session.id }, 'Checkout session missing userId metadata');
    return;
  }

  if (session.mode === 'payment') {
    // One-time bundle purchase
    const bundleKey = session.metadata?.bundle as BundleKey | undefined;
    const credits = parseInt(session.metadata?.credits || '0', 10);

    if (!bundleKey || !BUNDLES[bundleKey] || credits <= 0) {
      fastify.log.warn({ sessionId: session.id, bundleKey }, 'Invalid bundle metadata');
      return;
    }

    // Prevent duplicate processing
    const existing = await fastify.db.query(
      'SELECT id FROM credit_transactions WHERE reference = $1',
      [`stripe_cs_${session.id}`]
    );
    if (existing.rows.length > 0) {
      fastify.log.info({ sessionId: session.id }, 'Checkout session already processed');
      return;
    }

    // Grant credits in a transaction
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      const walletResult = await client.query(
        'SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (walletResult.rows.length === 0) {
        fastify.log.error({ userId }, 'Wallet not found for checkout completion');
        await client.query('ROLLBACK');
        return;
      }

      const walletId = walletResult.rows[0].id;

      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits + $1, updated_at = NOW() WHERE id = $2',
        [credits, walletId]
      );

      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [
          userId,
          walletId,
          credits,
          `Bundle purchase: ${BUNDLES[bundleKey].label}`,
          `stripe_cs_${session.id}`,
        ]
      );

      await client.query('COMMIT');
      fastify.log.info(
        { userId, credits, bundle: bundleKey },
        'Credits granted via Stripe checkout'
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else if (session.mode === 'subscription') {
    // Subscription created — record will be finalized by invoice.paid / subscription.updated
    const stripeSubscriptionId = session.subscription as string;
    const stripeCustomerId = session.customer as string;

    if (!stripeSubscriptionId) {
      fastify.log.warn({ sessionId: session.id }, 'Subscription checkout missing subscription ID');
      return;
    }

    // Upsert subscription record
    await fastify.db.query(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'unlimited', 'active', NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT (user_id) DO UPDATE SET
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         status = 'active',
         current_period_start = NOW(),
         current_period_end = NOW() + INTERVAL '30 days',
         cancel_at_period_end = FALSE,
         updated_at = NOW()`,
      [userId, stripeSubscriptionId, stripeCustomerId]
    );

    // Ensure stripe_customer_id is stored on user
    await fastify.db.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2 AND (stripe_customer_id IS NULL OR stripe_customer_id != $1)',
      [stripeCustomerId, userId]
    );

    fastify.log.info(
      { userId, stripeSubscriptionId },
      'Subscription activated via Stripe checkout'
    );
  }
}

/**
 * invoice.paid — update subscription period dates.
 */
async function handleInvoicePaid(fastify: FastifyInstance, invoice: Stripe.Invoice) {
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

  if (!subscriptionId) return;

  const periodStart = invoice.lines?.data?.[0]?.period?.start;
  const periodEnd = invoice.lines?.data?.[0]?.period?.end;

  if (periodStart && periodEnd) {
    await fastify.db.query(
      `UPDATE subscriptions SET
         status = 'active',
         current_period_start = to_timestamp($1),
         current_period_end = to_timestamp($2),
         updated_at = NOW()
       WHERE stripe_subscription_id = $3`,
      [periodStart, periodEnd, subscriptionId]
    );

    fastify.log.info(
      { subscriptionId, periodEnd: new Date(periodEnd * 1000).toISOString() },
      'Subscription period updated'
    );
  }
}

/**
 * customer.subscription.updated — sync status changes (cancellation, payment failure, etc.)
 */
async function handleSubscriptionUpdated(fastify: FastifyInstance, sub: Stripe.Subscription) {
  const status = mapStripeStatus(sub.status);

  await fastify.db.query(
    `UPDATE subscriptions SET
       status = $1,
       cancel_at_period_end = $2,
       current_period_start = to_timestamp($3),
       current_period_end = to_timestamp($4),
       updated_at = NOW()
     WHERE stripe_subscription_id = $5`,
    [status, sub.cancel_at_period_end, sub.current_period_start, sub.current_period_end, sub.id]
  );

  fastify.log.info(
    { subscriptionId: sub.id, status, cancelAtPeriodEnd: sub.cancel_at_period_end },
    'Subscription updated'
  );
}

/**
 * customer.subscription.deleted — mark subscription as canceled.
 */
async function handleSubscriptionDeleted(fastify: FastifyInstance, sub: Stripe.Subscription) {
  await fastify.db.query(
    `UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = FALSE, updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [sub.id]
  );

  fastify.log.info({ subscriptionId: sub.id }, 'Subscription canceled/deleted');
}

/**
 * Map Stripe subscription status to our DB enum.
 */
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'trialing':
      return 'trialing';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    default:
      return 'canceled';
  }
}
