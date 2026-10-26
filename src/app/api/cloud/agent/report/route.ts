import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { finalizeCloudJob } from '@/lib/cloud/jobs';
import type { CloudJobStatus } from '@/lib/types/cloud';

export const dynamic = 'force-dynamic';

const ALLOWED: CloudJobStatus[] = ['succeeded', 'failed', 'blocked', 'cancelled', 'timed_out'];

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function POST(req: NextRequest) {
  const denied = authorizeRunner(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.job_id === 'string' ? body.job_id : '';
    const codespaceName = typeof body?.codespace_name === 'string' ? body.codespace_name : '';
    const status = ALLOWED.includes(body?.status) ? (body.status as CloudJobStatus) : 'failed';

    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: job } = await admin
      .from('cloud_jobs')
      .select('id, codespace_name, max_minutes')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'job not found' }, { status: 404 });
    }
    if (codespaceName && job.codespace_name && codespaceName !== job.codespace_name) {
      return NextResponse.json({ error: 'codespace mismatch' }, { status: 403 });
    }

    const usage = body?.usage ?? {};
    const maxSeconds = Math.max(60, toNumber(job.max_minutes) * 60);
    const blockedStage = body?.blocked_stage === 'precheck' || body?.blocked_stage === 'diff'
      ? body.blocked_stage
      : undefined;
    const securityFlags = Array.isArray(body?.security_flags)
      ? body.security_flags.filter((flag: unknown) => typeof flag === 'string').slice(0, 20)
      : undefined;

    const updated = await finalizeCloudJob({
      jobId,
      status,
      summary: typeof body?.summary === 'string' ? body.summary : undefined,
      detail: typeof body?.detail === 'string' ? body.detail : undefined,
      error: typeof body?.error === 'string' ? body.error : undefined,
      prUrl: typeof body?.pr_url === 'string' ? body.pr_url : undefined,
      branch: typeof body?.branch === 'string' ? body.branch : undefined,
      securityFlags,
      blockedStage,
      keepCodespace: body?.keep_codespace === true,
      usage: {
        runtimeSeconds: Math.min(maxSeconds, toNumber(usage.runtime_seconds)),
        inputTokens: toNumber(usage.input_tokens),
        outputTokens: toNumber(usage.output_tokens),
        costUsd: toNumber(usage.cost_usd),
      },
      stopCodespaceAfter: true,
    });

    return NextResponse.json({
      ok: true,
      status: updated?.status ?? status,
      credits_charged: Number(updated?.credits_charged ?? 0),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud agent report error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
