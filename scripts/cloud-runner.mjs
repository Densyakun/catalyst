#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

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

const patternsPath = fileURLToPath(new URL('../src/lib/cloud/security-patterns.json', import.meta.url));
const patterns = JSON.parse(readFileSync(patternsPath, 'utf8'));

function compile(defs) {
  return defs.map((def) => ({ label: def.label, re: new RegExp(def.pattern, def.flags || '') }));
}

const SECRETS = compile(patterns.secrets);
const PROTECTED = patterns.protectedPaths.map((pattern) => new RegExp(pattern));

function unique(values) {
  return Array.from(new Set(values));
}

function scanSecrets(text) {
  if (!text) return [];
  return unique(SECRETS.filter((item) => item.re.test(text)).map((item) => item.label));
}

function scanProtectedPaths(files) {
  return unique(
    files
      .filter((file) => file && PROTECTED.some((re) => re.test(file)))
      .map((file) => file.replace(/\\/g, '/')),
  );
}

function sanitizeText(text) {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n');
}

function sanitizeCommitText(text, maxLength = 120) {
  return sanitizeText(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function minimalEnv(home) {
  return {
    HOME: home,
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    TERM: 'dumb',
    TMPDIR: '/tmp',
    NO_COLOR: '1',
    CI: '1',
    GIT_TERMINAL_PROMPT: '0',
    GH_PROMPT_DISABLED: '1',
  };
}

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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: [options.input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let truncated = false;
    let timer;

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (options.maxOutputBytes && stdoutBytes > options.maxOutputBytes) {
        truncated = true;
        child.kill('SIGTERM');
        return;
      }
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, signal, stdout, stderr, truncated });
    });

    if (options.input != null) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

function runAsUser(user, command, args, options = {}) {
  const env = options.env || minimalEnv('/tmp');
  const pairs = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  return run('sudo', ['-u', user, '--', '/usr/bin/env', '-i', ...pairs, command, ...args], {
    cwd: options.cwd || '/tmp',
    input: options.input,
    timeoutMs: options.timeoutMs,
    env: { PATH: process.env.PATH || '/usr/bin:/bin' },
  });
}

