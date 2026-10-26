#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const APP_URL = (process.env.CATALYST_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
const RUNNER_TOKEN = process.env.CATALYST_CLOUD_RUNNER_TOKEN || '';
const OPENCODE_KEY = process.env.OPENCODE_GO_API_KEY || '';
const PROVIDER_ID = process.env.OPENCODE_PROVIDER_ID || 'opencode-go';
const MODEL = process.env.OPENCODE_MODEL || 'opencode-go/deepseek-v4.1-flash';
const CODESPACE_NAME = process.env.CODESPACE_NAME || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_API_TOKEN = process.env.CATALYST_GITHUB_TOKEN || GITHUB_TOKEN;

const REPO_DIR = process.env.GITHUB_WORKSPACE
  || (GITHUB_REPOSITORY ? path.join('/workspaces', GITHUB_REPOSITORY.split('/')[1]) : process.cwd());

if (!APP_URL || !RUNNER_TOKEN) {
  console.error('CATALYST_APP_URL と CATALYST_CLOUD_RUNNER_TOKEN が必要です');
  process.exit(1);
}
if (!CODESPACE_NAME) {
  console.error('CODESPACE_NAME が見つかりません');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function configureOpenCodeAuth() {
  if (!OPENCODE_KEY) {
    throw new Error('OPENCODE_GO_API_KEY が設定されていません');
  }
  const dataDir = path.join(os.homedir(), '.local', 'share', 'opencode');
  await mkdir(dataDir, { recursive: true });

  const accountId = `acc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const account = {
    version: 2,
    accounts: {
      [accountId]: {
        id: accountId,
        serviceID: PROVIDER_ID,
        description: 'katalyst-cloud-runner',
        credential: { type: 'api', key: OPENCODE_KEY },
      },
    },
    active: { [PROVIDER_ID]: accountId },
  };
  await writeFile(path.join(dataDir, 'account.json'), JSON.stringify(account, null, 2), {
    mode: 0o600,
  });
  await writeFile(
    path.join(dataDir, 'auth.json'),
    JSON.stringify({ [PROVIDER_ID]: { type: 'api', key: OPENCODE_KEY } }, null, 2),
    { mode: 0o600 },
  );
}

async function api(pathname, body) {
  const res = await fetch(`${APP_URL}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RUNNER_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `API ${res.status}`);
  }
  return json;
}

async function pickJob() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await api('/api/cloud/agent/next', { codespace_name: CODESPACE_NAME });
    if (result.job) return result.job;
    await sleep(10000);
  }
  return null;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GH_PROMPT_DISABLED: '1',
        ...(options.env || {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      options.onStdout?.(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      options.onStderr?.(chunk.toString());
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function runOpencode(prompt, cwd, jobId, maxMinutes) {
  const startedAt = Date.now();
  const args = [
    'run',
    '--format',
    'json',
    '--model',
    MODEL,
    '--auto',
    '--pure',
    prompt,
  ];

  const child = spawn('opencode', args, {
    cwd,
    env: {
      ...process.env,
      GH_TOKEN: GITHUB_API_TOKEN,
      GITHUB_TOKEN,
      GIT_TERMINAL_PROMPT: '0',
      GH_PROMPT_DISABLED: '1',
      NO_COLOR: '1',
      CI: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let text = '';
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10000);
  }, maxMinutes * 60 * 1000);

  const heartbeat = setInterval(() => {
    void api('/api/cloud/agent/heartbeat', { job_id: jobId }).catch(() => {});
  }, 60000);

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        text += event.part.text;
      } else if (event.type === 'step_finish' && event.part) {
        const tokens = event.part.tokens || {};
        inputTokens += Number(tokens.input || 0);
        outputTokens += Number(tokens.output || 0);
        costUsd += Number(event.part.cost || 0);
      }
    } catch {
      console.error(line);
    }
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 0));
  });

  clearTimeout(timer);
  clearInterval(heartbeat);
  rl.close();

  return {
    exitCode,
    timedOut,
    text: text.trim(),
    inputTokens,
    outputTokens,
    costUsd,
    runtimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  };
}

async function gitStatus(repoDir) {
  const result = await run('git', ['status', '--porcelain'], { cwd: repoDir });
  return result.stdout.trim();
}

