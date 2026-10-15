import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * service_role キーを使う管理者用クライアント（RLSをバイパス）。
 * サーバー専用。クライアントコンポーネントから import しないこと。
 * エージェント連携APIなど、ユーザーセッションを持たない処理でのみ使う。
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (と NEXT_PUBLIC_SUPABASE_URL) が設定されていません。エージェント連携にはサービスロールキーが必要です。',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
