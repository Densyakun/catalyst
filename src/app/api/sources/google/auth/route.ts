import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google/oauth';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64');
    const url = getAuthUrl(state);

    return NextResponse.json({ url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Google auth error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
