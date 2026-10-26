const DEFAULT_MODEL = 'opencode-go/deepseek-v4.1-flash';
const DEFAULT_MACHINE = 'standardLinux32gb';
const DEFAULT_DEVCONTAINER = '.devcontainer/cloud-agent/devcontainer.json';

function text(value: string | undefined, fallback = ''): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function numberValue(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boolValue(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function getCloudConfig() {
  const repo = text(process.env.CLOUD_GITHUB_REPO);
  const githubToken = text(process.env.GITHUB_CODESPACES_TOKEN) || text(process.env.GITHUB_TOKEN);
  const cronSecret = text(process.env.CLOUD_CRON_SECRET);
  const runnerToken = text(process.env.CLOUD_RUNNER_TOKEN);

  return {
    repo,
    githubToken,
    cronSecret,
    runnerToken,
    appUrl: text(process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000').replace(/\/+$/, ''),
    autoEnabled: boolValue(process.env.CLOUD_AUTO_ENABLED, Boolean(repo && githubToken)),
    issueLabel: text(process.env.CLOUD_AUTO_ISSUE_LABEL),
    maxIssuesPerTick: Math.max(1, Math.floor(numberValue(process.env.CLOUD_AUTO_MAX_ISSUES, 4))),
    autoDailyLimit: Math.max(1, Math.floor(numberValue(process.env.CLOUD_AUTO_DAILY_LIMIT, 4))),
    maxConcurrent: Math.max(1, Math.floor(numberValue(process.env.CLOUD_MAX_CONCURRENT, 1))),
    machine: text(process.env.CLOUD_CODESPACE_MACHINE, DEFAULT_MACHINE),
    devcontainerPath: text(process.env.CLOUD_DEVCONTAINER_PATH, DEFAULT_DEVCONTAINER),
    ref: text(process.env.CLOUD_GITHUB_REF),
    idleMinutes: Math.max(5, Math.floor(numberValue(process.env.CLOUD_CODESPACE_IDLE_MINUTES, 60))),
    retentionMinutes: Math.max(0, Math.floor(numberValue(process.env.CLOUD_CODESPACE_RETENTION_MINUTES, 60))),
    runnerIdleMinutes: Math.max(1, Math.floor(numberValue(process.env.CLOUD_RUNNER_IDLE_MINUTES, 15))),
    keepReviewCodespace: boolValue(process.env.CLOUD_KEEP_REVIEW_CODESPACE, false),
    jobMaxMinutes: Math.max(5, Math.floor(numberValue(process.env.CLOUD_JOB_MAX_MINUTES, 30))),
    autoPush: boolValue(process.env.CLOUD_AUTO_PUSH, false),
    maxDiffLines: Math.max(50, Math.floor(numberValue(process.env.CLOUD_MAX_DIFF_LINES, 1500))),
    sandboxUser: text(process.env.CLOUD_SANDBOX_USER, 'agent'),
    model: text(process.env.OPENCODE_MODEL, DEFAULT_MODEL),
    creditPerMinute: numberValue(process.env.CLOUD_CREDIT_PER_MINUTE, 0.5),
    creditPer1kTokens: numberValue(process.env.CLOUD_CREDIT_PER_1K_TOKENS, 0.05),
    creditPerUsd: numberValue(process.env.CLOUD_CREDIT_PER_USD, 150),
    creditMarkup: numberValue(process.env.CLOUD_CREDIT_MARKUP, 1),
    estimateCredits: Math.max(1, numberValue(process.env.CLOUD_ESTIMATE_CREDITS, 20)),
    dailyLimit: Math.max(1, Math.floor(numberValue(process.env.CLOUD_USER_DAILY_LIMIT, 3))),
    autoUsePool: boolValue(process.env.CLOUD_AUTO_USE_POOL, false),
  };
}

export function isCloudConfigured(): boolean {
  const config = getCloudConfig();
  return Boolean(config.githubToken && config.repo && config.runnerToken && config.cronSecret);
}
