import { NextRequest, NextResponse } from 'next/server';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { touchCloudJob } from '@/lib/cloud/jobs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = authorizeRunner(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    await touchCloudJob(jobId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
