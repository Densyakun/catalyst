import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// APIキーが有効（プレースホルダーでない）かチェックする関数
function isValidKey(key: string | undefined): key is string {
  if (!key) return false;
  const placeholderPatterns = [
    'your_',
    '_here',
    'api_key',
    'example',
  ];
  return !placeholderPatterns.some(pattern => key.toLowerCase().includes(pattern));
}

// プロバイダーの初期化
const providers = {
  google: isValidKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY) 
    ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY }) : null,
  openai: isValidKey(process.env.OPENAI_API_KEY) 
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null,
  anthropic: isValidKey(process.env.ANTHROPIC_API_KEY) 
    ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null,
};

/**
 * モデル選択ロジック
 * 優先順位に従って、利用可能な最初のモデルを返します
 */
function getModel(role: 'structuring' | 'solving') {
  if (role === 'structuring') {
    // 構造化: スピードとコスト効率重視
    if (providers.google) return providers.google('gemini-1.5-flash-latest');
    if (providers.openai) return providers.openai('gpt-4o-mini');
    if (providers.anthropic) return providers.anthropic('claude-3-5-sonnet-20240620');
  } else {
    // 解決提案: 思考の深さと質を重視
    if (providers.anthropic) return providers.anthropic('claude-3-5-sonnet-20240620');
    if (providers.openai) return providers.openai('gpt-4o');
    if (providers.google) return providers.google('gemini-1.5-flash-latest');
  }

  // フォールバック（万が一どれも設定されていない場合のエラー回避用）
  throw new Error('利用可能なAIプロバイダーのAPIキーが設定されていません。.env.local を確認してください。');
}

export const models = {
  get primary() { return getModel('solving'); },
  get structuring() { return getModel('structuring'); },
};
