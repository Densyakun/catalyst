import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: sources, error } = await supabase
      .from('user_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(sources || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Sources fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { source_type, source_name, source_config } = body;

    if (!source_type || !source_name) {
      return NextResponse.json(
        { error: 'source_type and source_name are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('user_sources')
      .insert({
        user_id: user.id,
        source_type,
        source_name,
        source_config: source_config || {},
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Source create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