async function writeAsUser(user, filePath, content) {
  await runAsUser(
    user,
    '/bin/sh',
    ['-c', 'umask 077; mkdir -p "$(dirname "$1")" && cat > "$1"', 'sh', filePath],
    { input: content, env: minimalEnv('/tmp') },
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

function opencodeConfig() {
  return {
    $schema: 'https://opencode.ai/config.json',
    permission: {
      '*': 'deny',
      read: {
        '*': 'allow',
        '*.env': 'deny',
        '*.env.*': 'deny',
        '**/.env': 'deny',
        '**/.env.*': 'deny',
        '*.pem': 'deny',
        '*.key': 'deny',
        '**/id_rsa*': 'deny',
        '**/id_ed25519*': 'deny',
        '.git/**': 'deny',
        '**/.git/**': 'deny',
      },
      edit: {
        '*': 'allow',
        '.git/**': 'deny',
        '**/.git/**': 'deny',
        'node_modules/**': 'deny',
        '**/node_modules/**': 'deny',
      },
      glob: 'allow',
      grep: 'allow',
      todowrite: 'allow',
      bash: 'deny',
      webfetch: 'deny',
      websearch: 'deny',
      external_directory: 'deny',
      task: 'deny',
      skill: 'deny',
      question: 'deny',
      lsp: 'deny',
      doom_loop: 'deny',
    },
  };
}

async function writeOpencodeHome(home, asUser) {
  if (!OPENCODE_KEY) {
    throw new Error('OPENCODE_GO_API_KEY が設定されていません');
  }

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

  const files = [
    [path.join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify(opencodeConfig(), null, 2)],
    [path.join(home, '.local', 'share', 'opencode', 'account.json'), JSON.stringify(account, null, 2)],
    [
      path.join(home, '.local', 'share', 'opencode', 'auth.json'),
      JSON.stringify({ [PROVIDER_ID]: { type: 'api', key: OPENCODE_KEY } }, null, 2),
    ],
  ];

  for (const [filePath, content] of files) {
    if (asUser) {
      await writeAsUser(asUser, filePath, content);
    } else {
      await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      await writeFile(filePath, content, { mode: 0o600 });
    }
  }
}

async function prepareSandbox(job, user) {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user) || user === 'root') {
    throw new Error('sandbox user is invalid');
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(job.id))) {
    throw new Error('job id is invalid');
  }

  const root = path.join(os.tmpdir(), `katalyst-cloud-${job.id}`);
  const home = path.join(root, 'home');
  const workspace = path.join(root, 'workspace');

  await runAsUser(user, 'mkdir', ['-p', home, workspace], { env: minimalEnv('/tmp') });
  await runAsUser(user, 'chmod', ['700', home], { env: minimalEnv('/tmp') });
  await runAsUser(user, 'chmod', ['711', root], { env: minimalEnv('/tmp') });
  await runAsUser(user, 'chmod', ['711', workspace], { env: minimalEnv('/tmp') });
  await writeAsUser(user, path.join(workspace, 'README.md'), '# Sandbox workspace\n');

  try {
    await chmod(REPO_DIR, 0o700);
  } catch {
    throw new Error('本体リポジトリをサンドボックスから分離できませんでした');
  }
  try {
    await chmod(os.homedir(), 0o700);
  } catch {
    throw new Error('ランナーのホームディレクトリを分離できませんでした');
  }
  try {
    await chmod('/workspaces', 0o711);
  } catch {
  }
  try {
    await chmod('/tmp/katalyst-cloud.log', 0o600);
  } catch {
  }

  await writeOpencodeHome(home, user);

  return { home, workspace };
}

async function preparePrivileged(job) {
  if (!/^[0-9a-f-]{36}$/i.test(String(job.id))) {
    throw new Error('job id is invalid');
  }
  const root = path.join(os.tmpdir(), `katalyst-cloud-${job.id}`);
  const home = path.join(root, 'home');
  await mkdir(home, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await writeOpencodeHome(home, null);
  return { home, workspace: REPO_DIR };
}

async function runOpencode(job, context) {
  const args = [
    'run',
    '--format',
    'json',
    '--model',
    job.model || MODEL,
    '--auto',
    '--pure',
    job.prompt,
  ];
  const env = minimalEnv(context.home);
  const asUser = job.kind === 'user_task' ? (job.sandbox_user || 'agent') : null;

  const child = asUser
    ? spawn(
        'sudo',
        [
          '-u',
          asUser,
          '--',
          '/usr/bin/env',
          '-i',
          ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
          'opencode',
          ...args,
        ],
        { cwd: context.workspace, env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    : spawn('opencode', args, {
        cwd: context.workspace,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let text = '';
  let timedOut = false;

  const maxMinutes = Number(job.max_minutes) || 30;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10000);
  }, maxMinutes * 60 * 1000);

  const heartbeat = setInterval(() => {
    void api('/api/cloud/agent/heartbeat', { job_id: job.id }).catch(() => {});
  }, 60000);

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        if (text.length < 200000) {
          text += event.part.text;
        }
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

  let stderrBytes = 0;
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes <= 100000) {
      process.stderr.write(chunk);
    }
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', (error) => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      rl.close();
      reject(error);
    });
    child.on('close', (code) => resolve(code ?? 1));
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
  };
}

function countLines(text) {
  return text ? text.split('\n').length : 0;
}

