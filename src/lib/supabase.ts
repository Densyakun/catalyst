import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export const createClient = (): SupabaseClient =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );

let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!cached) cached = createClient();
  return cached;
}

/**
 * クライアントサイド共通インスタンス（遅延生成）。
 * モジュール読み込み時には生成しないため、ビルド時に環境変数が無くても例外にならない。
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
