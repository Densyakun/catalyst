import { createClient } from '@/lib/supabase-server';
import type { CostEstimate, OperationType, FundingSource } from '@/lib/types/engine';

/**
 * Layer別のデフォルト単価（円）
 * Layer 0: ルールベース（無料）
 * Layer 1: LLMスコアリング（軽量）
 * Layer 2: アイデア生成（中コスト）
 * Layer 3: 実行（可変）
 */
const LAYER_UNIT_COSTS: Record<number, number> = {
  0: 0,
  1: 0.5,
  2: 5,
  3: 10,
};

/**
 * 操作タイプからLayer番号を推定
 */
export function getLayerForOperation(operationType: OperationType): number {
  switch (operationType) {
    case 'marking':
      return 0;
    case 'scoring':
      return 1;
    case 'idea_generation':
      return 2;
    case 'decomposition':
      return 2;
    case 'task_execution':
      return 3;
    default:
      return 0;
  }
}

/**
 * 操作のコストを推定
 */
export function estimateOperationCost(
  operationType: OperationType,
  itemCount: number = 1,
): number {
  const layer = getLayerForOperation(operationType);
  const unitCost = LAYER_UNIT_COSTS[layer] ?? 0;
  return unitCost * itemCount;
}

/**
 * 推定コストが指定された上限を超えるか判定する。
 * 上限が未指定（undefined/null）の場合は制限なしとして false を返す。
 */
export function exceedsCostLimit(
  estimatedCost: number,
  maxCost?: number | null,
): boolean {
  if (maxCost == null || !Number.isFinite(maxCost)) return false;
  return estimatedCost > maxCost;
}

/**
 * 社会課題の推定受益者数を取得
 */
export async function getEstimatedBeneficiaries(
  category: string,
): Promise<{ avg: number; min: number; max: number }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('beneficiary_stats')
    .select('avg_beneficiaries, median_beneficiaries, sample_count')
    .eq('category', category)
    .limit(1)
    .single();

  if (data && data.sample_count > 0) {
    const avg = Number(data.avg_beneficiaries);
    return {
      avg,
      min: Math.max(1, Math.floor(avg * 0.5)),
      max: Math.ceil(avg * 2),
    };
  }

  // デフォルト値（データなし）
  const defaults: Record<string, number> = {
    '仕事': 200,
    '生活': 500,
    '趣味': 300,
    '健康': 400,
    '人間関係': 150,
    '学習': 350,
    'お金': 250,
  };

  const avg = defaults[category] ?? 100;
  return { avg, min: Math.max(1, Math.floor(avg * 0.2)), max: avg * 5 };
}

/**
 * ユーザー負担額を算出
 */
export async function calculateCostEstimate(
  totalCost: number,
  isSocial: boolean,
  category?: string,
): Promise<CostEstimate> {
  if (!isSocial) {
    return {
      total_cost: totalCost,
      user_share: totalCost,
      user_share_range: null,
      estimated_beneficiaries: null,
      is_social: false,
      funded_by: 'user',
    };
  }

  const beneficiaries = await getEstimatedBeneficiaries(
    category || 'その他',
  );

  const minShare = totalCost / beneficiaries.max;
  const maxShare = totalCost / beneficiaries.min;
  const avgShare = totalCost / beneficiaries.avg;

  return {
    total_cost: totalCost,
    user_share: Math.round(avgShare * 100) / 100,
    user_share_range: {
      min: Math.round(minShare * 100) / 100,
      max: Math.round(maxShare * 100) / 100,
    },
    estimated_beneficiaries: beneficiaries.avg,
    is_social: true,
    funded_by: avgShare <= 0 ? 'donation_pool' : 'user',
  };
}

/**
 * コストログに記録
 */
export async function logCost(params: {
  userId: string;
  operationType: OperationType;
  actualCost: number;
  isSocial?: boolean;
  fundedBy?: FundingSource;
  inputItemIds?: string[];
  estimatedBeneficiaries?: number;
  estimatedUserShare?: number;
  relatedProjectId?: string;
  relatedTaskId?: string;
}): Promise<void> {
  const supabase = await createClient();
  const layer = getLayerForOperation(params.operationType);

  await supabase.from('cost_log').insert({
    user_id: params.userId,
    operation_type: params.operationType,
    layer,
    actual_cost: params.actualCost,
    is_social: params.isSocial ?? false,
    funded_by: params.fundedBy ?? 'user',
    input_item_ids: params.inputItemIds ?? [],
    estimated_beneficiaries: params.estimatedBeneficiaries,
    estimated_user_share: params.estimatedUserShare,
    related_project_id: params.relatedProjectId,
    related_task_id: params.relatedTaskId,
  });
}

/**
 * ユーザー残高を取得（なければ作成）
 */
export async function getUserBalance(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_balance')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (data) return Number(data.balance);

  // 初回：残高レコード作成
  await supabase.from('user_balance').insert({
    user_id: userId,
    balance: 0,
    total_charged: 0,
    total_deposited: 0,
  });

  return 0;
}

/**
 * ユーザー残高を消費
 */
export async function chargeUser(userId: string, amount: number): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_balance')
    .select('balance, total_charged')
    .eq('user_id', userId)
    .single();

  if (!data || Number(data.balance) < amount) return false;

  await supabase
    .from('user_balance')
    .update({
      balance: Number(data.balance) - amount,
      total_charged: Number(data.total_charged) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return true;
}

/**
 * 寄付プールから資金調達
 */
export async function fundFromPool(amount: number): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('donation_pool')
    .select('id, balance, total_spent')
    .limit(1)
    .single();

  if (!data || Number(data.balance) < amount) return false;

  await supabase
    .from('donation_pool')
    .update({
      balance: Number(data.balance) - amount,
      total_spent: Number(data.total_spent) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id);

  return true;
}
