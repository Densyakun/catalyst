export interface CreditPack {
  id: string;
  label: string;
  amountJpy: number;
  credits: number;
}

export interface BillingConfig {
  secretKey: string;
  webhookSecret: string;
  currency: string;
  creditsPerYen: number;
  packs: CreditPack[];
  available: boolean;
}

const DEFAULT_CREDITS_PER_YEN = 1;
const MAX_PACKS = 12;

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function slug(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

/**
 * `STRIPE_CREDIT_PACKS` の形式:
 * [
 *   { "id": "starter", "label": "スターター", "amount_jpy": 500, "credits": 400 },
 *   { "id": "standard", "label": "スタンダード", "amount_jpy": 1000 }
 * ]
 *
 * `credits` を省略した場合は `BILLING_CREDITS_PER_YEN` から計算します。
 * プレビュー環境や Stripe 手数料などの運営コストを含めたい場合は、
 * `credits` を金額より少なくするか `BILLING_CREDITS_PER_YEN` を 1 未満にします。
 */
export function parseCreditPacks(
  raw: string | undefined,
  creditsPerYen: number,
): CreditPack[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const packs: CreditPack[] = [];
  const ids = new Set<string>();
  for (const item of parsed.slice(0, MAX_PACKS)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const amount = Number(row.amount_jpy);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) continue;

    const id = slug(String(row.id ?? ''), `pack-${amount}`);
    if (ids.has(id)) continue;
    ids.add(id);

    const explicitCredits = Number(row.credits);
    const credits = Number.isFinite(explicitCredits) && explicitCredits > 0
      ? Math.floor(explicitCredits)
      : Math.floor(amount * creditsPerYen);
    if (credits <= 0) continue;

    packs.push({
      id,
      label: String(row.label ?? `${amount.toLocaleString('ja-JP')}円`).slice(0, 60),
      amountJpy: amount,
      credits,
    });
  }
  return packs;
}

export function getBillingConfig(): BillingConfig {
  const secretKey = text(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = text(process.env.STRIPE_WEBHOOK_SECRET);
  const currency = text(process.env.BILLING_CURRENCY).toLowerCase() || 'jpy';
  const creditsPerYen = toNumber(process.env.BILLING_CREDITS_PER_YEN, DEFAULT_CREDITS_PER_YEN);
  const packs = parseCreditPacks(process.env.STRIPE_CREDIT_PACKS, creditsPerYen);
  return {
    secretKey,
    webhookSecret,
    currency,
    creditsPerYen,
    packs,
    available: Boolean(secretKey && webhookSecret && packs.length > 0),
  };
}

export function findPack(config: BillingConfig, packId: string): CreditPack | null {
  return config.packs.find((pack) => pack.id === packId) ?? null;
}
