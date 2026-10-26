import { NextRequest, NextResponse } from 'next/server';
import { getCloudConfig } from '@/lib/cloud/config';
import { runCloudTick } from '@/lib/cloud/jobs';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = getCloudConfig().cronSecret;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

async function tick(req: NextRequest) {
  const config = getCloudConfig();
  if (!config.cronSecret) {
    return NextResponse.json(
      { error: 'CLOUD_CRON_SECRET が設定されていません' },
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCloudTick();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud cron error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return tick(req);
}

export async function POST(req: NextRequest) {
  return tick(req);
}
