import { NextRequest, NextResponse } from 'next/server';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { startQueuedJobs } from '@/lib/cloud/jobs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = authorizeRunner(req);
  if (denied) return denied;

  try {
    const started = await startQueuedJobs(req.nextUrl.origin);
    return NextResponse.json({ ok: true, started });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud job pump error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
