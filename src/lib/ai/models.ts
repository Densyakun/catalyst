import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type ModelRole = 'structuring' | 'solving';

const PORTKEY_BASE_URL = 'https://api.portkey.ai/v1';
// SDKの型バリデーションを通過させるための、標準的なOpenAIモデル名をベースにします
const DEFAULT_MODEL_PLACEHOLDER = 'gpt-4o-mini';

function isValidKey(key: string | undefined): key is string {
  if (!key) return false;
  const placeholderPatterns = ['your_', '_here', 'api_key', 'example'];
  return !placeholderPatterns.some((pattern) => key.toLowerCase().includes(pattern));
}

export function assertPortkeyConfigured(): void {
  if (!isValidKey(process.env.PORTKEY_API_KEY)) {
    throw new Error('PORTKEY_API_KEY is not set. Get your key at https://app.portkey.ai/');
  }
}

function getRoleConfigId(role: ModelRole): string {
  const envKey = role === 'structuring' ? 'PORTKEY_CONFIG_STRUCTURING' : 'PORTKEY_CONFIG_SOLVING';
  const configured = process.env[envKey];
  if (!isValidKey(configured)) {
    throw new Error(`${envKey} is not set. Copy the Config ID from Portkey.`);
  }
  return configured;
}

function getModelPlaceholder(): string {
  const configured = process.env.PORTKEY_MODEL_PLACEHOLDER;
  return isValidKey(configured) ? configured : DEFAULT_MODEL_PLACEHOLDER;
}

/**
 * 1. @ai-sdk/openai を使い、純粋にベースURLとConfig IDのみを付与してインスタンス化
 */
function createPortkeyProvider(configId: string) {
  assertPortkeyConfigured();
  return createOpenAI({
    baseURL: PORTKEY_BASE_URL,
    apiKey: process.env.PORTKEY_API_KEY!,
    headers: {
      'x-portkey-config': configId, // Portkey側はこのIDに紐づくJSONルールを最優先します
    },
  });
}

/**
 * 2. 役割に応じたLanguageModelを生成
 */
export function getModelForRole(role: ModelRole): LanguageModel {
  const configId = getRoleConfigId(role);
  const portkey = createPortkeyProvider(configId);
  
  // スラッグプレフィックス（portkey/ 等）を削除し、プレースホルダー名のみを渡します。
  // Vercel AI SDK（LanguageModelV2以上）はこれを正当なOpenAIモデルとして認識し、Gatewayへ送信します。
  const baseModel = getModelPlaceholder(); 

  return portkey.chat(baseModel);
}
