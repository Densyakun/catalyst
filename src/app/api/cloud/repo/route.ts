import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { parseRepo } from '@/lib/cloud/github';

const GITHUB_API = 'https://api.github.com';
const MAX_FILE_BYTES = 100_000;
const META_TTL_MS = 10 * 60 * 1000;

const branchCache = new Map<string, { at: number; branch: string | null }>();

function normalizePath(value: string | null): string | null {
  if (!value) return '';
  if (value.length > 400 || value.includes('\\') || value.includes('\0')) return null;
  const segments = value.split('/').filter(Boolean);
  if (segments.length > 50) return null;
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function encodeRef(ref: string): string {
  return ref.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function publicGitHub(path: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Katalyse-Mobile-Workspace',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
}

async function resolveBranch(repo: string, owner: string, name: string): Promise<string | null> {
  const key = repo.toLowerCase();
  const cached = branchCache.get(key);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.branch;

  const res = await publicGitHub(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  );
  if (!res.ok) {
    branchCache.set(key, { at: Date.now(), branch: null });
    return null;
  }
  const data = (await res.json()) as Record<string, unknown>;
  const branch = typeof data.default_branch === 'string' ? data.default_branch : null;
  branchCache.set(key, { at: Date.now(), branch });
  return branch;
}

function isSafeName(value: string): boolean {
  return value !== '.' && value !== '..' && !value.includes('..');
}

function githubErrorStatus(status: number): number {
  if (status === 404) return 404;
  if (status === 403) return 429;
  return 502;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repo = (req.nextUrl.searchParams.get('repo') || '').trim();
    const parsed = parseRepo(repo);
    if (!parsed || !isSafeName(parsed.owner) || !isSafeName(parsed.repo)) {
      return NextResponse.json({ error: 'owner/repo 形式で指定してください' }, { status: 400 });
    }

    const path = normalizePath(req.nextUrl.searchParams.get('path'));
    if (path === null) {
      return NextResponse.json({ error: 'パスが不正です' }, { status: 400 });
    }

    const requestedRef = (req.nextUrl.searchParams.get('ref') || '').trim();
    if (
      requestedRef.length > 200
      || /[\u0000-\u001f\u007f]/.test(requestedRef)
      || requestedRef.startsWith('/')
      || requestedRef.endsWith('/')
      || requestedRef.includes('..')
      || requestedRef.includes('//')
      || /[\\?#]/.test(requestedRef)
    ) {
      return NextResponse.json({ error: 'ブランチ名が不正です' }, { status: 400 });
    }

    const branch = requestedRef || await resolveBranch(repo, parsed.owner, parsed.repo);
    if (!branch) {
      return NextResponse.json(
        { error: '公開リポジトリが見つかりません。owner/repo とブランチ名を確認してください。' },
        { status: 404 },
      );
    }

    const suffix = path ? `/${encodePath(path)}` : '';
    const query = new URLSearchParams({ ref: branch }).toString();
    const res = await publicGitHub(
      `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents${suffix}?${query}`,
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: res.status === 403 ? 'GitHub の利用回数が上限に達しました。しばらく待って再試行してください。' : 'ファイルを読み込めませんでした。' },
        { status: githubErrorStatus(res.status) },
      );
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      const entries = (data as Array<Record<string, unknown>>)
        .map((item) => ({
          name: String(item.name || ''),
          path: String(item.path || ''),
          type: item.type === 'dir' ? 'dir' : item.type === 'file' ? 'file' : 'other',
          size: Number(item.size) || 0,
        }))
        .filter((item) => item.name && item.path)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name, 'ja');
        });

      return NextResponse.json({ type: 'dir', repo, ref: branch, path, entries });
    }

    const file = data as Record<string, unknown>;
    const size = Number(file.size) || 0;
    if (size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'ファイルが大きすぎるため表示できません（100KBまで）。' },
        { status: 413 },
      );
    }
    if (file.encoding !== 'base64' || typeof file.content !== 'string') {
      return NextResponse.json({ error: 'このファイルはテキストとして表示できません。' }, { status: 415 });
    }

    return NextResponse.json({
      type: 'file',
      repo,
      ref: branch,
      path,
      size,
      content: Buffer.from(file.content, 'base64').toString('utf8'),
      edit_url: `https://github.com/${repo}/edit/${encodeRef(branch)}/${encodePath(path)}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud repo browse error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
