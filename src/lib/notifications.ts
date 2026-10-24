import type { SupabaseClient } from '@supabase/supabase-js';

export async function notifyUser(
  supabase: SupabaseClient,
  params: {
    userId: string;
    title: string;
    body?: string | null;
    detail?: string | null;
    linkUrl?: string | null;
    kind?: 'improvement' | 'info' | 'error';
  },
): Promise<void> {
  const { error } = await supabase.from('user_notifications').insert({
    user_id: params.userId,
    title: params.title,
    body: params.body ?? null,
    detail: params.detail ?? null,
    link_url: params.linkUrl ?? null,
    kind: params.kind ?? 'info',
  });

  if (error) {
    console.error('Notification insert error:', error.message);
  }
}
