import { NextResponse } from 'next/server';
import { isAdminUser } from '@/lib/admin';
import {
  evaluateSessionFreshness,
  resolveAuthorization,
} from '@/lib/auth/authorization';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorization = resolveAuthorization({
      id: user.id,
      role: user.app_metadata?.role,
      isAdmin: isAdminUser(user),
    });
    const session = evaluateSessionFreshness({
      authenticatedAt: user.last_sign_in_at,
    });

    return NextResponse.json({
      authenticated: true,
      is_anonymous: user.is_anonymous === true,
      authorization,
      session,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Auth context error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
