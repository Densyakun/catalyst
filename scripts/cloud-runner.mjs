#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const APP_URL = (process.env.CATALYST_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
let RUNNER_TOKEN = process.env.CATALYST_CLOUD_RUNNER_TOKEN || '';
const OPENCODE_KEY = process.env.OPENCODE_GO_API_KEY || '';
const PROVIDER_ID = process.env.OPENCODE_PROVIDER_ID || 'opencode-go';
const MODEL = process.env.OPENCODE_MODEL || 'opencode-go/deepseek-v4.1-flash';
const CODESPACE_NAME = process.env.CODESPACE_NAME || '';
// GitHub Actions 実行時は Codespace 名の代わりに一意なランナーIDを使う。
const RUNNER_ID = process.env.CATALYST_RUNNER_ID || CODESPACE_NAME;
const JOB_ID = process.env.CATALYST_JOB_ID || '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
let GITHUB_API_TOKEN = process.env.CATALYST_GITHUB_TOKEN || GITHUB_TOKEN;

// Actions では OPENCODE_GO_API_KEY の代わりに、アプリと同じ LLM 設定を使える。
// 値は起動時にアプリの bootstrap API から受け取る（リポジトリに保存しない）。
let LLM_BASE_URL = (process.env.KATALYST_LLM_BASE_URL || '').replace(/\/+$/, '');
let LLM_API_KEY = process.env.KATALYST_LLM_API_KEY || '';
let LLM_MODEL = process.env.KATALYST_LLM_MODEL || '';
let LLM_OPENCODE = process.env.KATALYST_LLM_OPENCODE === '1';
const LLM_SESSION_ID = `ses_${crypto.randomUUID().replace(/-/g, '')}`;

function useCustomLlm() {
  return !OPENCODE_KEY && Boolean(LLM_BASE_URL && LLM_API_KEY && LLM_MODEL);
}

function customModelId() {
  return `katalyst/${LLM_MODEL}`;
}

