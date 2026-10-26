import { NextRequest, NextResponse } from 'next/server';
import { authorizeRunner } from '@/lib/cloud/runner-auth';
import { CLOUD_PROGRESS_STAGES, updateCloudJobProgress } from '@/lib/cloud/jobs';

export const dynamic = 'force-dynamic';

const STAGES = new Set<string>(CLOUD_PROGRESS_STAGES);

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
    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    const stage = typeof body?.stage === 'string' && STAGES.has(body.stage)
      ? body.stage
      : undefined;
    const usage = body?.usage ?? {};

    await updateCloudJobProgress({
      jobId,
      stage,
      runtimeSeconds: toNumber(usage.runtime_seconds),
      inputTokens: toNumber(usage.input_tokens),
      outputTokens: toNumber(usage.output_tokens),
      costUsd: toNumber(usage.cost_usd),
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud agent progress error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
