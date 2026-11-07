import type { ResourceType, UserResource } from '@/lib/types/engine';

/**
 * 家庭内リソース（持ち物・時間・スキル）の使用頻度から余剰を判定する。
 * 追加のDBカラムは使わず、user_resources.metadata に保存する。
 */

export type UsageFrequency = 'daily' | 'weekly' | 'monthly' | 'rare' | 'unused';

export interface UsageFrequencyOption {
  value: UsageFrequency;
  label: string;
  hint: string;
}

export const USAGE_FREQUENCY_OPTIONS: UsageFrequencyOption[] = [
  { value: 'daily', label: '毎日', hint: '毎日使っている' },
  { value: 'weekly', label: '週数回', hint: '週に数回使う' },
  { value: 'monthly', label: '月数回', hint: '月に数回使う' },
  { value: 'rare', label: 'たまに', hint: '数か月に1回くらい' },
  { value: 'unused', label: '未使用', hint: 'ここ半年ほど使っていない' },
];

const USAGE_FREQUENCIES = new Set<string>(USAGE_FREQUENCY_OPTIONS.map((option) => option.value));

export function isUsageFrequency(value: unknown): value is UsageFrequency {
  return typeof value === 'string' && USAGE_FREQUENCIES.has(value);
}

export function readUsageFrequency(
  resource: Pick<UserResource, 'metadata'>,
): UsageFrequency | null {
  const value = resource.metadata?.usage_frequency;
  return isUsageFrequency(value) ? value : null;
}

export type SurplusLevel = 'in_use' | 'watch' | 'surplus';

export interface SurplusAssessment {
  level: SurplusLevel;
  label: string;
  suggestion: string | null;
}

const REUSE_SUGGESTIONS: Record<ResourceType, string> = {
  tool: '再利用・譲渡・ご近所での共有を検討できます',
  time: '空いた時間を別の予定や休息に回せます',
  money: '使っていない予算を目的資金や貯蓄に回せます',
  skill: '知人や地域にスキルを提供できます',
  connection: 'つながりを他の人に紹介できます',
};

/**
 * 使用頻度が未登録なら判定しない（入力負荷を上げない）。
 * 「たまに」は様子見、「未使用」は余剰として扱う。
 */
export function assessSurplus(
  resource: Pick<UserResource, 'resource_type' | 'metadata'>,
): SurplusAssessment | null {
  const frequency = readUsageFrequency(resource);

  if (!frequency) return null;

  if (frequency === 'unused') {
    return {
      level: 'surplus',
      label: '余剰',
      suggestion: REUSE_SUGGESTIONS[resource.resource_type] ?? '再利用・譲渡・共有を検討できます',
    };
  }

  if (frequency === 'rare') {
    return {
      level: 'watch',
      label: '余剰候補',
      suggestion: REUSE_SUGGESTIONS[resource.resource_type] ?? '再利用・譲渡・共有を検討できます',
    };
  }

  return {
    level: 'in_use',
    label: frequency === 'monthly' ? '時々利用' : '活用中',
    suggestion: null,
  };
}

export interface SurplusSummary {
  surplus: number;
  watch: number;
  suggestions: string[];
}

export function summarizeSurplus(
  resources: Array<Pick<UserResource, 'resource_type' | 'metadata'>>,
): SurplusSummary {
  let surplus = 0;
  let watch = 0;
  const suggestions: string[] = [];

  for (const resource of resources) {
    const assessment = assessSurplus(resource);
    if (!assessment) continue;
    if (assessment.level === 'surplus') surplus += 1;
    if (assessment.level === 'watch') watch += 1;
    if (assessment.suggestion && !suggestions.includes(assessment.suggestion)) {
      suggestions.push(assessment.suggestion);
    }
  }

  return { surplus, watch, suggestions };
}
