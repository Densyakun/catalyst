import { NextRequest, NextResponse } from 'next/server';
import { authorizeActionsBootstrap } from '@/lib/cloud/jobs';
import { getCloudConfig } from '@/lib/cloud/config';
import { getLlmBaseUrl, isOpenCodeBackend, resolveModelId } from '@/lib/ai/models';

export const dynamic = 'force-dynamic';

/**
 * GitHub Actions のランナーへ実行設定を渡す。
 *
 * ランナー側に秘密情報を保存しないため、ワークフロー実行IDと、
 * ディスパッチ時に発行した runner_id を GitHub API で照合してから返す。
 */
export async function POST(req: NextRequest) {
  try {
    const header = req.headers.get('authorization') || '';
    if (!header.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = getCloudConfig();
    if (!config.runnerToken) {
      return NextResponse.json(
        { error: 'CLOUD_RUNNER_TOKEN が設定されていません' },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.job_id === 'string' ? body.job_id.trim() : '';
    const runnerId = typeof body?.runner_id === 'string' ? body.runner_id.trim() : '';
    const runId = typeof body?.run_id === 'string' ? body.run_id.trim() : '';
    if (!jobId || !runnerId || !runId) {
      return NextResponse.json(
        { error: 'job_id, runner_id and run_id are required' },
        { status: 400 },
      );
    }

    const authorization = await authorizeActionsBootstrap(jobId, runnerId, runId);
    if (!authorization.ok) {
      const status = authorization.reason === 'not_found' ? 404 : 403;
      return NextResponse.json({ error: authorization.reason }, { status });
    }

    const apiKey = process.env.OPENAI_API_KEY || '';
    const payload = {
      runner_token: config.runnerToken,
      llm: apiKey
        ? {
            base_url: getLlmBaseUrl(),
            api_key: apiKey,
            model: resolveModelId('solving'),
            opencode: isOpenCodeBackend(),
          }
        : null,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud agent bootstrap error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
