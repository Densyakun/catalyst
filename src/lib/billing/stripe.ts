/**
 * Stripe 連携の最小実装（Cloudflare Workers / Node 22 共通）。
 * 公式 SDK を使わず、Checkout Session の作成と Webhook 署名検証だけを行う。
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export interface StripeCheckoutInput {
  amountJpy: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  customerEmail?: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  paymentIntent: string | null;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Stripe-Signature ヘッダーを検証する。
 * https://docs.stripe.com/webhooks/signature
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  let timestamp = '';
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') timestamp = value || '';
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    ),
  );
  const expected = hex(digest);
  return signatures.some((signature) => timingSafeEqualHex(signature, expected));
}

export async function createStripeCheckoutSession(
  secretKey: string,
  input: StripeCheckoutInput,
): Promise<StripeCheckoutSession> {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', input.successUrl);
  form.set('cancel_url', input.cancelUrl);
  form.set('client_reference_id', input.clientReferenceId);
  if (input.customerEmail) form.set('customer_email', input.customerEmail);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', input.currency);
  form.set('line_items[0][price_data][unit_amount]', String(input.amountJpy));
  form.set('line_items[0][price_data][product_data][name]', input.productName);
  for (const [key, value] of Object.entries(input.metadata)) {
    form.set(`metadata[${key}]`, value);
    form.set(`payment_intent_data[metadata][${key}]`, value);
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: form.toString(),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = data?.error as { message?: unknown } | undefined;
    throw new Error(
      typeof error?.message === 'string' ? error.message : `Stripe API ${res.status}`,
    );
  }

  const id = typeof data.id === 'string' ? data.id : '';
  const url = typeof data.url === 'string' ? data.url : '';
  if (!id || !url) throw new Error('Stripe の決済URLを取得できませんでした');
  return {
    id,
    url,
    paymentIntent: typeof data.payment_intent === 'string' ? data.payment_intent : null,
  };
}
