import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/google/oauth';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=missing_params', req.url));
    }

    const { userId } = JSON.parse(Buffer.from(state, 'base64').toString());
    const tokens = await exchangeCode(code);

    const supabase = await createClient();

    // トークンをDBに保存（upsert）
    const { error } = await supabase
      .from('user_oauth_tokens')
      .upsert({
        user_id: userId,
        provider: 'google',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_at,
        scopes: tokens.scopes,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' });

    if (error) throw error;

    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(new URL('/?google_connected=true', base));
  } catch (error: unknown) {
    console.error('Google callback error:', error);
    const message = error instanceof Error ? error.message : String(error);
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(message)}`, base));
  }
}
