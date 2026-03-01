/**
 * PayPal REST API v2 helper.
 *
 * Uses the PayPal Orders API for one-time purchases and the PayPal
 * Subscriptions API for recurring plans. Authentication is handled via
 * OAuth2 client-credentials flow (/v1/oauth2/token).
 *
 * When `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are not set the
 * helpers export `paypalEnabled = false` and every call throws early
 * so the rest of the codebase can feature-gate cleanly.
 */

// ── Config ───────────────────────────────────────────────────
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID?.trim();
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET?.trim();
const PAYPAL_MODE = (process.env.PAYPAL_MODE?.trim() || 'sandbox') as 'sandbox' | 'live';

const BASE_URL =
  PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

export const paypalEnabled = Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);

// ── OAuth2 Access Token (cached in-memory) ──────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured');
  }

  // Re-use token if still valid (with 60s margin)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth2 failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

// ── Helper: authenticated fetch ─────────────────────────────
async function ppFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

// ── Orders API (one-time purchases) ─────────────────────────

export interface CreateOrderParams {
  /** Price in cents (USD) */
  amountCents: number;
  /** Description shown in PayPal checkout */
  description: string;
  /** Our internal metadata — encoded in `custom_id` (max 127 chars) */
  customId: string;
  /** URL PayPal redirects to after approval */
  returnUrl: string;
  /** URL PayPal redirects to on cancel */
  cancelUrl: string;
}

export interface CreateOrderResult {
  orderId: string;
  approvalUrl: string;
}

export async function createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
  const amount = (params.amountCents / 100).toFixed(2);

  const res = await ppFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: amount },
          description: params.description,
          custom_id: params.customId,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            brand_name: 'GlobalSubs',
            landing_page: 'LOGIN',
            user_action: 'PAY_NOW',
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal createOrder failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    links: Array<{ rel: string; href: string }>;
  };

  const approvalLink =
    data.links.find((l) => l.rel === 'payer-action') || data.links.find((l) => l.rel === 'approve');

  if (!approvalLink) {
    throw new Error('PayPal order response missing approval link');
  }

  return { orderId: data.id, approvalUrl: approvalLink.href };
}

export interface CaptureResult {
  orderId: string;
  status: string;
  customId: string | undefined;
  captureId: string | undefined;
  payerEmail: string | undefined;
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const res = await ppFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal captureOrder failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    purchase_units: Array<{
      payments?: {
        captures?: Array<{ id: string; custom_id?: string }>;
      };
      custom_id?: string;
    }>;
    payer?: { email_address?: string };
  };

  const pu = data.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];

  return {
    orderId: data.id,
    status: data.status,
    customId: capture?.custom_id || pu?.custom_id,
    captureId: capture?.id,
    payerEmail: data.payer?.email_address,
  };
}

// ── Subscriptions API (recurring) ───────────────────────────

export interface CreateSubscriptionParams {
  /** PayPal Billing Plan ID (pre-created in PayPal dashboard or via API) */
  planId: string;
  /** Our internal metadata */
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  approvalUrl: string;
}

export async function createSubscription(
  params: CreateSubscriptionParams
): Promise<CreateSubscriptionResult> {
  const res = await ppFetch('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: params.planId,
      custom_id: params.customId,
      application_context: {
        brand_name: 'GlobalSubs',
        user_action: 'SUBSCRIBE_NOW',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal createSubscription failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    links: Array<{ rel: string; href: string }>;
  };

  const approvalLink = data.links.find((l) => l.rel === 'approve');
  if (!approvalLink) {
    throw new Error('PayPal subscription response missing approval link');
  }

  return { subscriptionId: data.id, approvalUrl: approvalLink.href };
}

export interface PayPalSubscriptionDetails {
  id: string;
  status: string;
  planId: string;
  customId?: string;
  startTime?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  payerEmail?: string;
}

export async function getSubscriptionDetails(
  subscriptionId: string
): Promise<PayPalSubscriptionDetails> {
  const res = await ppFetch(`/v1/billing/subscriptions/${subscriptionId}`);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal getSubscription failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    plan_id: string;
    custom_id?: string;
    start_time?: string;
    billing_info?: {
      last_payment?: { time?: string };
      next_billing_time?: string;
    };
    subscriber?: { email_address?: string };
  };

  return {
    id: data.id,
    status: data.status,
    planId: data.plan_id,
    customId: data.custom_id,
    startTime: data.start_time,
    currentPeriodStart: data.billing_info?.last_payment?.time || data.start_time,
    currentPeriodEnd: data.billing_info?.next_billing_time,
    payerEmail: data.subscriber?.email_address,
  };
}

export async function cancelSubscription(
  subscriptionId: string,
  reason: string = 'Canceled by user'
): Promise<void> {
  const res = await ppFetch(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`PayPal cancelSubscription failed (${res.status}): ${text}`);
  }
}

// ── Webhook signature verification ──────────────────────────

export interface WebhookVerifyParams {
  webhookId: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * Verify a PayPal webhook event via the PayPal Webhook Verify API.
 * Returns `true` if the event is authentic.
 */
export async function verifyWebhookSignature(params: WebhookVerifyParams): Promise<boolean> {
  const res = await ppFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: params.headers['paypal-auth-algo'] as string,
      cert_url: params.headers['paypal-cert-url'] as string,
      transmission_id: params.headers['paypal-transmission-id'] as string,
      transmission_sig: params.headers['paypal-transmission-sig'] as string,
      transmission_time: params.headers['paypal-transmission-time'] as string,
      webhook_id: params.webhookId,
      webhook_event: JSON.parse(params.body),
    }),
  });

  if (!res.ok) return false;

  const data = (await res.json()) as { verification_status: string };
  return data.verification_status === 'SUCCESS';
}
