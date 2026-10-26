interface Env {
  CLOUD_APP_URL?: string;
  CLOUD_CRON_SECRET?: string;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function tick(env: Env): Promise<Response> {
  const appUrl = (env.CLOUD_APP_URL || '').replace(/\/+$/, '');
  const secret = env.CLOUD_CRON_SECRET || '';

  if (!appUrl || !secret) {
    return new Response('CLOUD_APP_URL and CLOUD_CRON_SECRET are required', { status: 503 });
  }

  const res = await fetch(`${appUrl}/api/cloud/cron`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log('cloud tick', res.status, body.slice(0, 1000));
  return new Response(body, { status: res.status });
}

const worker = {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(tick(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = env.CLOUD_CRON_SECRET || '';
    const header = request.headers.get('authorization') || '';
    if (!secret || header !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    return tick(env);
  },
};

export default worker;
