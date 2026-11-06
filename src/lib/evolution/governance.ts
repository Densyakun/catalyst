import type {
  EvolutionActorRole,
  EvolutionActorType,
  EvolutionGovernance,
  EvolutionGovernanceDecision,
  EvolutionLayer,
  ProposalCategory,
  ProposalStatus,
} from '@/lib/types/evolution';

export const CORE_VERSION = 'core-v1';

const CORE_PATTERNS = [
  /憲法|constitution/i,
  /ガバナンス|governance/i,
  /セキュリティ|security|credential|secret/i,
  /権限|permission|authorization|authorisation/i,
  /認証|auth/i,
  /(^|[^a-z])core([^a-z]|$)|コア/i,
  /自動適用|auto[\s_-]?apply/i,
  /最終判断|final[\s_-]?decision/i,
  /エージェント設定|agent[\s_-]?config|opencode/i,
  /プロンプト.{0,12}バージョン|prompt.{0,12}version/i,
  /システムプロンプト|system[\s_-]?prompt/i,
];

const SEMANTIC_PATTERNS = [
  /プロンプト|prompt/i,
  /モデル|model|llm/i,
  /ロジック|logic|アルゴリズム|algorithm/i,
  /スコア|score|判定|分類|classif/i,
  /セマンティック|semantic/i,
  /優先度|priority|評価|evaluat/i,
];

const INTERFACE_PATTERNS = [
  /(^|[^a-z])ui([^a-z]|$)|(^|[^a-z])ux([^a-z]|$)/i,
  /画面|表示|layout|レイアウト|デザイン|design/i,
  /component|コンポーネント|css|スタイル|style/i,
  /ボタン|button|文言|コピー|dashboard|ダッシュボード/i,
];

const APPROVAL_STATUSES: ProposalStatus[] = ['approved', 'in_progress', 'implemented'];

export interface GovernanceInput {
  title: string;
  category: ProposalCategory;
  target_area?: string | null;
  proposed_change?: string | null;
  rationale?: string | null;
}

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyEvolutionLayer(input: GovernanceInput): EvolutionLayer {
  const text = [
    input.title,
    input.target_area,
    input.proposed_change,
    input.rationale,
  ]
    .filter(Boolean)
    .join('\n');

  if (matches(CORE_PATTERNS, text)) return 'core';
  if (matches(SEMANTIC_PATTERNS, text)) return 'semantic';
  if (matches(INTERFACE_PATTERNS, text) || input.category === 'ux') return 'interface';
  return 'semantic';
}

function isLayer(value: unknown): value is EvolutionLayer {
  return value === 'interface' || value === 'semantic' || value === 'core';
}

function buildDecision(params: {
  from: ProposalStatus | null;
  to: ProposalStatus;
  layer: EvolutionLayer;
  actorId: string | null;
  actorType: EvolutionActorType;
  actorRole: EvolutionActorRole;
  note?: string | null;
  at: string;
}): EvolutionGovernanceDecision {
  return {
    from: params.from,
    to: params.to,
    layer: params.layer,
    actor_id: params.actorId,
    actor_type: params.actorType,
    actor_role: params.actorRole,
    note: params.note ?? null,
    at: params.at,
  };
}

export function buildProposalGovernance(
  input: GovernanceInput,
  now: Date = new Date(),
): EvolutionGovernance {
  const layer = classifyEvolutionLayer(input);
  const at = now.toISOString();
  const decision = buildDecision({
    from: null,
    to: 'proposed',
    layer,
    actorId: null,
    actorType: 'system',
    actorRole: 'system',
    note: 'proposal created',
    at,
  });

  return {
    layer,
    requires_human_approval: layer !== 'interface',
    auto_apply: layer === 'interface',
    core_version: layer === 'core' ? CORE_VERSION : null,
    forked_from: null,
    history: [decision],
    last_decision: decision,
  };
}

export function resolveProposalGovernance(
  signals: unknown,
  input: GovernanceInput,
): EvolutionGovernance {
  if (signals && typeof signals === 'object') {
    const candidate = (signals as { governance?: Partial<EvolutionGovernance> }).governance;
    if (candidate && typeof candidate === 'object' && isLayer(candidate.layer)) {
      const layer = candidate.layer;
      return {
        layer,
        requires_human_approval: candidate.requires_human_approval ?? layer !== 'interface',
        auto_apply: candidate.auto_apply ?? false,
        core_version: candidate.core_version ?? (layer === 'core' ? CORE_VERSION : null),
        forked_from: candidate.forked_from ?? null,
        history: Array.isArray(candidate.history) ? candidate.history : [],
        last_decision: candidate.last_decision ?? null,
      };
    }
  }
  return buildProposalGovernance(input);
}

export function assertCoreTransitionAllowed(
  governance: EvolutionGovernance,
  nextStatus: ProposalStatus,
  actorRole: EvolutionActorRole,
): void {
  if (
    governance.layer === 'core' &&
    APPROVAL_STATUSES.includes(nextStatus) &&
    actorRole !== 'admin'
  ) {
    throw new Error('Core changes require an admin final decision');
  }
}

export function appendGovernanceDecision(
  governance: EvolutionGovernance,
  params: {
    from: ProposalStatus | null;
    to: ProposalStatus;
    actorId: string | null;
    actorType: EvolutionActorType;
    actorRole: EvolutionActorRole;
    note?: string | null;
    now?: Date;
  },
): EvolutionGovernance {
  const decision = buildDecision({
    from: params.from,
    to: params.to,
    layer: governance.layer,
    actorId: params.actorId,
    actorType: params.actorType,
    actorRole: params.actorRole,
    note: params.note,
    at: (params.now ?? new Date()).toISOString(),
  });

  return {
    ...governance,
    history: [...governance.history, decision],
    last_decision: decision,
  };
}

export function forkCoreGovernance(
  governance: EvolutionGovernance,
  params: {
    sourceId: string;
    actorId: string;
    actorRole: EvolutionActorRole;
    now?: Date;
  },
): EvolutionGovernance {
  if (governance.layer !== 'core') {
    throw new Error('Only core proposals can be forked');
  }

  const now = params.now ?? new Date();
  const version = `${governance.core_version ?? CORE_VERSION}-fork-${now.getTime().toString(36)}`;
  const decision = buildDecision({
    from: null,
    to: 'proposed',
    layer: 'core',
    actorId: params.actorId,
    actorType: 'human',
    actorRole: params.actorRole,
    note: `forked from ${params.sourceId}`,
    at: now.toISOString(),
  });

  return {
    ...governance,
    core_version: version,
    auto_apply: false,
    forked_from: params.sourceId,
    history: [decision],
    last_decision: decision,
  };
}
