import { createAdminClient } from '@/lib/supabase-admin';
import { notifyUser } from '@/lib/notifications';
import { calculateCloudCredits, chargePoolUpTo, chargeUserUpTo } from './credits';
import { getCloudConfig } from './config';
import {
  createCodespace,
  getRepo,
  listOpenIssues,
  stopCodespace,
  type GitHubIssue,
} from './github';
import type { CloudJob, CloudJobStatus } from '@/lib/types/cloud';

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toCloudJob(row: Row, isAdmin: boolean): CloudJob {
  return {
    id: String(row.id),
    kind: row.kind === 'app_issue' ? 'app_issue' : 'user_task',
    status: String(row.status) as CloudJobStatus,
    title: String(row.title || ''),
    prompt: isAdmin ? String(row.prompt || '') : undefined,
    repo: row.repo ? String(row.repo) : null,
    branch: row.branch ? String(row.branch) : null,
    issue_number: row.issue_number == null ? null : num(row.issue_number),
    issue_url: row.issue_url ? String(row.issue_url) : null,
    pr_url: row.pr_url ? String(row.pr_url) : null,
    codespace_url: isAdmin && row.codespace_url ? String(row.codespace_url) : null,
    funded_by: (row.funded_by as CloudJob['funded_by']) || 'user',
    payment_status: (row.payment_status as CloudJob['payment_status']) || 'pending',
    credits_estimated: num(row.credits_estimated),
    credits_charged: num(row.credits_charged),
    runtime_seconds: num(row.runtime_seconds),
    input_tokens: isAdmin ? num(row.input_tokens) : undefined,
    output_tokens: isAdmin ? num(row.output_tokens) : undefined,
    cost_usd: isAdmin ? num(row.cost_usd) : undefined,
    result_summary: row.result_summary ? String(row.result_summary) : null,
    result_detail: row.result_detail ? String(row.result_detail) : undefined,
    error: row.error ? String(row.error) : null,
    created_at: String(row.created_at),
    started_at: row.started_at ? String(row.started_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
  };
}

export function buildAppIssuePrompt(issue: GitHubIssue, repo: string): string {
  return [
    'あなたは Katalyse の開発エージェントです。以下の GitHub Issue を解決してください。',
    '',
    `リポジトリ: ${repo}`,
    `Issue #${issue.number}: ${issue.title}`,
    issue.html_url ? `URL: ${issue.html_url}` : '',
    '',
    'Issue の内容:',
    (issue.body || '(本文なし)').slice(0, 12000),
    '',
    '進め方:',
    '1. 関連するコードとテストを調査する',
    '2. 既存の設計・命名・スタイルに合わせて実装する',
    '3. 可能な範囲でテスト、lint、型チェックを実行する',
    '4. 変更内容と検証結果を最後に簡潔にまとめる',
    '',
    '制約:',
    '- コミットや push、PR 作成はしないでください（後続処理が行います）。',
    '- 破壊的変更や秘密情報の追加はしないでください。',
    '- 判断できない点は変更を広げすぎず、最も安全な実装にしてください。',
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');
}

export function buildUserTaskPrompt(title: string, prompt: string): string {
  return [
    'あなたは Katalyse のクラウド作業エージェントです。ユーザーの依頼を実行してください。',
    '',
    `依頼タイトル: ${title}`,
    '',
    '依頼内容:',
    prompt,
    '',
    '進め方:',
    '- 必要に応じてファイルを作成・編集・実行して構いません。',
    '- 外部への書き込みや破壊的な操作は、依頼に明記されている場合だけ行ってください。',
    '- 最後に、実行したことと成果を簡潔にまとめてください。',
  ].join('\n');
}

async function insertJob(row: Row): Promise<Row | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('cloud_jobs').insert(row).select().maybeSingle();
  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data as Row | null;
}

export async function enqueueAppIssues(): Promise<number> {
  const config = getCloudConfig();
  if (!config.autoEnabled || !config.githubToken || !config.repo) return 0;

  const issues = await listOpenIssues(config.githubToken, config.repo, {
    label: config.issueLabel || undefined,
    limit: 30,
  });
  if (issues.length === 0) return 0;

  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayCount } = await admin
    .from('cloud_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'app_issue')
    .gte('created_at', startOfDay.toISOString());
  if ((todayCount ?? 0) >= config.autoDailyLimit) return 0;

  const dedupeKeys = issues.map((issue) => `github:${config.repo}#${issue.number}`);
  const { data: existing } = await admin
    .from('cloud_jobs')
    .select('dedupe_key')
    .in('dedupe_key', dedupeKeys)
    .in('status', ['queued', 'provisioning', 'running', 'succeeded']);
  const known = new Set((existing || []).map((row) => String(row.dedupe_key)));

  let created = 0;
  for (const issue of issues) {
    if (created >= config.maxIssuesPerTick) break;

    const dedupeKey = `github:${config.repo}#${issue.number}`;
    if (known.has(dedupeKey)) continue;

    const job = await insertJob({
      user_id: null,
      kind: 'app_issue',
      status: 'queued',
      source: 'github',
      source_ref: `${config.repo}#${issue.number}`,
      dedupe_key: dedupeKey,
      priority: 100,
      title: `[#${issue.number}] ${issue.title}`.slice(0, 200),
      prompt: buildAppIssuePrompt(issue, config.repo),
      repo: config.repo,
      branch: `katalyst/issue-${issue.number}-${Date.now().toString(36)}`,
      issue_number: issue.number,
      issue_url: issue.html_url,
      model: config.model,
      max_minutes: config.jobMaxMinutes,
      funded_by: config.autoUsePool ? 'donation_pool' : 'system',
      credits_estimated: config.estimateCredits,
      metadata: { labels: issue.labels },
    });

    if (job) created += 1;
  }

  return created;
}

export async function startQueuedJobs(): Promise<number> {
  const config = getCloudConfig();
  if (!config.githubToken || !config.repo) return 0;

  const admin = createAdminClient();
  const { data: activeRows } = await admin
    .from('cloud_jobs')
    .select('id')
    .in('status', ['provisioning', 'running']);
  const active = (activeRows || []).length;
  const slots = config.maxConcurrent - active;
  if (slots <= 0) return 0;

  const { data: queued } = await admin
    .from('cloud_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(slots);

  if (!queued || queued.length === 0) return 0;

  const repo = await getRepo(config.githubToken, config.repo);
  let started = 0;

  for (const job of queued as Row[]) {
    try {
      const codespace = await createCodespace(config.githubToken, {
        repositoryId: repo.id,
        ref: config.ref || repo.default_branch,
        machine: config.machine,
        devcontainerPath: config.devcontainerPath,
        idleTimeoutMinutes: config.idleMinutes,
        retentionPeriodMinutes: config.retentionMinutes,
        displayName: `katalyst-${String(job.kind)}-${String(job.id).slice(0, 8)}`,
      });

      await admin
        .from('cloud_jobs')
        .update({
          status: 'provisioning',
          codespace_name: codespace.name,
          codespace_url: codespace.webUrl || null,
          machine: config.machine,
          started_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', job.id)
        .eq('status', 'queued');

      started += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failJobEarly(job, message);
    }
  }

  return started;
}

async function failJobEarly(job: Row, message: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const userFacing = job.kind === 'user_task'
    ? 'クラウド作業環境を準備できませんでした。時間をおいて再度お試しください。'
    : message.slice(0, 2000);

  await admin
    .from('cloud_jobs')
    .update({
      status: 'failed',
      error: userFacing,
      finished_at: now,
      payment_status: 'free',
      metadata: {
        ...((job.metadata as Record<string, unknown> | null) || {}),
        technical_error: message.slice(0, 2000),
      },
    })
    .eq('id', job.id)
    .eq('status', 'queued');

  if (job.user_id) {
    await notifyUser(admin, {
      userId: String(job.user_id),
      title: 'クラウド作業を開始できませんでした',
      body: userFacing,
      kind: 'error',
    });
  }
}

export async function sweepStaleJobs(): Promise<number> {
  const config = getCloudConfig();
  const admin = createAdminClient();
  const now = Date.now();
  const staleRunningCutoff = new Date(now - config.jobMaxMinutes * 60 * 1000).toISOString();
  const staleProvisioningCutoff = new Date(now - 15 * 60 * 1000).toISOString();

  const [{ data: staleRunning }, { data: staleProvisioning }] = await Promise.all([
    admin
      .from('cloud_jobs')
      .select('*')
      .eq('status', 'running')
      .lt('started_at', staleRunningCutoff),
    admin
      .from('cloud_jobs')
      .select('*')
      .eq('status', 'provisioning')
      .lt('started_at', staleProvisioningCutoff),
  ]);

  const rows = [...(staleRunning || []), ...(staleProvisioning || [])] as Row[];
  for (const job of rows) {
    const startedAt = job.started_at ? new Date(String(job.started_at)).getTime() : now;
    const runtimeSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
    await finalizeCloudJob({
      jobId: String(job.id),
      status: 'timed_out',
      summary: '実行時間の上限を超えたため終了しました。',
      error: 'timeout',
      usage: { runtimeSeconds, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      stopCodespaceAfter: true,
    });
  }

  return rows.length;
}

export async function claimCloudJob(codespaceName: string): Promise<Row | null> {
  const admin = createAdminClient();
  const { data: job } = await admin
    .from('cloud_jobs')
    .select('*')
    .eq('codespace_name', codespaceName)
    .eq('status', 'provisioning')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) return null;

  const now = new Date().toISOString();
  const { data: updated } = await admin
    .from('cloud_jobs')
    .update({
      status: 'running',
      heartbeat_at: now,
      started_at: (job as Row).started_at ?? now,
    })
    .eq('id', (job as Row).id)
    .eq('status', 'provisioning')
    .select()
    .maybeSingle();

  return (updated as Row | null) ?? null;
}

export async function touchCloudJob(jobId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('cloud_jobs')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'running');
}

export interface FinalizeInput {
  jobId: string;
  status: CloudJobStatus;
  summary?: string;
  detail?: string;
  error?: string;
  prUrl?: string;
  branch?: string;
  usage: {
    runtimeSeconds: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  stopCodespaceAfter?: boolean;
}

export async function finalizeCloudJob(input: FinalizeInput): Promise<Row | null> {
  const admin = createAdminClient();
  const { data: current } = await admin
    .from('cloud_jobs')
    .select('*')
    .eq('id', input.jobId)
    .maybeSingle();
  if (!current) return null;

  const currentJob = current as Row;
  if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(String(currentJob.status))) {
    return currentJob;
  }

  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from('cloud_jobs')
    .update({
      status: input.status,
      finished_at: now,
      heartbeat_at: now,
    })
    .eq('id', input.jobId)
    .in('status', ['queued', 'provisioning', 'running'])
    .select()
    .maybeSingle();

  if (!claimed) {
    const { data: latest } = await admin
      .from('cloud_jobs')
      .select('*')
      .eq('id', input.jobId)
      .maybeSingle();
    return (latest as Row | null) ?? currentJob;
  }

  const job = claimed as Row;
  const credits = calculateCloudCredits(input.usage);
  let charged = 0;
  let paymentStatus: CloudJob['payment_status'] = 'free';

  if (job.funded_by === 'user' && job.user_id) {
    const result = await chargeUserUpTo(String(job.user_id), credits);
    charged = result.charged;
    paymentStatus = result.shortfall > 0 ? 'shortfall' : 'charged';

    if (charged > 0) {
      await admin.from('cost_log').insert({
        user_id: job.user_id,
        operation_type: 'task_execution',
        layer: 3,
        input_item_ids: [],
        actual_cost: charged,
        is_social: false,
        funded_by: 'user',
      });
    }
  } else if (job.funded_by === 'donation_pool') {
    const result = await chargePoolUpTo(credits);
    charged = result.charged;
    paymentStatus = result.shortfall > 0 ? 'shortfall' : 'charged';
  }

  const technicalError = input.error?.slice(0, 2000) || null;
  const userFacingError = job.kind === 'user_task' && technicalError
    ? '作業を完了できませんでした。'
    : technicalError;

  const { data: updated } = await admin
    .from('cloud_jobs')
    .update({
      credits_charged: charged,
      payment_status: paymentStatus,
      runtime_seconds: Math.max(0, Math.round(input.usage.runtimeSeconds)),
      input_tokens: Math.max(0, Math.round(input.usage.inputTokens)),
      output_tokens: Math.max(0, Math.round(input.usage.outputTokens)),
      cost_usd: Number(Math.max(0, input.usage.costUsd).toFixed(6)),
      result_summary: input.summary?.slice(0, 4000) || null,
      result_detail: input.detail?.slice(0, 12000) || null,
      pr_url: input.prUrl?.slice(0, 1000) || String(job.pr_url || '') || null,
      branch: input.branch?.slice(0, 200) || job.branch || null,
      error: userFacingError,
      metadata: {
        ...((job.metadata as Record<string, unknown> | null) || {}),
        ...(job.kind === 'user_task' && technicalError ? { technical_error: technicalError } : {}),
      },
    })
    .eq('id', input.jobId)
    .select()
    .maybeSingle();

  if (job.user_id) {
    const succeeded = input.status === 'succeeded';
    const notificationBody = succeeded
      ? input.summary
      : job.kind === 'user_task'
        ? userFacingError
        : (input.summary || technicalError);
    await notifyUser(admin, {
      userId: String(job.user_id),
      title: succeeded ? 'クラウド作業が完了しました' : 'クラウド作業が終了しました',
      body: (notificationBody || '').slice(0, 500),
      detail: input.detail?.slice(0, 4000) || null,
      linkUrl: `${getCloudConfig().appUrl}/?tab=cloud`,
      kind: succeeded ? 'info' : 'error',
    });
  }

  if (input.stopCodespaceAfter !== false) {
    const config = getCloudConfig();
    const codespaceName = String(job.codespace_name || '');
    if (codespaceName && config.githubToken) {
      try {
        await stopCodespace(config.githubToken, codespaceName);
      } catch (error) {
        console.error('Stopping codespace failed:', error);
      }
    }
  }

  return (updated as Row | null) ?? job;
}

export async function runCloudTick(): Promise<Record<string, number | string[]>> {
  const errors: string[] = [];
  let stopped = 0;
  let enqueued = 0;
  let started = 0;

  try {
    stopped = await sweepStaleJobs();
  } catch (error) {
    errors.push(`sweep: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    enqueued = await enqueueAppIssues();
  } catch (error) {
    errors.push(`issues: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    started = await startQueuedJobs();
  } catch (error) {
    errors.push(`start: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { stopped, enqueued, started, errors };
}
