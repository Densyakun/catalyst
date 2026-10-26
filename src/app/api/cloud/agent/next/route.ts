import { NextRequest, NextResponse } from 'next/server';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { claimCloudJob } from '@/lib/cloud/jobs';

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

    const job = await claimCloudJob(codespaceName);
    if (!job) {
      return NextResponse.json({ job: null, retry_after_seconds: 10 });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        kind: job.kind,
        title: job.title,
        prompt: job.prompt,
        repo: job.repo,
        branch: job.branch,
        issue_number: job.issue_number,
        issue_url: job.issue_url,
        model: job.model,
        max_minutes: job.max_minutes,
        codespace_name: job.codespace_name,
        started_at: job.started_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud agent next error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
