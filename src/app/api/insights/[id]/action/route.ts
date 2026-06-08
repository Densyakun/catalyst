import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();

    if (!['proceed', 'hold'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "proceed" or "hold"' },
        { status: 400 },
      );
    }

    const newStatus = action === 'proceed' ? 'in_progress' : 'on_hold';

    const { data, error } = await supabase
      .from('auto_insights')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Insight action error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