async function bootstrapRunner() {
  const runId = process.env.GITHUB_RUN_ID || '';
  const res = await fetch(`${APP_URL}/api/cloud/agent/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({ job_id: JOB_ID, runner_id: RUNNER_ID, run_id: runId }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.runner_token) {
    throw new Error(`ランナー設定の取得に失敗しました: ${json.error || res.status}`);
  }
  RUNNER_TOKEN = String(json.runner_token);
  if (json.github_token) {
    GITHUB_API_TOKEN = String(json.github_token);
  }
  if (json.llm) {
    LLM_BASE_URL = String(json.llm.base_url || '').replace(/\/+$/, '');
    LLM_API_KEY = String(json.llm.api_key || '');
    LLM_MODEL = String(json.llm.model || '');
    LLM_OPENCODE = json.llm.opencode === true;
  }
}

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
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    TERM: 'dumb',
    TMPDIR: '/tmp',
    NO_COLOR: '1',
    CI: '1',
    GIT_TERMINAL_PROMPT: '0',
    GH_PROMPT_DISABLED: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    OPENCODE_DISABLE_SHARE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_TERMINAL_TITLE: '1',
  };
}

if (!APP_URL) {
  console.error('CATALYST_APP_URL が必要です');
  process.exit(1);
}
if (!RUNNER_TOKEN && !JOB_ID) {
  console.error('CATALYST_CLOUD_RUNNER_TOKEN が必要です');
  process.exit(1);
}
if (!RUNNER_ID) {
  console.error('CODESPACE_NAME または CATALYST_RUNNER_ID が見つかりません');
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
    let timedOut = false;
    let timer;

    const timeoutMs = options.timeoutMs === undefined ? 120000 : options.timeoutMs;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref?.();
      }, timeoutMs);
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
    let settled = false;
    let exitFallbackTimer = null;
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (exitFallbackTimer) clearTimeout(exitFallbackTimer);
      resolve({ code: timedOut ? 124 : (code ?? 1), signal, stdout, stderr, truncated, timedOut });
    };
    child.on('exit', (code) => {
      exitFallbackTimer = setTimeout(() => finish(code, null), 3000);
      exitFallbackTimer.unref?.();
    });
    child.on('close', (code, signal) => finish(code, signal));

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

async function api(pathname, body, options = {}) {
  const url = `${APP_URL}${pathname}`;
  const attempts = Math.max(1, Number(options.attempts) || 3);
  let lastError = new Error(`API ${pathname} failed`);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RUNNER_TOKEN}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(options.timeoutMs) || 20000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `API ${res.status}`);
      }
      return json;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await sleep(1500 * attempt);
      }
    }
  }

  throw lastError;
}

function opencodeConfig() {
  const config = {
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

  if (useCustomLlm()) {
    config.provider = {
      katalyst: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Katalyst',
        options: {
          baseURL: LLM_BASE_URL,
          apiKey: LLM_API_KEY,
          ...(LLM_OPENCODE ? { headers: { 'x-opencode-session': LLM_SESSION_ID } } : {}),
        },
        models: {
          [LLM_MODEL]: { name: LLM_MODEL },
        },
      },
    };
  }

  return config;
}

async function writeOpencodeHome(home, asUser) {
  if (!OPENCODE_KEY && !useCustomLlm()) {
    throw new Error(
      'OPENCODE_GO_API_KEY も KATALYST_LLM_* も設定されていません。LLM の認証設定を確認してください',
    );
  }

  const files = [
    [path.join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify(opencodeConfig(), null, 2)],
  ];

  if (OPENCODE_KEY) {
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
    files.push(
      [path.join(home, '.local', 'share', 'opencode', 'account.json'), JSON.stringify(account, null, 2)],
      [
        path.join(home, '.local', 'share', 'opencode', 'auth.json'),
        JSON.stringify({ [PROVIDER_ID]: { type: 'api', key: OPENCODE_KEY } }, null, 2),
      ],
    );
  }

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

  return { home, workspace, root, cleanup: true };
}

async function preparePrivileged(job) {
  if (!/^[0-9a-f-]{36}$/i.test(String(job.id))) {
    throw new Error('job id is invalid');
  }
  // app_issue は Codespace の専用ユーザーとして実行する。
  // 認証とモデルカタログは通常の HOME をそのまま使う（--pure と権限設定で分離する）。
  const home = os.homedir();
  await writeOpencodeHome(home, null);
  return { home, workspace: REPO_DIR, root: null, cleanup: false };
}

function resolveModel(job) {
  if (useCustomLlm()) return customModelId();
  return job.model || MODEL;
}

async function runOpencode(job, context) {
  const args = [
    'run',
    '--format',
    'json',
    '--model',
    resolveModel(job),
    '--auto',
    '--pure',
    '--print-logs',
    '--log-level',
    'ERROR',
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

  const parsedStart = job.started_at ? Date.parse(job.started_at) : NaN;
  const startedAtMs = Number.isFinite(parsedStart) ? parsedStart : Date.now();

  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let text = '';
  let timedOut = false;
  let stalled = false;
  let lastActivityAt = Date.now();
  let stderrTail = '';
  const errors = [];

  const maxMinutes = Number(job.max_minutes) || 30;
  const stallMinutes = Number(job.stall_minutes) || 8;

  const usageSnapshot = () => ({
    runtime_seconds: Math.round((Date.now() - startedAtMs) / 1000),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number(costUsd.toFixed(6)),
  });

  let lastProgressAt = 0;
  const reportProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < 30000) return;
    lastProgressAt = now;
    void api(
      '/api/cloud/agent/progress',
      { job_id: job.id, stage: 'agent', usage: usageSnapshot() },
      { attempts: 1, timeoutMs: 10000 },
    ).catch(() => {});
  };

  let finishFromWatchdog = null;

  const deadlineTimer = setTimeout(() => {
    timedOut = true;
    stderrTail += `\n[runner] 実行時間の上限 (${maxMinutes}分) に達したため停止します`;
    console.error(`Job ${job.id}: timeout after ${maxMinutes} minutes`);
    child.kill('SIGTERM');
    setTimeout(() => {
      child.kill('SIGKILL');
      finishFromWatchdog?.(124);
    }, 10000).unref?.();
  }, maxMinutes * 60 * 1000);

  const progressTimer = setInterval(() => reportProgress(true), 30000);

  // AI が応答を返さないまま無言で待ち続けるのを防ぐ。
  const stallTimer = setInterval(() => {
    if (stalled || timedOut) return;
    if (Date.now() - lastActivityAt >= stallMinutes * 60 * 1000) {
      stalled = true;
      stderrTail += `\n[runner] ${stallMinutes}分間 AI から応答がないため停止します`;
      console.error(`Job ${job.id}: stalled for ${stallMinutes} minutes`);
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
        finishFromWatchdog?.(124);
      }, 10000).unref?.();
      clearInterval(stallTimer);
    }
  }, 20000);

  reportProgress(true);

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    lastActivityAt = Date.now();
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
        reportProgress(true);
      } else if (event.type === 'error' && event.error) {
        const message = event.error?.data?.message
          || event.error?.name
          || 'AI の呼び出しに失敗しました';
        console.error(`[opencode] ${message}`);
        if (errors.length < 5) errors.push(String(message));
      }
    } catch {
      console.error(line);
    }
  });

  let stderrBytes = 0;
  child.stderr.on('data', (chunk) => {
    lastActivityAt = Date.now();
    stderrBytes += chunk.length;
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-8000);
    if (stderrBytes <= 100000) {
      process.stderr.write(chunk);
    }
  });

  const exitCode = await new Promise((resolve, reject) => {
    let settled = false;
    let exitFallbackTimer = null;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (exitFallbackTimer) clearTimeout(exitFallbackTimer);
      resolve(code);
    };
    finishFromWatchdog = finish;

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (exitFallbackTimer) clearTimeout(exitFallbackTimer);
      clearTimeout(deadlineTimer);
      clearInterval(progressTimer);
      clearInterval(stallTimer);
      rl.close();
      reject(error);
    });
    // 孫プロセスが stdout を握ったままでも、プロセス終了後は待ち続けない。
    child.on('exit', (code) => {
      exitFallbackTimer = setTimeout(() => finish(code ?? 1), 5000);
      exitFallbackTimer.unref?.();
    });
    child.on('close', (code) => finish(code ?? 1));
  });

  clearTimeout(deadlineTimer);
  clearInterval(progressTimer);
  clearInterval(stallTimer);
  rl.close();

  return {
    exitCode,
    timedOut,
    stalled,
    text: text.trim(),
    inputTokens,
    outputTokens,
    costUsd,
    errors,
    stderrTail: stderrTail.trim(),
    usage: usageSnapshot(),
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

/**
 * 実行設定（CI・依存・エージェント設定など）に触れる変更は、PR を作っても
 * ブランチ上の設定でビルドやワークフローが動くため、絶対に自動 push しない。
 */
const EXECUTION_PROTECTED = [
  /(^|\/)\.github\//,
  /(^|\/)\.devcontainer\//,
  /(^|\/)\.opencode\//,
  /(^|\/)\.claude\//,
  /(^|\/)\.cursor\//,
  /(^|\/)opencode\.jsonc?$/,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)wrangler\.(jsonc|toml)$/,
  /(^|\/)open-next\.config\.ts$/,
  /(^|\/)next\.config\.(js|mjs|ts)$/,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)(pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.yarnrc.*$/,
  /(^|\/)\.gitmodules$/,
  /(^|\/)Dockerfile$/,
  /(^|\/)docker-compose.*\.ya?ml$/,
  /(^|\/)supabase_(schema|migration_.*)\.sql$/,
  /(^|\/)\.env(\.|$)/,
  /\.pem$/,
  /(^|\/)id_rsa/,
  /(^|\/)id_ed25519/,
  /(^|\/)tsconfig.*\.json$/,
  /(^|\/)jsconfig.*\.json$/,
  /(^|\/)eslint\.config\.(js|mjs|cjs|ts)$/,
];

function isReviewableProtected(file) {
  return !EXECUTION_PROTECTED.some((pattern) => pattern.test(file));
}

async function publishIssueBranch(job, summary, options = {}) {
  const repo = job.repo || GITHUB_REPOSITORY;
  const branch = job.branch || `katalyst/issue-${job.issue_number || Date.now()}`;
  const draft = options.draft === true;
  const title = `${draft ? '[要確認] ' : ''}${sanitizeCommitText(job.title, 120)}`;
  const message = `fix: ${sanitizeCommitText(job.title, 120)}\n\nAutomated cloud agent work for ${job.issue_url || 'issue'}`;

  await run('git', ['checkout', '-B', branch], { cwd: REPO_DIR });
  await run('git', ['add', '-A'], { cwd: REPO_DIR });
  const commit = await run(
    'git',
    [
      '-c',
      'user.name=Densyakun',
      '-c',
      'user.email=densyakun1128@gmail.com',
      'commit',
      '-m',
      message,
    ],
    { cwd: REPO_DIR },
  );
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
  const warning = draft
    ? [
        '> [!WARNING]',
        '> 保護対象ファイルを含む変更のため、**下書きPR** として作成しています。',
        '> マージ前に管理者が変更内容を確認してください（自動マージはされません）。',
        '',
        ...(options.protectedFiles?.length
          ? ['変更した保護対象ファイル:', ...options.protectedFiles.map((file) => `- \`${file}\``), '']
          : []),
        ...(options.securityFlags?.length
          ? ['検出項目:', ...options.securityFlags.map((flag) => `- ${flag}`), '']
          : []),
      ].join('\n')
    : '';
  const body = [warning, safeSummary(summary), '', job.issue_url ? `Refs: ${job.issue_url}` : '']
    .filter(Boolean)
    .join('\n');

  const args = [
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
  ];
  if (draft) args.push('--draft');

  const pr = await run('gh', args, {
    cwd: REPO_DIR,
    env: { ...process.env, GH_TOKEN: GITHUB_API_TOKEN },
  });

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
    codespace_name: RUNNER_ID,
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
  if (!context?.cleanup || !context.root) return;
  const root = context.root;
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

