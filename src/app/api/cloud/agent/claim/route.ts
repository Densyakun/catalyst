import { NextRequest, NextResponse } from 'next/server';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { claimCloudJobById } from '@/lib/cloud/jobs';
import { getCloudConfig } from '@/lib/cloud/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = authorizeRunner(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.job_id === 'string' ? body.job_id.trim() : '';
    const runnerId = typeof body?.runner_id === 'string' ? body.runner_id.trim() : '';
    if (!jobId || !runnerId) {
      return NextResponse.json({ error: 'job_id and runner_id are required' }, { status: 400 });
    }

    const config = getCloudConfig();
    const result = await claimCloudJobById(jobId, runnerId);
    if (!result.job) {
      return NextResponse.json({ job: null, reason: result.reason });
    }

    const job = result.job;
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
        stall_minutes: config.jobStallMinutes,
        codespace_name: job.codespace_name,
        started_at: job.started_at,
        allow_push: config.autoPush,
        max_diff_lines: config.maxDiffLines,
        sandbox_user: config.sandboxUser,
      },
      reason: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud agent claim error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
