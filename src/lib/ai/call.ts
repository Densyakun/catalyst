import { generateObject, generateText } from 'ai';
import type { z } from 'zod';
import {
  assertLLMConfigured,
  getLlmBaseUrl,
  getModelForRole,
  resolveModelId,
  type ModelRole,
} from './models';
import { logLlmCall, type LlmCallContext, type LlmUsage } from './llm-log';

/** エージェントから渡す generateObject オプション（model は役割から解決） */
export type RoleGenerateObjectOptions = {
  prompt: string;
  schema: z.ZodType;
  maxOutputTokens?: number;
  maxTokens?: number;
  context?: LlmCallContext;
};

/** エージェントから渡す generateText オプション */
export type RoleGenerateTextOptions = {
  prompt: string;
  maxOutputTokens?: number;
  maxTokens?: number;
  context?: LlmCallContext;
};

function normalizeOutputTokens<T extends RoleGenerateObjectOptions | RoleGenerateTextOptions>(
  options: T,
): T {
  if (options.maxOutputTokens != null || options.maxTokens == null) {
    return options;
  }
  const { maxTokens, ...rest } = options;
  return { ...rest, maxOutputTokens: maxTokens } as T;
}

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function toUsage(usage: UsageLike | undefined): LlmUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function getFinishReason(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const value = (result as { finishReason?: unknown }).finishReason;
  return typeof value === 'string' ? value : undefined;
}

/**
 * 役割に応じたモデルで structured output を生成する。
 */
export async function generateObjectForRole<T>(
  role: ModelRole,
  options: RoleGenerateObjectOptions,
): Promise<{ object: T }> {
  const { context, ...generateOptions } = options;
  assertLLMConfigured();

  const model = resolveModelId(role);
  const baseUrl = getLlmBaseUrl();
  const startedAt = Date.now();

  try {
    const result = await generateObject({
      ...normalizeOutputTokens(generateOptions),
      model: getModelForRole(role),
    });
    await logLlmCall({
      role,
      model,
      baseUrl,
      success: true,
      latencyMs: Date.now() - startedAt,
      usage: toUsage(result.usage),
      finishReason: getFinishReason(result),
      context,
    });
    return { object: result.object as T };
  } catch (error) {
    await logLlmCall({
      role,
      model,
      baseUrl,
      success: false,
      latencyMs: Date.now() - startedAt,
      error,
      context,
    });
    throw error;
  }
}

/**
 * 役割に応じたモデルでテキストを生成する。
 */
export async function generateTextForRole(
  role: ModelRole,
  options: RoleGenerateTextOptions,
) {
  const { context, ...generateOptions } = options;
  assertLLMConfigured();

  const model = resolveModelId(role);
  const baseUrl = getLlmBaseUrl();
  const startedAt = Date.now();

  try {
    const result = await generateText({
      ...normalizeOutputTokens(generateOptions),
      model: getModelForRole(role),
    });
    await logLlmCall({
      role,
      model,
      baseUrl,
      success: true,
      latencyMs: Date.now() - startedAt,
      usage: toUsage(result.usage),
      finishReason: getFinishReason(result),
      context,
    });
    return result;
  } catch (error) {
    await logLlmCall({
      role,
      model,
      baseUrl,
      success: false,
      latencyMs: Date.now() - startedAt,
      error,
      context,
    });
    throw error;
  }
}
