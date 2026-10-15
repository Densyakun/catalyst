import type { SupabaseClient } from '@supabase/supabase-js';

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly',
];

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/sources/google/callback`;
}

function requireClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません');
  }
  return { clientId, clientSecret };
}

/**
 * Google OAuth の同意URLを生成する。
 */
export function getAuthUrl(state: string): string {
  const { clientId } = requireClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface NormalizedGoogleTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `token request failed (${res.status})`);
  }
  return data;
}

/**
 * 認可コードをトークンに交換する。
 */
export async function exchangeCode(code: string): Promise<NormalizedGoogleTokens> {
  const { clientId, clientSecret } = requireClientCredentials();
  const data = await postToken(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  }));

  if (!data.access_token) throw new Error('access_token が取得できませんでした');

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scopes: typeof data.scope === 'string' ? data.scope.split(' ') : [],
  };
}

export type GoogleAuthResult =
  | { accessToken: string; error?: undefined }
  | { accessToken?: undefined; error: 'not_connected' | 're_auth_required' };

/**
 * ユーザーのGoogleアクセストークンを取得する。
 * 期限切れ間近ならリフレッシュし、DBを更新する。
 * 失効している場合は re_auth_required を返す。
 */
export async function getGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<GoogleAuthResult> {
  const { data: tokenData, error } = await supabase
    .from('user_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokenData) {
    return { error: 'not_connected' };
  }

  const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : 0;
  const needsRefresh = !tokenData.access_token || (expiresAt > 0 && expiresAt - Date.now() < 60_000);

  if (!needsRefresh) {
    return { accessToken: tokenData.access_token as string };
  }

  if (!tokenData.refresh_token) {
    await deleteTokens(supabase, userId);
    return { error: 're_auth_required' };
  }

  const { clientId, clientSecret } = requireClientCredentials();
  let data: GoogleTokenResponse;
  try {
    data = await postToken(new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenData.refresh_token as string,
      grant_type: 'refresh_token',
    }));
  } catch (refreshError) {
    const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
    if (/invalid_grant|expired|revoked/i.test(message)) {
      await deleteTokens(supabase, userId);
      return { error: 're_auth_required' };
    }
    throw refreshError;
  }

  const updates: Record<string, unknown> = {
    access_token: data.access_token,
    updated_at: new Date().toISOString(),
  };
  if (data.expires_in) updates.expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
  if (data.refresh_token) updates.refresh_token = data.refresh_token;

  await supabase
    .from('user_oauth_tokens')
    .update(updates)
    .eq('user_id', userId)
    .eq('provider', 'google');

  return { accessToken: data.access_token as string };
}

async function deleteTokens(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from('user_oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');
}
