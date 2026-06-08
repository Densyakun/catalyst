import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: insights, error } = await supabase
      .from('auto_insights')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json(insights || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Insights fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