async function collectReview(maxDiffLines) {
  const nameResult = await run('git', ['diff', 'HEAD', '--name-only', '-z'], {
    cwd: REPO_DIR,
    env: minimalEnv(os.tmpdir()),
  });
  const numstatResult = await run('git', ['diff', '--numstat', 'HEAD'], {
    cwd: REPO_DIR,
    env: minimalEnv(os.tmpdir()),
  });
  let trackedLines = 0;
  for (const line of numstatResult.stdout.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    trackedLines += (Number(parts[0]) || 0) + (Number(parts[1]) || 0);
  }
  const splitZ = (value) => value.split('\0').map((file) => file.trim()).filter(Boolean);
  if (trackedLines > maxDiffLines) {
    const files = splitZ(nameResult.stdout);
    return {
      files,
      diffText: '',
      untrackedText: '',
      diffLines: trackedLines,
      secretHits: [],
      protectedHits: scanProtectedPaths(files),
      flags: ['変更量が上限を超えています'],
    };
  }
  const untrackedResult = await run('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: REPO_DIR,
    env: minimalEnv(os.tmpdir()),
  });
  const diffResult = await run('git', ['diff', 'HEAD', '--no-color', '--unified=0'], {
    cwd: REPO_DIR,
    env: minimalEnv(os.tmpdir()),
    maxOutputBytes: 2 * 1024 * 1024,
  });

  const untrackedFiles = splitZ(untrackedResult.stdout);
  const files = unique([...splitZ(nameResult.stdout), ...untrackedFiles]);

  const flags = [];
  let untrackedText = '';
  let untrackedBytes = 0;

  if (files.length > 0) {
    const summaryResult = await run('git', ['diff', '--summary', 'HEAD'], {
      cwd: REPO_DIR,
      env: minimalEnv(os.tmpdir()),
    });
    for (const line of summaryResult.stdout.split('\n')) {
      if (/\b120000\b/.test(line)) flags.push(`シンボリックリンク: ${line.trim()}`);
      if (/\b160000\b/.test(line)) flags.push(`サブモジュール: ${line.trim()}`);
    }
  }

  for (const file of untrackedFiles.slice(0, 80)) {
    const fullPath = path.join(REPO_DIR, file);
    try {
      const stat = await lstat(fullPath);
      if (stat.isSymbolicLink()) {
        flags.push(`シンボリックリンク: ${file}`);
        continue;
      }
      if (stat.size > 512 * 1024) {
        flags.push(`大きすぎるファイル: ${file}`);
        continue;
      }
      const content = await readFile(fullPath);
      if (content.includes(0)) {
        flags.push(`バイナリファイル: ${file}`);
        continue;
      }
      untrackedBytes += content.length;
      if (untrackedBytes > 2 * 1024 * 1024) {
        flags.push('未追跡ファイルが大きすぎます');
        break;
      }
      untrackedText += `\n--- ${file} ---\n${content.toString('utf8')}`;
    } catch {
      flags.push(`読み取り不可: ${file}`);
    }
  }

  const diffText = diffResult.truncated ? '' : diffResult.stdout;
  if (diffResult.truncated) {
    flags.push('差分が大きすぎます');
  }
  if (diffText.includes('Binary files')) {
    flags.push('バイナリ変更');
  }

  return {
    files,
    diffText,
    untrackedText,
    diffLines: countLines(diffText) + countLines(untrackedText),
    secretHits: scanSecrets(`${diffText}\n${untrackedText}`),
    protectedHits: scanProtectedPaths(files),
    flags,
  };
}

async function runTypecheck(home) {
  const bin = path.join(REPO_DIR, 'node_modules', '.bin', 'tsc');
  if (!existsSync(bin)) {
    return { ok: true, skipped: true, output: '' };
  }
  const result = await run(bin, ['--noEmit'], {
    cwd: REPO_DIR,
    env: minimalEnv(home),
    timeoutMs: 180000,
  });
  return {
    ok: result.code === 0,
    skipped: false,
    output: `${result.stdout}\n${result.stderr}`.slice(-4000),
  };
}

