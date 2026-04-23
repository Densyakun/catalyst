import { generateObject, generateText } from 'ai';

/**
 * 複数のモデルを順に試行し、成功した結果を返します（自作フォールバック）
 */
export async function generateObjectWithFallback<T>(options: any, models: any[]): Promise<{ object: T }> {
  let lastError = null;

  for (const model of models) {
    try {
      const result = await generateObject({
        ...options,
        model,
      });
      return result as unknown as { object: T };
    } catch (error: any) {
      console.warn(`Model failed, trying next... Error: ${error.message}`);
      lastError = error;
      // 高負荷(503, 429)などのエラーの場合のみ次を試す設計も可能ですが、
      // ここではシンプルに失敗したら次へ進みます
      continue;
    }
  }

  throw lastError || new Error('All models failed to generate object.');
}

export async function generateTextWithFallback(options: any, models: any[]) {
  let lastError = null;

  for (const model of models) {
    try {
      return await generateText({
        ...options,
        model,
      });
    } catch (error: any) {
      console.warn(`Model failed, trying next... Error: ${error.message}`);
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error('All models failed to generate text.');
}
