import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getBillingConfig } from '@/lib/billing/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = getBillingConfig();
    return NextResponse.json({
      available: config.available,
      currency: config.currency,
      credits_per_yen: config.creditsPerYen,
      packs: config.available
        ? config.packs.map((pack) => ({
            id: pack.id,
            label: pack.label,
            amount_jpy: pack.amountJpy,
            credits: pack.credits,
          }))
        : [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Billing packs error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
