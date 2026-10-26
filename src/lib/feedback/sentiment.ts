import type { FeedbackSentiment } from '@/lib/types/evolution';

const NEGATIVE_HINTS = [
  '使えない', 'わからない', '分からない', '難しい', '不便', '遅い', 'うまく',
  '失敗', 'バグ', 'エラー', '嫌', 'だめ', 'ダメ', '不満', '消えた', 'できない',
];

export function inferSentiment(
  category: string,
  message: string,
  rating?: number | null,
): FeedbackSentiment {
  if (typeof rating === 'number') {
    if (rating <= 2) return 'negative';
    if (rating >= 4) return 'positive';
  }
  if (category === 'praise') return 'positive';
  if (category === 'dissatisfaction' || category === 'bug') return 'negative';
  if (NEGATIVE_HINTS.some((hint) => message.includes(hint))) return 'negative';
  return 'neutral';
}
