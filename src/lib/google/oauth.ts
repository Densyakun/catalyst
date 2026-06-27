import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly',
];

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/sources/google/callback`;
}

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
}

export function getAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  });
}

export async function exchangeCode(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function createAuthenticatedClient(accessToken: string, refreshToken?: string | null) {
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });
  return client;
}

/**
 * Google認証クライアントを取得し、トークン自動更新を設定
 * invalid_grant エラー時は re_auth_required を返す
 */
export async function getAuthClientForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ auth: ReturnType<typeof createOAuth2Client>; error?: undefined } | { auth?: undefined; error: 'not_connected' | 're_auth_required' }> {
  const { data: tokenData, error: tokenError } = await supabase
    .from('user_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (tokenError || !tokenData) {
    return { error: 'not_connected' };
  }

  const auth = createAuthenticatedClient(
    tokenData.access_token,
    tokenData.refresh_token,
  );

  // トークンが更新されたらDBに保存
  auth.on('tokens', async (tokens) => {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (tokens.access_token) updates.access_token = tokens.access_token;
    if (tokens.refresh_token) updates.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) updates.expires_at = new Date(tokens.expiry_date).toISOString();

    await supabase
      .from('user_oauth_tokens')
      .update(updates)
      .eq('user_id', userId)
      .eq('provider', 'google');
  });

  // トークンの有効性を事前チェック
  try {
    await auth.getAccessToken();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('invalid_grant') || message.includes('Token has been expired or revoked')) {
      // トークンが完全に失効 → 再認証が必要
      await supabase
        .from('user_oauth_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'google');
      return { error: 're_auth_required' };
    }
    throw err;
  }

  return { auth };
}