async function defaultBranch(repoDir, repo) {
  const result = await run(
    'gh',
    ['repo', 'view', repo, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
    { cwd: repoDir, env: { GH_TOKEN: GITHUB_API_TOKEN } },
  );
  return result.stdout.trim() || 'main';
}

async function publishIssueBranch(job, summary, repoDir) {
  const repo = job.repo || GITHUB_REPOSITORY;
  const branch = job.branch || `katalyst/issue-${job.issue_number || Date.now()}`;
  const message = `fix: ${job.title}\n\nAutomated cloud agent work for ${job.issue_url || job.title}`;

  await run('git', ['checkout', '-B', branch], { cwd: repoDir });
  await run('git', ['add', '-A'], { cwd: repoDir });
  const commit = await run('git', ['commit', '-m', message], { cwd: repoDir });
  if (commit.code !== 0) {
    throw new Error(commit.stderr.trim() || 'コミットに失敗しました');
  }

  const push = await run('git', ['push', '-u', 'origin', branch], { cwd: repoDir });
  if (push.code !== 0) {
    throw new Error(push.stderr.trim() || 'push に失敗しました');
  }

  const base = await defaultBranch(repoDir, repo);
  const body = [
    summary || 'クラウドエージェントによる自動修正です。',
    '',
    job.issue_url ? `Refs: ${job.issue_url}` : '',
  ].join('\n');

  const pr = await run(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      repo,
      '--base',
      base,
      '--head',
      branch,
      '--title',
      job.title,
      '--body',
      body,
    ],
    { cwd: repoDir, env: { GH_TOKEN: GITHUB_API_TOKEN } },
  );

  if (pr.code !== 0) {
    throw new Error(pr.stderr.trim() || 'PR の作成に失敗しました');
  }

  return { branch, prUrl: pr.stdout.trim().split('\n').filter(Boolean).pop() || '' };
}

async function prepareUserWorkspace(job) {
  const root = path.join(os.tmpdir(), 'katalyst-cloud-jobs');
  const target = path.join(root, job.id);
  await mkdir(target, { recursive: true });

  if (job.repo && GITHUB_API_TOKEN) {
    const cloneUrl = `https://x-access-token:${GITHUB_API_TOKEN}@github.com/${job.repo}.git`;
    const clone = await run('git', ['clone', '--depth', '1', cloneUrl, target]);
    if (clone.code !== 0) {
      throw new Error(clone.stderr.trim() || 'リポジトリの取得に失敗しました');
    }
  } else {
    await writeFile(
      path.join(target, 'README.md'),
      '# Cloud task workspace\n\nこのディレクトリでクラウド作業を実行しました。\n',
      'utf8',
    );
  }

  return target;
}

async function main() {
  if (!GITHUB_API_TOKEN) {
    console.error('GITHUB_TOKEN が見つかりません');
  }

  await configureOpenCodeAuth();
  const job = await pickJob();
  if (!job) {
    console.log('実行する作業がありませんでした');
    return;
  }

  const parsedStart = job.started_at ? Date.parse(job.started_at) : NaN;
  const startedAt = Number.isFinite(parsedStart) ? parsedStart : Date.now();
  console.log(`Job ${job.id} (${job.kind}): ${job.title}`);

  let status = 'succeeded';
  let summary = '';
  let detail = '';
  let error = '';
  let prUrl = '';
  let branch = '';
  let usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  try {
    let cwd = REPO_DIR;
    if (job.kind === 'user_task') {
      cwd = await prepareUserWorkspace(job);
    } else if (job.repo && GITHUB_REPOSITORY && job.repo !== GITHUB_REPOSITORY) {
      cwd = await prepareUserWorkspace(job);
    }

    const result = await runOpencode(job.prompt, cwd, job.id, Number(job.max_minutes) || 30);
    usage = {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    };

    if (result.timedOut) {
      status = 'timed_out';
      error = '実行時間の上限を超えました';
      summary = result.text.slice(0, 4000) || error;
    } else if (result.exitCode !== 0) {
      status = 'failed';
      error = `opencode が終了コード ${result.exitCode} で終了しました`;
      summary = result.text.slice(0, 4000) || error;
    } else {
      summary = result.text.slice(0, 4000) || '完了しました';
      detail = result.text.slice(0, 12000);

      if (job.kind === 'app_issue') {
        const changes = await gitStatus(cwd);
        if (!changes) {
          status = 'failed';
          error = 'コードの変更はありませんでした';
        } else {
          const published = await publishIssueBranch(job, summary, cwd);
          prUrl = published.prUrl;
          branch = published.branch;
        }
      } else {
        const files = await readdir(cwd).catch(() => []);
        detail = [detail, '', `作業ディレクトリ: ${cwd}`, `ファイル: ${files.slice(0, 30).join(', ')}`].join('\n');
      }
    }
  } catch (caught) {
    status = 'failed';
    error = caught instanceof Error ? caught.message : String(caught);
    summary = summary || error;
  }

  const runtimeSeconds = Math.round((Date.now() - startedAt) / 1000);

  try {
    await api('/api/cloud/agent/report', {
      job_id: job.id,
      codespace_name: CODESPACE_NAME,
      status,
      summary,
      detail,
      error,
      pr_url: prUrl,
      branch,
      usage: {
        runtime_seconds: runtimeSeconds,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: usage.costUsd,
      },
    });
    console.log(`Job ${job.id} reported as ${status}`);
  } catch (caught) {
    console.error('レポート送信に失敗しました:', caught);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