async function gitStatus() {
  const result = await run('git', ['status', '--porcelain'], {
    cwd: REPO_DIR,
    env: minimalEnv(os.tmpdir()),
  });
  return result.stdout.trim();
}

async function checkGitSafety() {
  const env = minimalEnv(os.tmpdir());
  const hooksPath = await run('git', ['config', '--local', '--get', 'core.hooksPath'], {
    cwd: REPO_DIR,
    env,
  });
  if (hooksPath.code === 0 && hooksPath.stdout.trim()) {
    return 'core.hooksPath が設定されています';
  }

  const fsmonitor = await run('git', ['config', '--local', '--get', 'core.fsmonitor'], {
    cwd: REPO_DIR,
    env,
  });
  if (fsmonitor.code === 0 && fsmonitor.stdout.trim()) {
    return 'core.fsmonitor が設定されています';
  }

  const filters = await run('git', ['config', '--local', '--get-regexp', '^filter\\.'], {
    cwd: REPO_DIR,
    env,
  });
  if (filters.code === 0 && filters.stdout.trim()) {
    return 'git filter が設定されています';
  }

  const hooksDir = path.join(REPO_DIR, '.git', 'hooks');
  if (existsSync(hooksDir)) {
    const entries = await readdir(hooksDir);
    const executable = entries.find((name) => !name.endsWith('.sample'));
    if (executable) return `git hook が存在します: ${executable}`;
  }

  return null;
}

async function defaultBranch(repoDir, repo) {
  const result = await run(
    'gh',
    ['repo', 'view', repo, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'],
    { cwd: repoDir, env: { ...process.env, GH_TOKEN: GITHUB_API_TOKEN } },
  );
  return result.stdout.trim() || 'main';
}

async function resetRepoForJob() {
  const env = minimalEnv(os.tmpdir());
  const head = await run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    cwd: REPO_DIR,
    env,
  });
  let branch = head.code === 0 ? head.stdout.trim().replace(/^origin\//, '') : '';
  if (!branch) {
    branch = await defaultBranch(REPO_DIR, GITHUB_REPOSITORY);
  }
  if (!branch) {
    return { ok: false, error: 'default branch を特定できません' };
  }

  const netEnv = {
    ...process.env,
    GITHUB_TOKEN: GITHUB_API_TOKEN,
    GH_TOKEN: GITHUB_API_TOKEN,
    GIT_TERMINAL_PROMPT: '0',
  };
  await run('git', ['fetch', 'origin', branch, '--quiet'], { cwd: REPO_DIR, env: netEnv });

  const checkout = await run('git', ['checkout', '-f', '-B', branch, `origin/${branch}`], {
    cwd: REPO_DIR,
    env,
  });
  if (checkout.code !== 0) {
    return { ok: false, error: checkout.stderr.trim() || 'checkout に失敗しました' };
  }

  const reset = await run('git', ['reset', '--hard', `origin/${branch}`], { cwd: REPO_DIR, env });
  if (reset.code !== 0) {
    return { ok: false, error: reset.stderr.trim() || 'reset に失敗しました' };
  }

  const clean = await run('git', ['clean', '-fdx', '-e', 'node_modules'], { cwd: REPO_DIR, env });
  if (clean.code !== 0) {
    return { ok: false, error: clean.stderr.trim() || 'clean に失敗しました' };
  }

  return { ok: true };
}

function safeSummary(summary) {
  const cleaned = sanitizeText(summary).slice(0, 4000);
  return scanSecrets(cleaned).length ? '（要約は安全のため非表示にしました）' : cleaned;
}

function safeDetail(text, maxLength = 12000) {
  const cleaned = sanitizeText(text).slice(0, maxLength);
  return scanSecrets(cleaned).length ? '（出力は安全のため非表示にしました）' : cleaned;
}

