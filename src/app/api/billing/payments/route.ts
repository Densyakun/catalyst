import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const PAYMENT_COLUMNS = 'id, purpose_id, amount, currency, credits, status, pack_id, created_at, paid_at';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    return NextResponse.json({ payments: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Billing payments error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
