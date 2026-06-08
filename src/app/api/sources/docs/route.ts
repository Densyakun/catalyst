import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAuthenticatedClient } from '@/lib/google/oauth';
import { listDocs } from '@/lib/google/docs';

/**
 * Google Drive上のドキュメント一覧を取得
 * ?query=キーワード で検索フィルタ可能
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // OAuthトークンを取得
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_oauth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Google account not connected. Please connect first.' },
        { status: 400 },
      );
    }

    const auth = createAuthenticatedClient(
      tokenData.access_token,
      tokenData.refresh_token,
    );

    const query = req.nextUrl.searchParams.get('query') || undefined;
    const docs = await listDocs(auth, query);

    // 読み込み済みのドキュメント情報を取得
    const { data: existingSources } = await supabase
      .from('user_sources')
      .select('source_config, last_synced_at')
      .eq('user_id', user.id)
      .eq('source_type', 'google_docs');

    const syncedDocIds = new Map<string, string>();
    for (const src of existingSources || []) {
      const config = src.source_config as { doc_id?: string };
      if (config?.doc_id) {
        syncedDocIds.set(config.doc_id, src.last_synced_at || '');
      }
    }

    const enrichedDocs = docs.map((doc) => ({
      ...doc,
      is_synced: syncedDocIds.has(doc.id),
      last_synced_at: syncedDocIds.get(doc.id) || null,
    }));

    return NextResponse.json(enrichedDocs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('List docs error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
