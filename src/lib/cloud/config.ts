const DEFAULT_MODEL = 'opencode-go/deepseek-v4.1-flash';

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
  // 旧名 GITHUB_CODESPACES_TOKEN も後方互換のため読み続ける。
  const githubToken = text(process.env.CLOUD_GITHUB_TOKEN)
    || text(process.env.GITHUB_CODESPACES_TOKEN)
    || text(process.env.GITHUB_TOKEN);
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
    // 同じ Issue を無制限に再実行すると、実装できない課題のたびに
    // 実行時間を消費し続けるため、失敗回数の上限に達したら自動実行を打ち切る。
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
    actionsEventType: text(process.env.CLOUD_ACTIONS_EVENT_TYPE, 'katalyst-cloud-job'),
    // ランナーが一度もジョブを取得しないまま経過したら「起動失敗」として止める。
    // 放置すると次の tick でも同じジョブを割り当て続ける。
    runnerStartTimeoutMinutes: Math.max(3, Math.floor(numberValue(process.env.CLOUD_RUNNER_START_TIMEOUT_MINUTES, 15))),
    jobMaxMinutes: Math.max(5, Math.floor(numberValue(process.env.CLOUD_JOB_MAX_MINUTES, 30))),
    jobStallMinutes: Math.max(2, Math.floor(numberValue(process.env.CLOUD_JOB_STALL_MINUTES, 8))),
    jobTimeoutGraceMinutes: Math.max(1, Math.floor(numberValue(process.env.CLOUD_JOB_TIMEOUT_GRACE_MINUTES, 5))),
    // 安全検査（秘密情報・保護対象・差分サイズ・型チェック）を通過した変更は
    // PR として公開する。マージは人間が行う。
    autoPush: boolValue(process.env.CLOUD_AUTO_PUSH, true),
    maxDiffLines: Math.max(50, Math.floor(numberValue(process.env.CLOUD_MAX_DIFF_LINES, 1500))),
    sandboxUser: text(process.env.CLOUD_SANDBOX_USER, 'agent'),
    model: text(process.env.OPENCODE_MODEL, DEFAULT_MODEL),
    // クラウドランナーが独自プロバイダを使う場合の参考単価（USD / 1M tokens）。
    // 0 のままなら opencode が返すコスト（不明なら 0）を使う。
    llmInputCostPer1M: numberValue(process.env.KATALYST_LLM_INPUT_COST_PER_1M, 0),
    llmOutputCostPer1M: numberValue(process.env.KATALYST_LLM_OUTPUT_COST_PER_1M, 0),
    creditPerMinute: numberValue(process.env.CLOUD_CREDIT_PER_MINUTE, 0.5),
    creditPer1kTokens: numberValue(process.env.CLOUD_CREDIT_PER_1K_TOKENS, 0.05),
    creditPerUsd: numberValue(process.env.CLOUD_CREDIT_PER_USD, 150),
    creditMarkup: numberValue(process.env.CLOUD_CREDIT_MARKUP, 1),
    // プレビュー環境・失敗した実行・Stripe 手数料など、DB に記録できない
    // 運営コストをクレジット請求に上乗せするための係数（%）。
    creditOverheadPercent: numberValue(process.env.CLOUD_CREDIT_OVERHEAD_PERCENT, 0),
    estimateCredits: Math.max(1, numberValue(process.env.CLOUD_ESTIMATE_CREDITS, 20)),
    dailyLimit: Math.max(1, Math.floor(numberValue(process.env.CLOUD_USER_DAILY_LIMIT, 3))),
    autoUsePool: boolValue(process.env.CLOUD_AUTO_USE_POOL, false),
  };
}

export function isCloudConfigured(): boolean {
  const config = getCloudConfig();
  return Boolean(config.githubToken && config.repo && config.runnerToken && config.cronSecret);
}
