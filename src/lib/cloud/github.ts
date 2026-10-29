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

export interface ActionVariable {
  name: string;
  value: string;
}

export async function listRepoActionVariables(
  token: string,
  repo: string,
): Promise<ActionVariable[] | null> {
  const parsed = parseRepo(repo);
  if (!parsed) return null;
  try {
    const res = await githubFetch(
      token,
      `/repos/${parsed.owner}/${parsed.repo}/actions/variables?per_page=100`,
    );
    const data = await res.json();
    return Array.isArray(data?.variables)
      ? data.variables.map((item: { name?: unknown; value?: unknown }) => ({
          name: String(item?.name || ''),
          value: String(item?.value || ''),
        }))
      : [];
  } catch (error) {
    if (error instanceof GitHubError) return null;
    throw error;
  }
}

/**
 * Actions のリポジトリ変数を作成・更新する。
 * 変数は秘密情報ではないため暗号化不要（アプリのURLなどに使う）。
 */
export async function putRepoActionVariable(
  token: string,
  repo: string,
  name: string,
  value: string,
): Promise<void> {
  const parsed = parseRepo(repo);
  if (!parsed) throw new Error('CLOUD_GITHUB_REPO は owner/repo 形式で指定してください');
  const base = `/repos/${parsed.owner}/${parsed.repo}/actions/variables`;

  try {
    await githubFetch(token, `${base}/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, value }),
    });
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
    await githubFetch(token, base, {
      method: 'POST',
      body: JSON.stringify({ name, value }),
    });
  }
}

/**
 * リポジトリの Actions ワークフローを repository_dispatch で起動する。
 */
export async function dispatchRepoEvent(
  token: string,
  repo: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const parsed = parseRepo(repo);
  if (!parsed) throw new Error('CLOUD_GITHUB_REPO は owner/repo 形式で指定してください');
  await githubFetch(token, `/repos/${parsed.owner}/${parsed.repo}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  });
}

export interface RepoWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

export async function listRepoWorkflows(token: string, repo: string): Promise<RepoWorkflow[] | null> {
  const parsed = parseRepo(repo);
  if (!parsed) return null;
  try {
    const res = await githubFetch(
      token,
      `/repos/${parsed.owner}/${parsed.repo}/actions/workflows?per_page=100`,
    );
    const data = await res.json();
    return Array.isArray(data?.workflows)
      ? data.workflows.map((item: Record<string, unknown>) => ({
          id: Number(item.id),
          name: String(item.name || ''),
          path: String(item.path || ''),
          state: String(item.state || ''),
        }))
      : [];
  } catch (error) {
    if (error instanceof GitHubError) return null;
    throw error;
  }
}

export interface WorkflowRunInfo {
  id: number;
  status: string;
  event: string;
  path: string;
  headBranch: string;
  createdAt: string | null;
}

export async function getWorkflowRun(
  token: string,
  repo: string,
  runId: string,
): Promise<WorkflowRunInfo | null> {
  const parsed = parseRepo(repo);
  if (!parsed) return null;
  if (!/^\d+$/.test(runId)) return null;
  try {
    const res = await githubFetch(
      token,
      `/repos/${parsed.owner}/${parsed.repo}/actions/runs/${encodeURIComponent(runId)}`,
    );
    const data = await res.json();
    return {
      id: Number(data.id),
      status: String(data.status || ''),
      event: String(data.event || ''),
      path: String(data.path || ''),
      headBranch: String(data.head_branch || ''),
      createdAt: data.created_at ? String(data.created_at) : null,
    };
  } catch (error) {
    if (error instanceof GitHubError) return null;
    throw error;
  }
}
