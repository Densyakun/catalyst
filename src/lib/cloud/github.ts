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
