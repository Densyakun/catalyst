const GITHUB_API = 'https://api.github.com';
const GITHUB_VERSION = '2022-11-28';

export class GitHubError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_VERSION,
    'User-Agent': 'Katalyse-Cloud',
    'Content-Type': 'application/json',
  };
}

async function githubFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GitHubError(res.status, `GitHub API ${res.status}: ${body.slice(0, 500)}`);
  }

  return res;
}

export function parseRepo(value: string): { owner: string; repo: string } | null {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value.trim());
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  default_branch: string;
  html_url: string;
}

export async function getRepo(token: string, repo: string): Promise<GitHubRepo> {
  const parsed = parseRepo(repo);
  if (!parsed) throw new Error('CLOUD_GITHUB_REPO は owner/repo 形式で指定してください');

  const res = await githubFetch(token, `/repos/${parsed.owner}/${parsed.repo}`);
  const data = await res.json();
  return {
    id: Number(data.id),
    full_name: String(data.full_name),
    default_branch: String(data.default_branch || 'main'),
    html_url: String(data.html_url || ''),
  };
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: string[];
}

export async function listOpenIssues(
  token: string,
  repo: string,
  options: { label?: string; limit?: number } = {},
): Promise<GitHubIssue[]> {
  const parsed = parseRepo(repo);
  if (!parsed) throw new Error('CLOUD_GITHUB_REPO は owner/repo 形式で指定してください');

  const params = new URLSearchParams({
    state: 'open',
    sort: 'created',
    direction: 'asc',
    per_page: String(Math.min(100, options.limit ?? 30)),
  });
  if (options.label) params.set('labels', options.label);

  const res = await githubFetch(
    token,
    `/repos/${parsed.owner}/${parsed.repo}/issues?${params.toString()}`,
  );
  const data = (await res.json()) as Array<Record<string, unknown>>;

  return data
    .filter((item) => !item.pull_request)
    .map((item) => ({
      number: Number(item.number),
      title: String(item.title || ''),
      body: typeof item.body === 'string' ? item.body : null,
      html_url: String(item.html_url || ''),
      labels: Array.isArray(item.labels)
        ? item.labels.map((label) =>
            typeof label === 'string'
              ? label
              : String((label as { name?: unknown }).name || ''),
          )
        : [],
    }));
}

export interface CreateCodespaceInput {
  repositoryId: number;
  ref?: string;
  machine: string;
  devcontainerPath: string;
  idleTimeoutMinutes: number;
  retentionPeriodMinutes: number;
  displayName: string;
}

export async function createCodespace(
  token: string,
  input: CreateCodespaceInput,
): Promise<{ name: string; webUrl: string; state: string }> {
  const body: Record<string, unknown> = {
    repository_id: input.repositoryId,
    machine: input.machine,
    devcontainer_path: input.devcontainerPath,
    idle_timeout_minutes: input.idleTimeoutMinutes,
    retention_period_minutes: input.retentionPeriodMinutes,
    display_name: input.displayName.slice(0, 60),
  };
  if (input.ref) body.ref = input.ref;

  const res = await githubFetch(token, '/user/codespaces', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return {
    name: String(data.name || ''),
    webUrl: String(data.web_url || ''),
    state: String(data.state || ''),
  };
}

export interface CodespaceInfo {
  name: string;
  state: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  devcontainerPath: string | null;
  machine: string | null;
  webUrl: string;
}

/**
 * Codespace の状態を取得する。
 * 起動に失敗した原因（ビルド失敗とランナー未接続）を切り分けるために使う。
 */
export async function getCodespace(token: string, name: string): Promise<CodespaceInfo | null> {
  if (!name) return null;
  try {
    const res = await githubFetch(token, `/user/codespaces/${encodeURIComponent(name)}`);
    const data = await res.json();
    return {
      name: String(data.name || name),
      state: String(data.state || ''),
      createdAt: data.created_at ? String(data.created_at) : null,
      lastUsedAt: data.last_used_at ? String(data.last_used_at) : null,
      devcontainerPath: data.devcontainer_path ? String(data.devcontainer_path) : null,
      machine: data.machine?.name ? String(data.machine.name) : null,
      webUrl: data.web_url ? String(data.web_url) : '',
    };
  } catch (error) {
    if (error instanceof GitHubError && [403, 404, 422].includes(error.status)) return null;
    throw error;
  }
}

export interface SecretNamesResult {
  names: string[] | null;
  error: number | null;
}

async function secretNames(
  token: string,
  path: string,
): Promise<SecretNamesResult> {
  try {
    const res = await githubFetch(token, path);
    const data = await res.json();
    const names = Array.isArray(data?.secrets)
      ? data.secrets.map((item: { name?: unknown }) => String(item?.name || '')).filter(Boolean)
      : [];
    return { names, error: null };
  } catch (error) {
    if (error instanceof GitHubError) return { names: null, error: error.status };
    throw error;
  }
}

/**
 * Codespaces に登録されているシークレット名を取得する（値は取得できない）。
 * ランナー起動に必要な設定が欠けていないかを確認するための診断用。
 */
export function listUserCodespaceSecrets(token: string): Promise<SecretNamesResult> {
  return secretNames(token, '/user/codespaces/secrets?per_page=100');
}

export function listRepoCodespaceSecrets(token: string, repo: string): Promise<SecretNamesResult> {
  const parsed = parseRepo(repo);
  if (!parsed) return Promise.resolve({ names: null, error: null });
  return secretNames(
    token,
    `/repos/${parsed.owner}/${parsed.repo}/codespaces/secrets?per_page=100`,
  );
}

/**
 * リポジトリで利用可能な devcontainer 設定を取得する。
 * 指定パスが GitHub に認識されているかを確認するための診断用。
 */
export async function listDevcontainerPaths(token: string, repo: string): Promise<string[] | null> {
  const parsed = parseRepo(repo);
  if (!parsed) return null;
  try {
    const res = await githubFetch(
      token,
      `/repos/${parsed.owner}/${parsed.repo}/codespaces/devcontainers?per_page=100`,
    );
    const data = await res.json();
    return Array.isArray(data?.devcontainers)
      ? data.devcontainers.map((item: { path?: unknown }) => String(item?.path || '')).filter(Boolean)
      : [];
  } catch (error) {
    if (error instanceof GitHubError) return null;
    throw error;
  }
}

export async function stopCodespace(token: string, name: string): Promise<void> {
  if (!name) return;
  try {
    await githubFetch(token, `/user/codespaces/${encodeURIComponent(name)}/stop`, {
      method: 'POST',
    });
  } catch (error) {
    if (error instanceof GitHubError && [404, 422].includes(error.status)) return;
    throw error;
  }
}
