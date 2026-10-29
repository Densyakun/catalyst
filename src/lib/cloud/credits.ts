import { createAdminClient } from '@/lib/supabase-admin';
import { getCloudConfig } from './config';

export interface CloudUsage {
  runtimeSeconds: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function calculateCloudCredits(usage: CloudUsage): number {
  const config = getCloudConfig();
  const minutes = Math.max(0, usage.runtimeSeconds) / 60;
  const timeCredits = minutes * config.creditPerMinute;
  const totalTokens = Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens);
  const tokenCredits = Math.max(
    Math.max(0, usage.costUsd) * config.creditPerUsd,
    (totalTokens / 1000) * config.creditPer1kTokens,
  );
  // プレビュー環境や課金手数料など、DB に残らない運営コストを上乗せする。
  const overhead = 1 + Math.max(0, config.creditOverheadPercent) / 100;
  const total = (timeCredits + tokenCredits) * config.creditMarkup * overhead;
  if (total <= 0) return 0;
  return Math.max(1, Math.round(total * 10) / 10);
}

export async function getAdminUserBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_balance')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  return data ? Number(data.balance) : 0;
}

export async function chargeUserUpTo(
  userId: string,
  amount: number,
): Promise<{ charged: number; shortfall: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { charged: 0, shortfall: 0 };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('user_balance')
    .select('balance, total_charged')
    .eq('user_id', userId)
    .maybeSingle();

  const balance = data ? Number(data.balance) : 0;
  const charged = Math.round(Math.max(0, Math.min(balance, amount)) * 10) / 10;
  const shortfall = Math.round((amount - charged) * 10) / 10;

  if (data && charged > 0) {
    await admin
      .from('user_balance')
      .update({
        balance: Number((balance - charged).toFixed(2)),
        total_charged: Number((Number(data.total_charged) + charged).toFixed(2)),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }

  return { charged, shortfall };
}

export async function chargePoolUpTo(
  amount: number,
): Promise<{ charged: number; shortfall: number }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { charged: 0, shortfall: 0 };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('donation_pool')
    .select('id, balance, total_spent')
    .limit(1)
    .maybeSingle();

  if (!data) return { charged: 0, shortfall: amount };

  const balance = Number(data.balance);
  const charged = Math.round(Math.max(0, Math.min(balance, amount)) * 10) / 10;
  const shortfall = Math.round((amount - charged) * 10) / 10;

  if (charged > 0) {
    await admin
      .from('donation_pool')
      .update({
        balance: Number((balance - charged).toFixed(2)),
        total_spent: Number((Number(data.total_spent) + charged).toFixed(2)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);
  }

  return { charged, shortfall };
}
