import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type ModelRole = 'structuring' | 'solving';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function isValidValue(value: string | undefined): value is string {
  if (!value) return false;
  const placeholderPatterns = ['your_', '_here', 'api_key', 'example'];
  return !placeholderPatterns.some((pattern) => value.toLowerCase().includes(pattern));
}

export function assertLLMConfigured(): void {
  if (!isValidValue(process.env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is not set.');
  }
}

function getBaseURL(): string {
  const configured = process.env.OPENAI_BASE_URL;
  if (!isValidValue(configured)) return DEFAULT_BASE_URL;
  return configured.replace(/\/+$/, '');
}

function getModelId(role: ModelRole): string {
  const roleKey = role === 'structuring' ? 'OPENAI_MODEL_STRUCTURING' : 'OPENAI_MODEL_SOLVING';
  const candidates = [process.env[roleKey], process.env.OPENAI_MODEL];
  return candidates.find(isValidValue) ?? DEFAULT_MODEL;
}

/**
 * 単一のAPIキー・エンドポイントで、役割に応じたモデルを生成する。
 */
export function getModelForRole(role: ModelRole): LanguageModel {
  assertLLMConfigured();
  const openai = createOpenAI({
    baseURL: getBaseURL(),
    apiKey: process.env.OPENAI_API_KEY!,
  });
  return openai.chat(getModelId(role));
}
