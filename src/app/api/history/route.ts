import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json([]);
    }

    const { data: problems, error } = await supabase
      .from('problems')
      .select(`*, actions (*)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json(problems);
  } catch (error: any) {
    console.error('History fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
