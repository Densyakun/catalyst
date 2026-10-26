import { NextRequest, NextResponse } from 'next/server';
import { getCloudConfig } from './config';

export function authorizeRunner(req: NextRequest): NextResponse | null {
  const expected = getCloudConfig().runnerToken;
  if (!expected) {
    return NextResponse.json(
      { error: 'CLOUD_RUNNER_TOKEN が設定されていません' },
      { status: 503 },
    );
  }

  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
