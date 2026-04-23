import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// APIキーの有効性チェック
function isValidKey(key: string | undefined): key is string {
  if (!key) return false;
  const placeholderPatterns = ['your_', '_here', 'api_key', 'example'];
  return !placeholderPatterns.some(pattern => key.toLowerCase().includes(pattern));
}

// プロバイダーの初期化
const google = isValidKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY) ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY }) : null;
const openai = isValidKey(process.env.OPENAI_API_KEY) ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const anthropic = isValidKey(process.env.ANTHROPIC_API_KEY) ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// モデルの定義とスコアリング
const ALL_MODELS = [
  { name: 'gemini-3.1-flash-lite-preview', structuringScore: 100, solvingScore: 60, instance: google },
  { name: 'gemini-3-flash-preview', structuringScore: 95, solvingScore: 85, instance: google },
  { name: 'gemini-2.5-flash-lite', structuringScore: 90, solvingScore: 55, instance: google },
  { name: 'gemini-2.5-flash', structuringScore: 85, solvingScore: 75, instance: google },
  { name: 'gpt-4o-mini', structuringScore: 90, solvingScore: 65, instance: openai },
  { name: 'gpt-4o', structuringScore: 70, solvingScore: 95, instance: openai },
  { name: 'claude-3-5-sonnet-20240620', structuringScore: 80, solvingScore: 100, instance: anthropic },
];

/**
 * 有効なプロバイダーのモデルを抽出し、スコア順に並び替えた配列を返します
 */
function getSortedModels(role: 'structuring' | 'solving') {
  const scoreKey = role === 'structuring' ? 'structuringScore' : 'solvingScore';

  return ALL_MODELS
    .filter(m => m.instance !== null)
    .sort((a, b) => (b[scoreKey] as number) - (a[scoreKey] as number))
    .map(m => m.instance!(m.name));
}

export const models = {
  get primary() { return getSortedModels('solving'); },
  get structuring() { return getSortedModels('structuring'); },
};
