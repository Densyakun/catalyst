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
    autoRetryCooldownMinutes: Math.max(0, Math.floor(numberValue(process.env.CLOUD_AUTO_RETRY_COOLDOWN_MINUTES, 45))),
    // 同じ Issue を無制限に再実行すると、実装できない課題のたびに Codespace が
    // 起動し続けるため、失敗回数の上限に達したら自動実行を打ち切る。
    autoMaxAttempts: Math.max(1, Math.floor(numberValue(process.env.CLOUD_AUTO_MAX_ATTEMPTS, 2))),
    // 実装に進めない Issue を最初から拾わないためのラベル除外リスト。
    autoSkipLabels: text(
      process.env.CLOUD_AUTO_SKIP_LABELS,
      'wontfix,duplicate,question,discussion,invalid,stale',
    )
      .split(',')
      .map((label) => label.trim().toLowerCase())
      .filter(Boolean),
    maxConcurrent: Math.max(1, Math.floor(numberValue(process.env.CLOUD_MAX_CONCURRENT, 1))),
    // 実行基盤。'actions' は GitHub Actions（パブリックリポジトリは無料）、
    // 'codespaces' は従来の Codespace、'auto' は Actions を優先して失敗時のみ Codespace。
    executionBackend: (() => {
      const value = text(process.env.CLOUD_EXECUTION_BACKEND, 'actions').toLowerCase();
      return value === 'codespaces' || value === 'auto' ? value : 'actions';
    })(),
    actionsEventType: text(process.env.CLOUD_ACTIONS_EVENT_TYPE, 'katalyst-cloud-job'),
    actionsRunnerIdPrefix: 'actions-',
    machine: text(process.env.CLOUD_CODESPACE_MACHINE, DEFAULT_MACHINE),
    devcontainerPath: text(process.env.CLOUD_DEVCONTAINER_PATH, DEFAULT_DEVCONTAINER),
    ref: text(process.env.CLOUD_GITHUB_REF),
    idleMinutes: Math.max(5, Math.floor(numberValue(process.env.CLOUD_CODESPACE_IDLE_MINUTES, 60))),
    retentionMinutes: Math.max(0, Math.floor(numberValue(process.env.CLOUD_CODESPACE_RETENTION_MINUTES, 60))),
    runnerIdleMinutes: Math.max(1, Math.floor(numberValue(process.env.CLOUD_RUNNER_IDLE_MINUTES, 15))),
    // Codespace 作成後、ランナーが一度もジョブを取得しないまま経過したら
    // 「起動失敗」として停止する。放置すると次の tick でまた作成され続ける。
    runnerStartTimeoutMinutes: Math.max(3, Math.floor(numberValue(process.env.CLOUD_RUNNER_START_TIMEOUT_MINUTES, 15))),
    // 直近1時間に起動失敗が続いた場合は Codespace の新規作成を止める。
    maxStartFailuresPerHour: Math.max(1, Math.floor(numberValue(process.env.CLOUD_MAX_START_FAILURES_PER_HOUR, 2))),
    keepReviewCodespace: boolValue(process.env.CLOUD_KEEP_REVIEW_CODESPACE, false),
    jobMaxMinutes: Math.max(5, Math.floor(numberValue(process.env.CLOUD_JOB_MAX_MINUTES, 30))),
    jobStallMinutes: Math.max(2, Math.floor(numberValue(process.env.CLOUD_JOB_STALL_MINUTES, 8))),
    jobTimeoutGraceMinutes: Math.max(1, Math.floor(numberValue(process.env.CLOUD_JOB_TIMEOUT_GRACE_MINUTES, 5))),
    // 安全検査（秘密情報・保護対象・差分サイズ・型チェック）を通過した変更は
    // PR として公開する。マージは人間が行う。
    autoPush: boolValue(process.env.CLOUD_AUTO_PUSH, true),
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