async function reportStage(job, stage, usage) {
  const parsedStart = job.started_at ? Date.parse(job.started_at) : NaN;
  const startedAt = Number.isFinite(parsedStart) ? parsedStart : Date.now();
  console.log(`Job ${job.id}: stage=${stage}`);
  try {
    await api(
      '/api/cloud/agent/progress',
      {
        job_id: job.id,
        stage,
        usage: {
          runtime_seconds: Math.round((Date.now() - startedAt) / 1000),
          input_tokens: usage?.inputTokens || 0,
          output_tokens: usage?.outputTokens || 0,
          cost_usd: usage?.costUsd || 0,
        },
      },
      { attempts: 1, timeoutMs: 10000 },
    );
  } catch (error) {
    console.error('Progress report failed:', error);
  }
}

function resultDiagnostics(result) {
  const parts = [];
  if (result?.errors?.length) {
    parts.push(`AIエラー: ${result.errors.map((value) => safeDetail(value, 1000)).join(' / ')}`);
  }
  if (result?.stderrTail) {
    parts.push('', '--- 診断ログ（末尾） ---', safeDetail(result.stderrTail, 4000));
  }
  return parts.join('\n');
}

async function preflightOpencode(job, context) {
  const env = minimalEnv(context.home);
  const model = resolveModel(job);
  const asUser = job.kind === 'user_task' ? (job.sandbox_user || 'agent') : null;
  const result = asUser
    ? await runAsUser(asUser, 'opencode', ['models', '--pure'], {
        cwd: context.workspace,
        env,
        timeoutMs: 45000,
      })
    : await run('opencode', ['models', '--pure'], {
        cwd: context.workspace,
        env,
        timeoutMs: 45000,
      });
  if (result.timedOut) {
    throw new Error('opencode の起動がタイムアウトしました。ネットワークと認証設定を確認してください');
  }
  if (result.code !== 0) {
    throw new Error(`opencode を起動できませんでした: ${(result.stderr || result.stdout).trim().slice(0, 500)}`);
  }
  const models = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  if (models.length > 0 && !models.includes(model)) {
    throw new Error(`モデル ${model} が見つかりません。OPENCODE_GO_API_KEY を確認してください`);
  }
  return model;
}

