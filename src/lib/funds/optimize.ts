import type { FundingPlan } from '@/lib/types/funds';

/**
 * 目的資金 → ユーザー残高 → 社会課題用プール → 分割 の順で
 * 最も無理のない資金源を選ぶ。
 */
export function recommendFundingSource(params: {
  amount: number;
  isSocial: boolean;
  userBalance: number;
  purposeBalance: number;
  poolBalance: number;
}): FundingPlan {
  const amount = Math.max(0, params.amount);
  const userBalance = Math.max(0, params.userBalance);
  const purposeBalance = Math.max(0, params.purposeBalance);
  const poolBalance = Math.max(0, params.poolBalance);

  const base = { amount, user_balance: userBalance, purpose_balance: purposeBalance, pool_balance: poolBalance };

  if (amount === 0) {
    return { ...base, source: 'user', shortfall: 0 };
  }
  if (purposeBalance >= amount) {
    return { ...base, source: 'purpose', shortfall: 0 };
  }
  if (userBalance >= amount) {
    return { ...base, source: 'user', shortfall: 0 };
  }
  if (params.isSocial && poolBalance >= amount) {
    return { ...base, source: 'donation_pool', shortfall: 0 };
  }

  const available = purposeBalance + userBalance + (params.isSocial ? poolBalance : 0);
  if (available >= amount) {
    return { ...base, source: 'split', shortfall: 0 };
  }

  return {
    ...base,
    source: 'none',
    shortfall: Math.round((amount - available) * 100) / 100,
  };
}