async function publishIssueBranch(job, summary) {
  const repo = job.repo || GITHUB_REPOSITORY;
  const branch = job.branch || `katalyst/issue-${job.issue_number || Date.now()}`;
  const title = sanitizeCommitText(job.title, 120);
  const message = `fix: ${title}\n\nAutomated cloud agent work for ${job.issue_url || title}`;

  await run('git', ['checkout', '-B', branch], { cwd: REPO_DIR });
  await run('git', ['add', '-A'], { cwd: REPO_DIR });
  const commit = await run('git', ['commit', '-m', message], { cwd: REPO_DIR });
  if (commit.code !== 0) {
    throw new Error(commit.stderr.trim() || 'コミットに失敗しました');
  }

  const push = await run('git', ['push', '-u', 'origin', branch], {
    cwd: REPO_DIR,
    env: {
      ...process.env,
      GITHUB_TOKEN: GITHUB_API_TOKEN,
      GH_TOKEN: GITHUB_API_TOKEN,
    },
  });
  if (push.code !== 0) {
    throw new Error(push.stderr.trim() || 'push に失敗しました');
  }

  const base = await defaultBranch(REPO_DIR, repo);
  const body = [
    safeSummary(summary),
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
      title,
      '--body',
      body,
    ],
    { cwd: REPO_DIR, env: { ...process.env, GH_TOKEN: GITHUB_API_TOKEN } },
  );

  if (pr.code !== 0) {
    throw new Error(pr.stderr.trim() || 'PR の作成に失敗しました');
  }

  return { branch, prUrl: pr.stdout.trim().split('\n').filter(Boolean).pop() || '' };
}

async function listSandboxFiles(user, workspace) {
  const result = await runAsUser(user, '/bin/ls', ['-1', workspace], {
    cwd: '/tmp',
    env: minimalEnv('/tmp'),
  });
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30);
}

async function reportJob(job, payload) {
  const parsedStart = job.started_at ? Date.parse(job.started_at) : NaN;
  const startedAt = Number.isFinite(parsedStart) ? parsedStart : Date.now();
  const runtimeSeconds = Math.round((Date.now() - startedAt) / 1000);

  await api('/api/cloud/agent/report', {
    job_id: job.id,
    codespace_name: CODESPACE_NAME,
    status: payload.status,
    summary: payload.summary,
    detail: payload.detail,
    error: payload.error,
    pr_url: payload.prUrl || '',
    branch: payload.branch || '',
    security_flags: payload.securityFlags || [],
    blocked_stage: payload.blockedStage,
    keep_codespace: Boolean(payload.keepCodespace),
    usage: {
      runtime_seconds: runtimeSeconds,
      input_tokens: payload.usage?.inputTokens || 0,
      output_tokens: payload.usage?.outputTokens || 0,
      cost_usd: payload.usage?.costUsd || 0,
    },
  });
}

