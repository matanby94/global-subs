import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { paypalEnabled, verifyWebhookSignature, getSubscriptionDetails } from '../lib/paypal';
import { BUNDLES, BundleKey } from './credits';

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID?.trim();

export async function paypalWebhookRoutes(fastify: FastifyInstance) {
  if (!paypalEnabled || !PAYPAL_WEBHOOK_ID) {
    fastify.log.warn(
      'PayPal webhook routes disabled (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, or PAYPAL_WEBHOOK_ID not set)'
    );
    return;
  }

  // Add a custom content type parser to capture the raw body for signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      try {
        (_req as unknown as { rawBody: Buffer }).rawBody = body;
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error);
      }
    }
  );

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody =
      (request as unknown as { rawBody?: Buffer }).rawBody?.toString() ||
      (typeof request.body === 'string' ? request.body : JSON.stringify(request.body));

    // Verify webhook signature
    const verified = await verifyWebhookSignature({
      webhookId: PAYPAL_WEBHOOK_ID!,
      headers: request.headers as Record<string, string | string[] | undefined>,
      body: rawBody,
    });

    if (!verified) {
      fastify.log.warn('PayPal webhook signature verification failed');
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    const event = request.body as {
      event_type: string;
      resource: Record<string, unknown>;
    };

    fastify.log.info({ eventType: event.event_type }, 'PayPal webhook received');

    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCaptureCompleted(fastify, event.resource);
        break;

      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(fastify, event.resource);
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCanceled(fastify, event.resource);
        break;

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionSuspended(fastify, event.resource);
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await handleSubscriptionPaymentFailed(fastify, event.resource);
        break;

      default:
        fastify.log.info({ eventType: event.event_type }, 'Unhandled PayPal event type');
    }

    return reply.send({ received: true });
  });
}

/**
 * PAYMENT.CAPTURE.COMPLETED — a one-time order payment was captured.
 * Used as backup; primary credit granting happens via /paypal-capture route.
 */
async function handlePaymentCaptureCompleted(
  fastify: FastifyInstance,
  resource: Record<string, unknown>
) {
  const captureId = resource.id as string | undefined;
  const customId = resource.custom_id as string | undefined;

  if (!customId) {
    fastify.log.info({ captureId }, 'PayPal capture has no custom_id, skipping');
    return;
  }

  let meta: { userId?: string; bundle?: string; credits?: number } = {};
  try {
    meta = JSON.parse(customId);
  } catch {
    fastify.log.warn({ customId }, 'Failed to parse PayPal custom_id');
    return;
  }

  const { userId, bundle, credits } = meta;
  if (!userId || !bundle || !credits) return;

  const bundleKey = bundle as BundleKey;
  if (!BUNDLES[bundleKey]) return;

  // Prevent duplicate processing
  const reference = `paypal_capture_${captureId}`;
  const existing = await fastify.db.query(
    'SELECT id FROM credit_transactions WHERE reference = $1',
    [reference]
  );
  if (existing.rows.length > 0) {
    fastify.log.info({ captureId }, 'PayPal capture already processed');
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
      fastify.log.error({ userId }, 'Wallet not found for PayPal capture');
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
        `Bundle purchase: ${BUNDLES[bundleKey].label} (PayPal webhook)`,
        reference,
      ]
    );

    await client.query('COMMIT');
    fastify.log.info(
      { userId, credits, bundle: bundleKey, captureId },
      'Credits granted via PayPal webhook'
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * BILLING.SUBSCRIPTION.ACTIVATED — subscription became active after initial payment.
 */
async function handleSubscriptionActivated(
  fastify: FastifyInstance,
  resource: Record<string, unknown>
) {
  const ppSubId = resource.id as string;
  const customId = resource.custom_id as string | undefined;

  let userId: string | undefined;
  try {
    const meta = JSON.parse(customId || '{}');
    userId = meta.userId;
  } catch {
    /* ignore */
  }

  if (!userId) {
    // Try to find by subscription id
    const userResult = await fastify.db.query(
      'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
      [`paypal_${ppSubId}`]
    );
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].user_id;
    }
  }

  if (!userId) {
    fastify.log.warn({ ppSubId }, 'Cannot identify user for PayPal subscription activation');
    return;
  }

  let periodEnd: Date;
  try {
    const details = await getSubscriptionDetails(ppSubId);
    periodEnd = details.currentPeriodEnd
      ? new Date(details.currentPeriodEnd)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  } catch {
    periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  await fastify.db.query(
    `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_start, current_period_end)
     VALUES ($1, $2, $3, 'unlimited', 'active', NOW(), $4)
     ON CONFLICT (user_id) DO UPDATE SET
       status = 'active',
       current_period_start = NOW(),
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = FALSE,
       updated_at = NOW()`,
    [userId, `paypal_${ppSubId}`, `paypal_subscriber`, periodEnd]
  );

  fastify.log.info({ userId, ppSubId }, 'PayPal subscription activated via webhook');
}

/**
 * BILLING.SUBSCRIPTION.CANCELLED
 */
async function handleSubscriptionCanceled(
  fastify: FastifyInstance,
  resource: Record<string, unknown>
) {
  const ppSubId = resource.id as string;

  await fastify.db.query(
    `UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = FALSE, updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [`paypal_${ppSubId}`]
  );

  fastify.log.info({ ppSubId }, 'PayPal subscription canceled via webhook');
}

/**
 * BILLING.SUBSCRIPTION.SUSPENDED — payment issue, treat as past_due.
 */
async function handleSubscriptionSuspended(
  fastify: FastifyInstance,
  resource: Record<string, unknown>
) {
  const ppSubId = resource.id as string;

  await fastify.db.query(
    `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [`paypal_${ppSubId}`]
  );

  fastify.log.info({ ppSubId }, 'PayPal subscription suspended (past_due) via webhook');
}

/**
 * BILLING.SUBSCRIPTION.PAYMENT.FAILED
 */
async function handleSubscriptionPaymentFailed(
  fastify: FastifyInstance,
  resource: Record<string, unknown>
) {
  const ppSubId = resource.id as string;

  await fastify.db.query(
    `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [`paypal_${ppSubId}`]
  );

  fastify.log.info({ ppSubId }, 'PayPal subscription payment failed via webhook');
}
