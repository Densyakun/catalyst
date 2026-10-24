import { createAdminClient } from '@/lib/supabase-admin';
import type { ModelRole } from './models';

export type LlmCallContext = {
  userId?: string;
  agent?: string;
  operation?: string;
  promptVersion?: string;
  metadata?: Record<string, unknown>;
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LlmErrorType =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'server'
  | 'schema'
  | 'context_length'
  | 'not_found'
  | 'invalid_request'
  | 'unknown';

type LlmCallLogInput = {
  role: ModelRole;
  model: string;
  baseUrl: string;
  success: boolean;
  latencyMs: number;
  context?: LlmCallContext;
  usage?: LlmUsage;
  finishReason?: string;
  error?: unknown;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as { statusCode?: unknown; status?: unknown }).statusCode
    ?? (error as { status?: unknown }).status;
  return typeof value === 'number' ? value : undefined;
}

function getErrorName(error: unknown): string {
  if (error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }
  return '';
}

export function classifyLlmError(error: unknown): LlmErrorType {
  const status = getStatusCode(error);
  const name = getErrorName(error);
  const message = getErrorMessage(error);
  const text = `${name} ${message}`;

  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status !== undefined && status >= 500) return 'server';
  if (/context length|maximum context|too many tokens|token limit/i.test(text)) return 'context_length';
  if (/NoObjectGenerated|TypeValidation|JSONParse|schema|validation|invalid json|failed to parse/i.test(text)) {
    return 'schema';
  }
  if (/timeout|timed out|aborted|AbortError/i.test(text)) return 'timeout';
  if (/rate limit|too many requests/i.test(text)) return 'rate_limit';
  if (/unauthorized|invalid api key|authentication|permission denied/i.test(text)) return 'auth';
  if (status === 400) return 'invalid_request';
  return 'unknown';
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key["'\s:=]+)[^\s"',]+/gi, '$1***')
    .slice(0, 1000);
}

/**
 * LLM 呼び出しの結果を記録する。計測失敗で本処理を止めない。
 */
export async function logLlmCall(input: LlmCallLogInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const errorType = input.success ? null : classifyLlmError(input.error);
    const errorMessage = input.success ? null : sanitizeMessage(getErrorMessage(input.error));

    const { error } = await supabase.from('llm_calls').insert({
      user_id: input.context?.userId ?? null,
      role: input.role,
      agent: input.context?.agent ?? null,
      operation: input.context?.operation ?? null,
      model: input.model,
      base_url: input.baseUrl,
      prompt_version: input.context?.promptVersion ?? null,
      success: input.success,
      error_type: errorType,
      error_message: errorMessage,
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      input_tokens: input.usage?.inputTokens ?? null,
      output_tokens: input.usage?.outputTokens ?? null,
      total_tokens: input.usage?.totalTokens ?? null,
      finish_reason: input.finishReason ?? null,
      metadata: input.context?.metadata ?? {},
    });

    if (error) {
      console.error('llm_calls insert error:', error.message);
    }
  } catch (error) {
    console.error('llm_calls logging failed:', getErrorMessage(error));
  }
}
