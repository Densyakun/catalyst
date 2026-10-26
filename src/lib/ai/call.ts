import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import {
  assertLLMConfigured,
  getLlmBaseUrl,
  getLlmRequestHeaders,
  getModelForRole,
  isOpenCodeBackend,
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

const JSON_ONLY_INSTRUCTION =
  'Respond with a single valid JSON object that conforms to the JSON Schema below. ' +
  'Do not wrap it in markdown fences and do not add any prose.';

/**
 * opencode Go は response_format の json_schema を拒否するが json_object は受け付ける。
 * そのためスキーマはプロンプトで指示し、応答は zod で検証する。
 */
function buildJsonSchemaPrompt(prompt: string, schema: z.ZodType) {
  let schemaText = '';
  try {
    schemaText = `\n\nJSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
  } catch {
    schemaText = '';
  }
  return {
    system: `${JSON_ONLY_INSTRUCTION}${schemaText}`,
    prompt,
  };
}

/**
 * json_schema 非対応のバックエンドが返すエラーかどうか。
 * Portkey は上流の拒否を "Invalid response received from <provider>: ..." の形で返す。
 */
function isJsonSchemaRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /json[_-]?schema|response_format/i.test(message) ||
    /Invalid response received from/i.test(message);
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
  const headers = getLlmRequestHeaders();
  const startedAt = Date.now();

  const normalized = normalizeOutputTokens(generateOptions);
  const useJsonObjectMode = isOpenCodeBackend();
  const maxOutputTokens = normalized.maxOutputTokens;

  try {
    const generateAsJsonObject = async () => {
      const result = await generateObject({
        ...buildJsonSchemaPrompt(options.prompt, options.schema),
        model: getModelForRole(role),
        output: 'no-schema',
        ...(maxOutputTokens != null ? { maxOutputTokens } : {}),
        ...(headers ? { headers } : {}),
      });
      return {
        object: options.schema.parse(result.object),
        usage: result.usage,
        finishReason: getFinishReason(result),
      };
    };

    const generateAsJsonSchema = async () => {
      const result = await generateObject({
        ...normalized,
        model: getModelForRole(role),
        ...(headers ? { headers } : {}),
      });
      return {
        object: result.object,
        usage: result.usage,
        finishReason: getFinishReason(result),
      };
    };

    let outcome;
    if (useJsonObjectMode) {
      outcome = await generateAsJsonObject();
    } else {
      try {
        outcome = await generateAsJsonSchema();
      } catch (error) {
        if (!isJsonSchemaRejection(error)) throw error;
        outcome = await generateAsJsonObject();
      }
    }

    await logLlmCall({
      role,
      model,
      baseUrl,
      success: true,
      latencyMs: Date.now() - startedAt,
      usage: toUsage(outcome.usage),
      finishReason: outcome.finishReason,
      context,
    });
    return { object: outcome.object as T };
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
  const headers = getLlmRequestHeaders();
  const startedAt = Date.now();

  try {
    const result = await generateText({
      ...normalizeOutputTokens(generateOptions),
      model: getModelForRole(role),
      ...(headers ? { headers } : {}),
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
