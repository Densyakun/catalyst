'use client';

import { supabase } from '@/lib/supabase';

/**
 * ユーザーの操作を「意思決定データ」として記録する。
 * 自己進化エンジンの入力シグナルになる。失敗してもUIを止めない。
 */
export async function trackEvent(
  activityType: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_activity').insert({
      user_id: user.id,
      activity_type: activityType,
      metadata: { ...metadata, timestamp: new Date().toISOString() },
    });
  } catch {
    // telemetry は best-effort。UI を止めない。
  }
}

/**
 * 要素の判別に使える短いラベルを生成する。
 */
export function describeElement(el: Element | null): string {
  if (!el) return '';
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 80);
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 80);
  const title = el.getAttribute('title');
  if (title) return title.slice(0, 80);
  return el.tagName.toLowerCase();
}
