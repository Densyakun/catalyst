import type { SupabaseClient } from '@supabase/supabase-js';

export interface NotificationInput {
  userId: string;
  title: string;
  body?: string | null;
  detail?: string | null;
  linkUrl?: string | null;
  kind?: 'improvement' | 'info' | 'error';
}

function cleanText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 通知に価値があるかどうかを判定する。
 * タイトルだけの通知や、本文・詳細・遷移先がすべて空の通知は送らない。
 * ユーザーが読む理由（内容）か、次の行動（リンク）のどちらかを必須にする。
 */
export function isValuableNotification(
  params: Pick<NotificationInput, 'title' | 'body' | 'detail' | 'linkUrl'>,
): boolean {
  if (!cleanText(params.title)) return false;
  const hasContent = Boolean(cleanText(params.body) || cleanText(params.detail));
  const hasAction = Boolean(cleanText(params.linkUrl));
  return hasContent || hasAction;
}

/**
 * 通知リンクを正規化する。
 * 外部 URL は http/https のみ、アプリ内画面はルート相対パス（/foo）のみ許可する。
 * `//example.com` のようなプロトコル相対 URL は外部遷移になるため拒否する。
 */
export function normalizeNotificationLink(url?: string | null): string | null {
  const value = cleanText(url);
  if (!value) return null;

  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function notifyUser(
  supabase: SupabaseClient,
  params: NotificationInput,
): Promise<boolean> {
  if (!isValuableNotification(params)) {
    return false;
  }

  const { error } = await supabase.from('user_notifications').insert({
    user_id: params.userId,
    title: params.title.trim(),
    body: cleanText(params.body),
    detail: cleanText(params.detail),
    link_url: normalizeNotificationLink(params.linkUrl),
    kind: params.kind ?? 'info',
  });

  if (error) {
    console.error('Notification insert error:', error.message);
    return false;
  }

  return true;
}