async function cleanupJobContext(job, context) {
  if (!context) return;
  const root = job.kind === 'user_task'
    ? path.dirname(context.workspace)
    : path.dirname(context.home);
  if (!path.basename(root).startsWith('katalyst-cloud-')) return;
  try {
    if (job.kind === 'user_task') {
      await runAsUser(job.sandbox_user || 'agent', '/bin/rm', ['-rf', root], {
        cwd: '/tmp',
        env: minimalEnv('/tmp'),
      });
    } else {
      await run('rm', ['-rf', root], { cwd: '/tmp', env: minimalEnv('/tmp') });
    }
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

async function processJob(job) {
  console.log(`Job ${job.id} (${job.kind}): ${job.title}`);
  const startedAt = Date.now();
  let context = null;

  try {

  if (job.kind === 'app_issue') {
    const reset = await resetRepoForJob();
    if (!reset.ok) {
      await reportJob(job, {
        status: 'failed',
        summary: '作業環境の初期化に失敗しました。',
        error: 'repo_reset_failed',
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      });
      return;
    }
  }

  try {
    context = job.kind === 'user_task'
      ? await prepareSandbox(job, job.sandbox_user || 'agent')
      : await preparePrivileged(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Sandbox setup failed:', message);
    await reportJob(job, {
      status: 'failed',
      summary: '安全な作業環境を準備できませんでした。',
      error: 'sandbox_setup_failed',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    });
    return;
  }

  let result;
  try {
    result = await runOpencode(job, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('opencode failed:', message);
    await reportJob(job, {
      status: 'failed',
      summary: '作業を実行できませんでした。',
      error: 'opencode_failed',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    });
    return;
  }

  const usage = {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
  const text = sanitizeText(result.text).slice(0, 12000);

  if (result.timedOut) {
    await reportJob(job, {
      status: 'timed_out',
      summary: '実行時間の上限を超えました。',
      error: 'timeout',
      usage,
    });
    return;
  }

  if (result.exitCode !== 0) {
    await reportJob(job, {
      status: 'failed',
      summary: '作業を完了できませんでした。',
      detail: safeDetail(text),
      error: `opencode exited with code ${result.exitCode}`,
      usage,
    });
    return;
  }

  if (job.kind === 'user_task') {
    const files = await listSandboxFiles(job.sandbox_user || 'agent', context.workspace).catch(() => []);
    const detail = [safeDetail(text), '', `ファイル: ${files.join(', ') || '(なし)'}`].join('\n');
    await reportJob(job, {
      status: 'succeeded',
      summary: safeSummary(text) || '完了しました',
      detail,
      usage,
    });
    return;
  }

  const changes = await gitStatus();
  if (!changes) {
    await reportJob(job, {
      status: 'failed',
      summary: 'コードの変更はありませんでした。',
      detail: safeDetail(text),
      error: 'no_changes',
      usage,
    });
    return;
  }

  const maxDiffLines = Number(job.max_diff_lines) || 1500;
  const review = await collectReview(maxDiffLines);
  const reviewFlags = [
    ...review.flags,
    ...review.protectedHits.map((file) => `保護対象ファイル: ${file}`),
    ...review.secretHits.map((label) => `秘密情報の可能性: ${label}`),
  ];

  if (review.secretHits.length > 0) {
    await reportJob(job, {
      status: 'blocked',
      summary: '秘密情報の可能性を検出したため停止しました。',
      detail: [
        '秘密情報らしき文字列を検出したため、差分の内容は表示しません。',
        `検出: ${review.secretHits.join(' / ')}`,
        `変更ファイル: ${review.files.join(', ')}`,
      ].join('\n'),
      error: 'secret_detected',
      securityFlags: unique(reviewFlags),
      blockedStage: 'diff',
      keepCodespace: false,
      usage,
    });
    return;
  }

  if (review.flags.length > 0) {
    await reportJob(job, {
      status: 'blocked',
      summary: '安全でない変更を検出したため停止しました。',
      detail: [`検出: ${review.flags.join(' / ')}`, `変更ファイル: ${review.files.join(', ')}`, '', review.diffText.slice(0, 8000)].join('\n'),
      error: 'unsafe_change',
      securityFlags: unique(reviewFlags),
      blockedStage: 'diff',
      keepCodespace: true,
      usage,
    });
    return;
  }

  if (review.protectedHits.length > 0) {
    await reportJob(job, {
      status: 'blocked',
      summary: '保護対象ファイルの変更を検出したため停止しました。管理者の確認が必要です。',
      detail: [`変更ファイル: ${review.files.join(', ')}`, '', review.diffText.slice(0, 8000)].join('\n'),
      error: 'protected_path_change',
      securityFlags: unique(reviewFlags),
      blockedStage: 'diff',
      keepCodespace: true,
      usage,
    });
    return;
  }

  if (review.diffLines > maxDiffLines) {
    await reportJob(job, {
      status: 'blocked',
      summary: '変更量が上限を超えたため停止しました。管理者の確認が必要です。',
      detail: `変更行数: ${review.diffLines} / 上限: ${maxDiffLines}\n変更ファイル: ${review.files.join(', ')}`,
      error: 'diff_too_large',
      securityFlags: unique([...reviewFlags, '変更量が上限を超えています']),
      blockedStage: 'diff',
      keepCodespace: true,
      usage,
    });
    return;
  }

  const typecheck = await runTypecheck(context.home);
  if (!typecheck.ok) {
    const typeOutput = scanSecrets(typecheck.output).length
      ? '（型チェック出力は安全のため非表示にしました）'
      : typecheck.output;
    await reportJob(job, {
      status: 'failed',
      summary: '型チェックに失敗したため停止しました。',
      detail: [typeOutput, '', review.diffText.slice(0, 8000)].join('\n'),
      error: 'typecheck_failed',
      securityFlags: unique(reviewFlags),
      keepCodespace: true,
      usage,
    });
    return;
  }

  if (job.allow_push !== true) {
    await reportJob(job, {
      status: 'blocked',
      summary: '自動 push が無効のため、管理者の確認待ちで停止しました。',
      detail: [`変更ファイル: ${review.files.join(', ')}`, '', review.diffText.slice(0, 8000)].join('\n'),
      error: 'auto_push_disabled',
      securityFlags: unique([...reviewFlags, '自動push無効']),
      blockedStage: 'diff',
      keepCodespace: true,
      usage,
    });
    return;
  }

  const gitSafety = await checkGitSafety();
  if (gitSafety) {
    await reportJob(job, {
      status: 'blocked',
      summary: '安全でない Git 設定を検出したため停止しました。',
      detail: `検出: ${gitSafety}\n変更ファイル: ${review.files.join(', ')}`,
      error: 'unsafe_git_config',
      securityFlags: unique([...reviewFlags, gitSafety]),
      blockedStage: 'diff',
      keepCodespace: true,
      usage,
    });
    return;
  }

  try {
    const published = await publishIssueBranch(job, text);
    await reportJob(job, {
      status: 'succeeded',
      summary: safeSummary(text) || '完了しました',
      detail: [safeDetail(text), `ブランチ: ${published.branch}`].join('\n'),
      prUrl: published.prUrl,
      branch: published.branch,
      usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reportJob(job, {
      status: 'failed',
      summary: '変更の公開に失敗しました。',
      detail: review.diffText.slice(0, 8000),
      error: message.slice(0, 2000),
      keepCodespace: true,
      usage,
    });
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`Job ${job.id} finished in ${elapsed}s`);
  } finally {
    await cleanupJobContext(job, context);
  }
}

async function main() {
  try {
    await chmod('/tmp/katalyst-cloud.log', 0o600);
  } catch {
  }

  if (!GITHUB_API_TOKEN) {
    console.error('GITHUB_TOKEN が見つかりません');
  }

  let idleMinutes = 15;
  let idleSince = Date.now();

  while (true) {
    let response;
    try {
      response = await api('/api/cloud/agent/next', { codespace_name: CODESPACE_NAME });
    } catch (error) {
      console.error('Failed to get next job:', error);
      break;
    }

    if (typeof response.runner_idle_minutes === 'number') {
      idleMinutes = response.runner_idle_minutes;
    }

    if (!response.job) {
      if (response.session_active === false) {
        console.log('Session is no longer active');
        break;
      }
      if (Date.now() - idleSince >= idleMinutes * 60 * 1000) {
        console.log(`No jobs for ${idleMinutes} minutes; stopping the codespace`);
        try {
          await api('/api/cloud/agent/stop', { codespace_name: CODESPACE_NAME });
        } catch (error) {
          console.error('Failed to stop session:', error);
        }
        break;
      }
      await sleep(10000);
      continue;
    }

    idleSince = Date.now();
    await processJob(response.job);
    idleSince = Date.now();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
