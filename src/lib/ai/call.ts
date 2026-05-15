import { generateObject, generateText } from 'ai';
import type { z } from 'zod';
import { assertPortkeyConfigured, getModelForRole, type ModelRole } from './models';

/** エージェントから渡す generateObject オプション（model は役割から解決） */
export type RoleGenerateObjectOptions = {
  prompt: string;
  schema: z.ZodType;
  maxOutputTokens?: number;
  maxTokens?: number;
};

/** エージェントから渡す generateText オプション */
export type RoleGenerateTextOptions = {
  prompt: string;
  maxOutputTokens?: number;
  maxTokens?: number;
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

/**
 * 役割に応じたモデルで structured output を生成する（Portkey 経由）。
 */
export async function generateObjectForRole<T>(
  role: ModelRole,
  options: RoleGenerateObjectOptions,
): Promise<{ object: T }> {
  assertPortkeyConfigured();
  const result = await generateObject({
    ...normalizeOutputTokens(options),
    model: getModelForRole(role),
  });
  return { object: result.object as T };
}

/**
 * 役割に応じたモデルでテキストを生成する（Portkey 経由）。
 */
export async function generateTextForRole(
  role: ModelRole,
  options: RoleGenerateTextOptions,
) {
  assertPortkeyConfigured();
  return generateText({
    ...normalizeOutputTokens(options),
    model: getModelForRole(role),
  });
}
