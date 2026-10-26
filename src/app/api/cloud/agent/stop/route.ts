import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { getCloudConfig } from '@/lib/cloud/config';
import { stopCodespace } from '@/lib/cloud/github';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = authorizeRunner(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const codespaceName = typeof body?.codespace_name === 'string' ? body.codespace_name.trim() : '';
    if (!codespaceName) {
      return NextResponse.json({ error: 'codespace_name is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();
    await admin
      .from('cloud_sessions')
      .update({
        status: 'stopping',
        current_job_id: null,
        updated_at: now,
      })
      .eq('codespace_name', codespaceName);

    const config = getCloudConfig();
    let stopError: string | null = null;
    if (config.githubToken) {
      try {
        await stopCodespace(config.githubToken, codespaceName);
      } catch (error) {
        stopError = error instanceof Error ? error.message : String(error);
        console.error('Runner stop codespace error:', error);
      }
    }

    const finishedAt = new Date().toISOString();
    await admin
      .from('cloud_sessions')
      .update({
        status: stopError ? 'stopping' : 'stopped',
        stopped_at: stopError ? null : finishedAt,
        updated_at: finishedAt,
      })
      .eq('codespace_name', codespaceName);

    if (stopError) {
      return NextResponse.json({ error: '停止処理を再試行します' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud agent stop error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
