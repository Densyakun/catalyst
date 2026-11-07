/**
 * 優先度決定プロトコル
 *
 * 個人の課題と社会課題を同じ尺度で混ぜず、それぞれの指標から
 * スコアを算出したうえで統合する。すべての計算根拠を reason に残す。
 */

export interface PersonalIndicators {
  urgency: number;      // 緊急度 (0-1)
  impact: number;       // 影響度 (0-1)
  solvability: number;  // 解決可能性 (0-1)
}

export interface SocialIndicators {
  reach: number;          // 影響範囲 (0-1)
  beneficiaries: number;  // 受益者数 (0-1)
  sustainability: number; // 持続性 (0-1)
}

export interface PriorityCriteria {
  personalWeights: PersonalIndicators;
  socialWeights: SocialIndicators;
  personalWeight: number; // 総合スコアに占める個人優先度の重み
  socialWeight: number;   // 総合スコアに占める社会優先度の重み
}

export const DEFAULT_PRIORITY_CRITERIA: PriorityCriteria = {
  personalWeights: { urgency: 0.4, impact: 0.4, solvability: 0.2 },
  socialWeights: { reach: 0.4, beneficiaries: 0.3, sustainability: 0.3 },
  personalWeight: 0.7,
  socialWeight: 0.3,
};

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scorePersonalIndicators(
  indicators: PersonalIndicators,
  criteria: PriorityCriteria = DEFAULT_PRIORITY_CRITERIA,
): number {
  const weights = criteria.personalWeights;
  const urgencyWeight = Math.max(0, weights.urgency);
  const impactWeight = Math.max(0, weights.impact);
  const solvabilityWeight = Math.max(0, weights.solvability);
  const totalWeight = urgencyWeight + impactWeight + solvabilityWeight;

  if (totalWeight <= 0) return 0;

  return clampScore(
    (clampScore(indicators.urgency) * urgencyWeight +
      clampScore(indicators.impact) * impactWeight +
      clampScore(indicators.solvability) * solvabilityWeight) /
      totalWeight,
  );
}

export function scoreSocialIndicators(
  indicators: SocialIndicators,
  criteria: PriorityCriteria = DEFAULT_PRIORITY_CRITERIA,
): number {
  const weights = criteria.socialWeights;
  const reachWeight = Math.max(0, weights.reach);
  const beneficiariesWeight = Math.max(0, weights.beneficiaries);
  const sustainabilityWeight = Math.max(0, weights.sustainability);
  const totalWeight = reachWeight + beneficiariesWeight + sustainabilityWeight;

  if (totalWeight <= 0) return 0;

  return clampScore(
    (clampScore(indicators.reach) * reachWeight +
      clampScore(indicators.beneficiaries) * beneficiariesWeight +
      clampScore(indicators.sustainability) * sustainabilityWeight) /
      totalWeight,
  );
}

export function combinePriorityScores(
  personalScore: number,
  socialScore: number,
  criteria: PriorityCriteria = DEFAULT_PRIORITY_CRITERIA,
): number {
  const personalWeight = Math.max(0, criteria.personalWeight);
  const socialWeight = Math.max(0, criteria.socialWeight);
  const totalWeight = personalWeight + socialWeight;

  if (totalWeight <= 0) return 0;

  return clampScore(
    (clampScore(personalScore) * personalWeight + clampScore(socialScore) * socialWeight) / totalWeight,
  );
}

export interface PriorityBreakdown {
  personalScore: number;
  socialScore: number;
  priorityScore: number;
  personalIndicators: PersonalIndicators;
  socialIndicators: SocialIndicators;
  personalEvaluated: boolean;
  socialEvaluated: boolean;
  reason: string;
}

interface BuildPriorityBreakdownArgs {
  personalScore: number;
  socialScore: number;
  personalIndicators: PersonalIndicators;
  socialIndicators: SocialIndicators;
  criteria?: PriorityCriteria;
  personalEvaluated?: boolean;
  socialEvaluated?: boolean;
  visitBoost?: number;
  socialSource?: string;
}

function percent(value: number): string {
  return `${Math.round(clampScore(value) * 100)}`;
}

export function buildPriorityBreakdown(args: BuildPriorityBreakdownArgs): PriorityBreakdown {
  const criteria = args.criteria ?? DEFAULT_PRIORITY_CRITERIA;
  const personalScore = clampScore(args.personalScore);
  const socialScore = clampScore(args.socialScore);
  const priorityScore = combinePriorityScores(personalScore, socialScore, criteria);

  const personalDetail = args.personalEvaluated
    ? `（緊急度 ${percent(args.personalIndicators.urgency)}・影響度 ${percent(args.personalIndicators.impact)}・解決可能性 ${percent(args.personalIndicators.solvability)}）`
    : '（内訳未評価）';
  const socialDetail = args.socialEvaluated
    ? `（影響範囲 ${percent(args.socialIndicators.reach)}・受益者数 ${percent(args.socialIndicators.beneficiaries)}・持続性 ${percent(args.socialIndicators.sustainability)}）`
    : '（内訳未評価）';

  const parts = [
    `個人優先度 ${percent(personalScore)}${personalDetail}`,
    `社会優先度 ${percent(socialScore)}${socialDetail}`,
    `統合 ${percent(priorityScore)}（個人 ${percent(criteria.personalWeight)}%・社会 ${percent(criteria.socialWeight)}%）`,
  ];

  if (args.visitBoost && args.visitBoost > 0) {
    parts.push(`活動量ブースト +${percent(args.visitBoost)}`);
  }
  if (args.socialSource) {
    parts.push(args.socialSource);
  }

  return {
    personalScore,
    socialScore,
    priorityScore,
    personalIndicators: args.personalIndicators,
    socialIndicators: args.socialIndicators,
    personalEvaluated: Boolean(args.personalEvaluated),
    socialEvaluated: Boolean(args.socialEvaluated),
    reason: parts.join(' / '),
  };
}
