import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type ModelRole = 'structuring' | 'solving';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

const OPENCODE_BACKEND = 'opencode';
const OPENCODE_SESSION_HEADER = 'x-opencode-session';

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

export function getLlmBaseUrl(): string {
  const configured = process.env.OPENAI_BASE_URL;
  if (!isValidValue(configured)) return DEFAULT_BASE_URL;
  return configured.replace(/\/+$/, '');
}

export function resolveModelId(role: ModelRole): string {
  const roleKey = role === 'structuring' ? 'OPENAI_MODEL_STRUCTURING' : 'OPENAI_MODEL_SOLVING';
  const candidates = [process.env[roleKey], process.env.OPENAI_MODEL];
  return candidates.find(isValidValue) ?? DEFAULT_MODEL;
}

/**
 * 現在のバックエンドが opencode かどうかを判定する。
 *
 * 判定順:
 * 1. OPENAI_BACKEND=opencode / openai の明示指定
 * 2. モデルID（@provider-slug/model 形式を含む）に opencode を含む
 * 3. OPENAI_BASE_URL のホスト名に opencode を含む
 */
export function isOpenCodeBackend(): boolean {
  const backend = process.env.OPENAI_BACKEND?.trim().toLowerCase();
  if (backend) return backend === OPENCODE_BACKEND;

  const modelCandidates = [
    process.env.OPENAI_MODEL,
    process.env.OPENAI_MODEL_STRUCTURING,
    process.env.OPENAI_MODEL_SOLVING,
  ];
  if (modelCandidates.some((value) => value?.toLowerCase().includes(OPENCODE_BACKEND))) {
    return true;
  }

  try {
    return new URL(getLlmBaseUrl()).hostname.toLowerCase().includes(OPENCODE_BACKEND);
  } catch {
    return false;
  }
}

/**
 * 呼び出しごとのセッションIDを生成する。
 */
export function createOpenCodeSessionId(): string {
  return `ses_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * opencode バックエンドのときだけ、動的セッションID付きのリクエストヘッダーを返す。
 * opencode 以外（OpenAI 公式など）では undefined を返し、ヘッダーを送らない。
 */
export function getLlmRequestHeaders(): Record<string, string> | undefined {
  if (!isOpenCodeBackend()) return undefined;
  return { [OPENCODE_SESSION_HEADER]: createOpenCodeSessionId() };
}

/**
 * 単一のAPIキー・エンドポイントで、役割に応じたモデルを生成する。
 */
export function getModelForRole(role: ModelRole): LanguageModel {
  assertLLMConfigured();
  const openai = createOpenAI({
    baseURL: getLlmBaseUrl(),
    apiKey: process.env.OPENAI_API_KEY!,
  });
  return openai.chat(resolveModelId(role));
}
