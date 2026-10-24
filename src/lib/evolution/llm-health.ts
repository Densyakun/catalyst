import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import type {
  LlmHealthFinding,
  LlmHealthGroup,
  LlmHealthReport,
} from '@/lib/types/evolution';

const WINDOW_DAYS = 7;
const MAX_ROWS = 5000;

const MIN_SAMPLES = 20;
const FAILURE_WARN = 0.05;
const FAILURE_CRITICAL = 0.15;
const SCHEMA_WARN = 0.03;
const SCHEMA_CRITICAL = 0.1;
const LATENCY_WARN_MS = 15000;
const LATENCY_CRITICAL_MS = 30000;

type LlmCallRow = {
  role: string;
  agent: string | null;
  model: string;
  success: boolean;
  error_type: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

type MutableGroup = {
  role: string;
  agent: string | null;
  model: string;
  totalCalls: number;
  failures: number;
  schemaFailures: number;
  latencies: number[];
  inputTokens: number[];
  outputTokens: number[];
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function resolveClient(fallback: SupabaseClient): SupabaseClient {
  try {
    return createAdminClient();
  } catch {
    return fallback;
  }
}

function emptyReport(available: boolean): LlmHealthReport {
  return {
    available,
    windowDays: WINDOW_DAYS,
    totalCalls: 0,
    failureRate: 0,
    schemaFailureRate: 0,
    p95LatencyMs: null,
    groups: [],
    findings: [],
  };
}

function getRoleLabel(role: string): string {
  if (role === 'structuring') return '構造化';
  if (role === 'solving') return '解決提案';
  return role;
}

function getModelEnvKey(role: string): string {
  if (role === 'structuring') return 'OPENAI_MODEL_STRUCTURING';
  if (role === 'solving') return 'OPENAI_MODEL_SOLVING';
  return 'OPENAI_MODEL';
}

function buildFindings(groups: LlmHealthGroup[], totalCalls: number): LlmHealthFinding[] {
  const findings: LlmHealthFinding[] = [];

  for (const group of groups) {
    if (group.totalCalls < MIN_SAMPLES) continue;

    const roleLabel = getRoleLabel(group.role);
    const envKey = getModelEnvKey(group.role);
    const agentLabel = group.agent ? ` / ${group.agent}` : '';

    if (group.failureRate >= FAILURE_CRITICAL) {
      findings.push({
        severity: 'critical',
        role: group.role,
        agent: group.agent,
        model: group.model,
        metric: 'failure_rate',
        value: group.failureRate,
        threshold: FAILURE_CRITICAL,
        title: `${roleLabel}${agentLabel}の失敗率が${(group.failureRate * 100).toFixed(1)}%`,
        recommendation: `${envKey} を別モデルへ変更し、フォールバックを追加する`,
      });
    } else if (group.failureRate >= FAILURE_WARN) {
      findings.push({
        severity: 'warning',
        role: group.role,
        agent: group.agent,
        model: group.model,
        metric: 'failure_rate',
        value: group.failureRate,
        threshold: FAILURE_WARN,
        title: `${roleLabel}${agentLabel}の失敗率が${(group.failureRate * 100).toFixed(1)}%`,
        recommendation: `${envKey} のモデル・プロンプト・タイムアウト設定を見直す`,
      });
    }

    if (group.schemaFailureRate >= SCHEMA_CRITICAL) {
      findings.push({
        severity: 'critical',
        role: group.role,
        agent: group.agent,
        model: group.model,
        metric: 'schema_failure_rate',
        value: group.schemaFailureRate,
        threshold: SCHEMA_CRITICAL,
        title: `${roleLabel}${agentLabel}のJSON検証失敗率が${(group.schemaFailureRate * 100).toFixed(1)}%`,
        recommendation: `${envKey} をstructured outputに強いモデルへ変更し、スキーマを簡素化する`,
      });
    } else if (group.schemaFailureRate >= SCHEMA_WARN) {
      findings.push({
        severity: 'warning',
        role: group.role,
        agent: group.agent,
        model: group.model,
        metric: 'schema_failure_rate',
        value: group.schemaFailureRate,
        threshold: SCHEMA_WARN,
        title: `${roleLabel}${agentLabel}のJSON検証失敗率が${(group.schemaFailureRate * 100).toFixed(1)}%`,
        recommendation: `${envKey} のモデル変更、または出力スキーマの簡素化を検討する`,
      });
    }

    if (group.p95LatencyMs != null && group.p95LatencyMs >= LATENCY_CRITICAL_MS) {
      findings.push({
        severity: 'critical',
        role: group.role,
        agent: group.agent,
        model: group.model,
        metric: 'p95_latency',
        value: group.p95LatencyMs,
        threshold: LATENCY_CRITICAL_MS,
        title: `${roleLabel}${agentLabel}のp95レイテンシが${Math.round(group.p95LatencyMs)}ms`,
        recommendation: `${envKey} を高速なモデルへ変更するか、処理を分割する`,
      });
    } else if (group.p95LatencyMs != null && group.p95LatencyMs >= LATENCY_WARN_MS) {
      findings.push({
        severity: 'warning',
        role: group.role,
        agent: group.agent,
        model: group.model,
        metric: 'p95_latency',
        value: group.p95LatencyMs,
        threshold: LATENCY_WARN_MS,
        title: `${roleLabel}${agentLabel}のp95レイテンシが${Math.round(group.p95LatencyMs)}ms`,
        recommendation: `${envKey} のタイムアウト・モデル・プロンプト長を見直す`,
      });
    }
  }

  if (totalCalls >= MIN_SAMPLES) {
    const critical = findings.filter((finding) => finding.severity === 'critical');
    if (critical.length > 3) {
      return critical.slice(0, 3);
    }
  }

  const severityRank = { critical: 0, warning: 1 } as const;
  return findings.sort((a, b) => {
    const bySeverity = severityRank[a.severity] - severityRank[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.value / b.threshold - a.value / a.threshold;
  });
}

/**
 * 直近7日間の LLM 呼び出しログを集計し、役割・モデル単位の異常を検出する。
 * service_role が使える場合は全ユーザー横断、使えない場合は RLS の範囲で集計する。
 */
export async function collectLlmHealth(fallback: SupabaseClient): Promise<LlmHealthReport> {
  const supabase = resolveClient(fallback);
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('llm_calls')
    .select('role, agent, model, success, error_type, latency_ms, input_tokens, output_tokens')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return emptyReport(false);
  }

  const rows = (data || []) as LlmCallRow[];
  const groups = new Map<string, MutableGroup>();
  const allLatencies: number[] = [];
  let failures = 0;
  let schemaFailures = 0;

  for (const row of rows) {
    const key = `${row.role}|${row.agent ?? ''}|${row.model}`;
    const group = groups.get(key) ?? {
      role: row.role,
      agent: row.agent,
      model: row.model,
      totalCalls: 0,
      failures: 0,
      schemaFailures: 0,
      latencies: [],
      inputTokens: [],
      outputTokens: [],
    };

    group.totalCalls += 1;
    if (!row.success) {
      group.failures += 1;
      failures += 1;
      if (row.error_type === 'schema') {
        group.schemaFailures += 1;
        schemaFailures += 1;
      }
    }
    if (typeof row.latency_ms === 'number') {
      group.latencies.push(row.latency_ms);
      allLatencies.push(row.latency_ms);
    }
    if (typeof row.input_tokens === 'number') group.inputTokens.push(row.input_tokens);
    if (typeof row.output_tokens === 'number') group.outputTokens.push(row.output_tokens);
    groups.set(key, group);
  }

  const totalCalls = rows.length;
  const normalizedGroups: LlmHealthGroup[] = [...groups.values()]
    .map((group) => ({
      role: group.role,
      agent: group.agent,
      model: group.model,
      totalCalls: group.totalCalls,
      failures: group.failures,
      failureRate: rate(group.failures, group.totalCalls),
      schemaFailures: group.schemaFailures,
      schemaFailureRate: rate(group.schemaFailures, group.totalCalls),
      p95LatencyMs: percentile(group.latencies, 0.95),
      avgInputTokens: average(group.inputTokens),
      avgOutputTokens: average(group.outputTokens),
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls);

  return {
    available: true,
    windowDays: WINDOW_DAYS,
    totalCalls,
    failureRate: rate(failures, totalCalls),
    schemaFailureRate: rate(schemaFailures, totalCalls),
    p95LatencyMs: percentile(allLatencies, 0.95),
    groups: normalizedGroups,
    findings: buildFindings(normalizedGroups, totalCalls),
  };
}

export interface LlmHealthProposalDraft {
  title: string;
  category: 'performance' | 'bug';
  rationale: string;
  target_area: string;
  proposed_change: string;
  priority: number;
  evidence: string[];
  finding: LlmHealthFinding;
  group: LlmHealthGroup;
}

/**
 * 検出した異常から、モデル変更を促す改善提案の下書きを作る。
 */
export function buildLlmHealthProposals(report: LlmHealthReport): LlmHealthProposalDraft[] {
  if (!report.available || report.findings.length === 0) return [];

  return report.findings.slice(0, 3).map((finding) => {
    const group = report.groups.find(
      (item) =>
        item.role === finding.role &&
        item.model === finding.model &&
        item.agent === finding.agent,
    );
    const roleLabel = getRoleLabel(finding.role);
    const metricLabel =
      finding.metric === 'failure_rate'
        ? '失敗率'
        : finding.metric === 'schema_failure_rate'
          ? 'JSON検証失敗率'
          : 'p95レイテンシ';
    const valueLabel =
      finding.metric === 'p95_latency'
        ? `${Math.round(finding.value)}ms`
        : `${(finding.value * 100).toFixed(1)}%`;
    const thresholdLabel =
      finding.metric === 'p95_latency'
        ? `${Math.round(finding.threshold)}ms`
        : `${(finding.threshold * 100).toFixed(1)}%`;

    return {
      title: `[LLM] ${finding.title}`,
      category: finding.metric === 'schema_failure_rate' ? 'bug' : 'performance',
      rationale: `直近${report.windowDays}日間のLLM呼び出しログで、${roleLabel}（${finding.model}）の${metricLabel}が${valueLabel}となり、基準値${thresholdLabel}を超えました。件数は${group?.totalCalls ?? 0}件です。`,
      target_area: `AI/${finding.role}`,
      proposed_change: `${finding.recommendation}。変更前にゴールデン評価セットで品質を比較し、canaryで段階的に切り替える。`,
      priority: finding.severity === 'critical' ? 0.9 : 0.6,
      evidence: [
        `${metricLabel}: ${valueLabel}（基準 ${thresholdLabel}）`,
        `対象: ${finding.role} / ${finding.model} / ${group?.totalCalls ?? 0}件`,
        `失敗率: ${((group?.failureRate ?? 0) * 100).toFixed(1)}%、JSON検証失敗率: ${((group?.schemaFailureRate ?? 0) * 100).toFixed(1)}%`,
      ],
      finding,
      group: group ?? {
        role: finding.role,
        agent: finding.agent,
        model: finding.model,
        totalCalls: 0,
        failures: 0,
        failureRate: 0,
        schemaFailures: 0,
        schemaFailureRate: 0,
        p95LatencyMs: null,
        avgInputTokens: null,
        avgOutputTokens: null,
      },
    };
  });
}
