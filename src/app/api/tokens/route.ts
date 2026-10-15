import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateApiToken } from '@/lib/api-tokens';

/**
 * GET  /api/tokens → 自分のAPIトークン一覧（平文は含まない）
 * POST /api/tokens → 新規発行（平文トークンを一度だけ返す）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_api_tokens')
      .select('id, name, token_prefix, last_used_at, revoked_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    return errorResponse(error, 'Tokens list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'default';

    const { token, prefix, hash } = generateApiToken();

    const { data, error } = await supabase
      .from('user_api_tokens')
      .insert({ user_id: user.id, name, token_prefix: prefix, token_hash: hash })
      .select('id, name, token_prefix, created_at')
      .single();
    if (error) throw error;

    // 平文トークンはこのレスポンスでのみ返す
    return NextResponse.json({ ...data, token });
  } catch (error: unknown) {
    return errorResponse(error, 'Token create');
  }
}

function errorResponse(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