async function processJob(job) {
  console.log(`Job ${job.id} (${job.kind}): ${job.title}`);
  const startedAt = Date.now();
  let context = null;
  const emptyUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let usage = emptyUsage;

  try {
  await reportStage(job, 'claimed', emptyUsage);

  if (job.kind === 'app_issue') {
    await reportStage(job, 'reset', emptyUsage);
    const reset = await resetRepoForJob();
    if (!reset.ok) {
      await reportJob(job, {
        status: 'failed',
        summary: '作業環境の初期化に失敗しました。',
        error: 'repo_reset_failed',
        usage: emptyUsage,
      });
      return;
    }
  }

  await reportStage(job, 'sandbox', emptyUsage);
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
      detail: safeDetail(message, 2000),
      usage: emptyUsage,
    });
    return;
  }

  let result;
  try {
    await preflightOpencode(job, context);
    result = await runOpencode(job, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('opencode failed:', message);
    await reportJob(job, {
      status: 'failed',
      summary: '作業を実行できませんでした。',
      error: 'opencode_failed',
      detail: safeDetail(message, 2000),
      usage: emptyUsage,
    });
    return;
  }

  usage = {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
  const text = sanitizeText(result.text).slice(0, 12000);
  const diagnostics = resultDiagnostics(result);

  if (result.stalled) {
    await reportJob(job, {
      status: 'failed',
      summary: 'AI から応答がないまま停止しました。',
      detail: [safeDetail(text), '', diagnostics].filter(Boolean).join('\n'),
      error: 'opencode_stalled',
      usage,
    });
    return;
  }

  if (result.timedOut) {
    await reportJob(job, {
      status: 'timed_out',
      summary: '実行時間の上限を超えました。',
      detail: [safeDetail(text), '', diagnostics].filter(Boolean).join('\n'),
      error: 'timeout',
      usage,
    });
    return;
  }

  if (result.exitCode !== 0) {
    await reportJob(job, {
      status: 'failed',
      summary: '作業を完了できませんでした。',
      detail: [safeDetail(text), '', diagnostics].filter(Boolean).join('\n'),
      error: `opencode exited with code ${result.exitCode}`,
      usage,
    });
    return;
  }

  if (result.errors.length > 0 && !text) {
    await reportJob(job, {
      status: 'failed',
      summary: 'AI の呼び出しに失敗しました。',
      detail: diagnostics,
      error: safeDetail(result.errors[0], 500),
      usage,
    });
    return;
  }

  if (job.kind === 'user_task') {
    const files = await listSandboxFiles(job.sandbox_user || 'agent', context.workspace).catch(() => []);
    const detail = [safeDetail(text), '', `ファイル: ${files.join(', ') || '(なし)'}`, diagnostics]
      .filter(Boolean)
      .join('\n');
    await reportJob(job, {
      status: 'succeeded',
      summary: safeSummary(text) || '完了しました',
      detail,
      usage,
    });
    return;
  }

  await reportStage(job, 'review', usage);
  const changes = await gitStatus();
  if (!changes) {
    const aiError = result.errors.length > 0 ? safeDetail(result.errors[0], 500) : '';
    await reportJob(job, {
      status: 'failed',
      summary: aiError ? 'AI の呼び出しに失敗しました。' : 'コードの変更はありませんでした。',
      detail: [safeDetail(text), '', diagnostics].filter(Boolean).join('\n'),
      error: aiError || 'no_changes',
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

  if (review.protectedHits.length > 0 && !review.protectedHits.every(isReviewableProtected)) {
    await reportJob(job, {
      status: 'blocked',
      summary: '実行設定に関わる保護対象ファイルの変更を検出したため停止しました。',
      detail: [
        'CI・依存関係・エージェント設定など、自動実行に影響するファイルのため push しません。',
        `変更ファイル: ${review.files.join(', ')}`,
        '',
        review.diffText.slice(0, 8000),
      ].join('\n'),
      error: 'protected_path_change',
      securityFlags: unique(reviewFlags),
      blockedStage: 'diff',
      keepCodespace: false,
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

  // 保護対象でも、実行設定に影響しないアプリ実装の変更は、管理者が GitHub で
  // 確認できるよう下書きPRとして公開する（自動マージはされない）。
  if (review.protectedHits.length > 0) {
    await reportStage(job, 'publish', usage);
    try {
      const published = await publishIssueBranch(job, text, {
        draft: true,
        protectedFiles: review.protectedHits,
        securityFlags: unique(reviewFlags),
      });
      await reportJob(job, {
        status: 'blocked',
        summary: '保護対象ファイルを含むため、確認用の下書きPRを作成しました。管理者が内容を確認してください。',
        detail: [
          `変更ファイル: ${review.files.join(', ')}`,
          `下書きPR: ${published.prUrl}`,
          '',
          'マージ前に、認可・入力検証・秘密情報の扱いを確認してください。',
          '',
          review.diffText.slice(0, 8000),
        ].join('\n'),
        prUrl: published.prUrl,
        branch: published.branch,
        error: 'protected_path_change',
        securityFlags: unique(reviewFlags),
        blockedStage: 'diff',
        keepCodespace: false,
        usage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reportJob(job, {
        status: 'blocked',
        summary: '保護対象ファイルの変更を検出し、確認用PRの作成にも失敗しました。',
        detail: [
          `変更ファイル: ${review.files.join(', ')}`,
          `PR作成エラー: ${message}`,
          '',
          review.diffText.slice(0, 8000),
        ].join('\n'),
        error: 'protected_path_change',
        securityFlags: unique(reviewFlags),
        blockedStage: 'diff',
        keepCodespace: false,
        usage,
      });
    }
    return;
  }

  try {
    await reportStage(job, 'publish', usage);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Job processing failed:', error);
    try {
      await reportJob(job, {
        status: 'failed',
        summary: '作業中に予期しないエラーが発生しました。',
        detail: safeDetail(message, 3000),
        error: 'runner_error',
        usage,
      });
    } catch (reportError) {
      console.error('Reporting runner error failed:', reportError);
    }
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

  // GitHub Actions では 1 実行 = 1 ジョブ。指定されたジョブだけを取得して終了する。
  if (JOB_ID) {
    if (!RUNNER_TOKEN) {
      await bootstrapRunner();
    }
    console.log(`Runner ${RUNNER_ID}: claiming job ${JOB_ID}`);
    const claimed = await api('/api/cloud/agent/claim', {
      job_id: JOB_ID,
      runner_id: RUNNER_ID,
    });
    if (!claimed.job) {
      console.log(`Job ${JOB_ID} is not claimable (${claimed.reason || 'unknown'})`);
      return;
    }
    await processJob(claimed.job);
    return;
  }

  let idleMinutes = 15;
  let idleSince = Date.now();
  let inactiveChecks = 0;
  let consecutiveApiFailures = 0;

  while (true) {
    let response;
    try {
      response = await api('/api/cloud/agent/next', { codespace_name: CODESPACE_NAME });
      consecutiveApiFailures = 0;
    } catch (error) {
      consecutiveApiFailures += 1;
      console.error(`Failed to get next job (attempt ${consecutiveApiFailures}):`, error);
      // 一時的な API 障害で即終了すると、Codespace だけが起動したまま
      // 実装が行われない。バックオフして再試行し、長期障害時だけ再起動する。
      if (consecutiveApiFailures >= 20) {
        console.error('Giving up after repeated API failures; restarting runner');
        process.exit(1);
      }
      await sleep(Math.min(60000, 3000 * consecutiveApiFailures));
      continue;
    }

    if (typeof response.runner_idle_minutes === 'number') {
      idleMinutes = response.runner_idle_minutes;
    }

    if (!response.job) {
      if (response.session_active === false) {
        // セッション行の反映遅れで誤って終了しないよう、しばらく猶予を持つ。
        inactiveChecks += 1;
        if (inactiveChecks >= 18) {
          console.log('Session is no longer active');
          break;
        }
        await sleep(10000);
        continue;
      }
      inactiveChecks = 0;
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
    try {
      await processJob(response.job);
    } catch (error) {
      console.error('Unexpected job processing failure:', error);
    }
    idleSince = Date.now();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
