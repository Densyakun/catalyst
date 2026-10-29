'use client';

import { useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface RepoEntry {
  name: string;
  path: string;
  type: 'dir' | 'file' | 'other';
  size: number;
}

interface RepoView {
  type: 'dir' | 'file';
  repo: string;
  ref: string;
  path: string;
  entries?: RepoEntry[];
  content?: string;
  size?: number;
  edit_url?: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function MobileWorkspace() {
  const [repo, setRepo] = useState('');
  const [ref, setRef] = useState('');
  const [path, setPath] = useState('');
  const [view, setView] = useState<RepoView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const open = async (nextRepo = repo, nextPath = path, nextRef = ref) => {
    const target = nextRepo.trim();
    if (!target || loading) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ repo: target, path: nextPath });
      if (nextRef.trim()) params.set('ref', nextRef.trim());
      const res = await fetch(`/api/cloud/repo?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
      const next = json as RepoView;
      setView(next);
      setRepo(next.repo);
      setRef(next.ref);
      setPath(next.path);
    } catch (err) {
      setView(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const segments = view?.path ? view.path.split('/') : [];

  return (
    <div className="glass-panel" style={{ padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
        <ShieldCheck size={14} className="text-accent" />
        <h3 style={{ fontSize: '0.88rem', margin: 0 }}>スマホ作業スペース（公開リポジトリ）</h3>
        <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          読み取り専用 / 要ログイン
        </span>
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        公開リポジトリを閲覧し、GitHub の編集画面から小さな変更を PR として提案できます。
        編集権限は GitHub 側で確認されます。Katalyse はリポジトリの内容を保存しません。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.4rem' }}>
        <input
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          placeholder="owner/repo（例: Densyakun/catalyst）"
          maxLength={200}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => {
            setPath('');
            setRef('');
            void open(repo, '', '');
          }}
          disabled={!repo.trim() || loading}
          className="btn-primary"
          style={{ padding: '0.5rem 0.8rem', fontSize: '0.75rem', opacity: !repo.trim() || loading ? 0.6 : 1 }}
        >
          {loading ? <Loader2 className="animate-spin" size={13} /> : '開く'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.4rem' }}>
        <input
          value={ref}
          onChange={(event) => setRef(event.target.value)}
          placeholder="ブランチ（空なら既定ブランチ）"
          maxLength={200}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => void open()}
          disabled={!repo.trim() || loading}
          title="再読み込み"
          style={{ ...secondaryButtonStyle, padding: '0.5rem 0.7rem' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {error && (
        <p style={{ fontSize: '0.72rem', color: '#f87171', overflowWrap: 'anywhere' }}>{error}</p>
      )}

      {view && (
        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.15rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void open(repo, '')} style={crumbStyle}>
            {view.repo}
          </button>
          {segments.map((segment, index) => {
            const nextPath = segments.slice(0, index + 1).join('/');
            return (
              <span key={nextPath} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                <ChevronRight size={10} />
                <button type="button" onClick={() => void open(repo, nextPath)} style={crumbStyle}>
                  {segment}
                </button>
              </span>
            );
          })}
          <span style={{ marginLeft: '0.3rem' }}>@{view.ref}</span>
        </div>
      )}

      {view?.type === 'dir' && (
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          {(view.entries || []).length === 0 && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>ファイルがありません。</p>
          )}
          {(view.entries || []).map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => void open(repo, entry.path)}
              style={entryStyle}
            >
              {entry.type === 'dir' ? <Folder size={14} className="text-accent" /> : <FileText size={14} />}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {entry.name}
              </span>
              {entry.type === 'file' && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{formatSize(entry.size)}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {view?.type === 'file' && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{formatSize(view.size || 0)}</span>
            {view.edit_url && (
              <a
                href={view.edit_url}
                target="_blank"
                rel="noreferrer"
                style={{ ...linkStyle, marginLeft: 'auto' }}
              >
                <ExternalLink size={12} /> GitHub で小編集して PR
              </a>
            )}
          </div>
          <pre
            style={{
              margin: 0,
              padding: '0.55rem',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              fontSize: '0.68rem',
              lineHeight: 1.5,
              overflow: 'auto',
              maxHeight: '55vh',
            }}
          >
            {view.content}
          </pre>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.6rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  color: 'white',
  fontFamily: 'inherit',
  fontSize: '0.78rem',
};

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  color: 'white',
  cursor: 'pointer',
};

const entryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  width: '100%',
  padding: '0.45rem 0.55rem',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  color: 'white',
  fontSize: '0.76rem',
  cursor: 'pointer',
};

const crumbStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--accent-color)',
  fontSize: '0.68rem',
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.2rem',
  fontSize: '0.7rem',
  color: 'var(--accent-color)',
};
