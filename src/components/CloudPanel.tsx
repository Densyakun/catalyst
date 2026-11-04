'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cloud,
  Coins,
  ExternalLink,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { CloudJob, CloudJobStatus, CloudOverview } from '@/lib/types/cloud';

const ACTIVE_STATUSES: CloudJobStatus[] = ['queued', 'provisioning', 'running', 'blocked'];

function isActiveJob(job: CloudJob): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

function jobIssueKey(job: CloudJob): string {
  if (job.kind === 'app_issue') {
    if (job.repo && job.issue_number != null) return `${job.repo}#${job.issue_number}`;
    if (job.issue_url) return `url:${job.issue_url}`;
    if (job.issue_number != null) return `issue:${job.issue_number}`;
  }
  return `job:${job.id}`;
}

function stripIssuePrefix(title: string): string {
  return title.replace(/^\[#\d+\]\s*/, '').trim() || title;
}

interface CloudJobGroup {
  key: string;
  issueNumber: number | null;
  issueUrl: string | null;
  repo: string | null;
  title: string;
  jobs: CloudJob[];
  latestAt: string;
  status: CloudJobStatus;
  hasActive: boolean;
}

function groupCloudJobsByIssue(jobs: CloudJob[]): CloudJobGroup[] {
  const map = new Map<string, CloudJob[]>();
  for (const job of jobs) {
    const key = jobIssueKey(job);
    const list = map.get(key);
    if (list) list.push(job);
    else map.set(key, [job]);
  }

  const groups: CloudJobGroup[] = [];
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sorted[0];
    const active = sorted.filter(isActiveJob);
    const status = active.length > 0 ? active[0].status : latest.status;
    groups.push({
      key,
      issueNumber: latest.issue_number,
      issueUrl: latest.issue_url,
      repo: latest.repo,
      title: latest.kind === 'app_issue' ? stripIssuePrefix(latest.title) : latest.title,
      jobs: sorted,
      latestAt: latest.created_at,
      status,
      hasActive: active.length > 0,
    });
  }

  return groups.sort((a, b) => {
    if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
  });
}

const STATUS_META: Record<CloudJobStatus, { label: string; color: string; bg: string }> = {
  queued: { label: '待機中', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  provisioning: { label: '準備中', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  running: { label: '実行中', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  succeeded: { label: '完了', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)' },
  failed: { label: '失敗', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
  blocked: { label: '安全確認待ち', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  cancelled: { label: 'キャンセル', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
  timed_out: { label: '時間切れ', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
};

const STAGE_LABELS: Record<string, string> = {
  claimed: '受付',
  reset: 'リポジトリ準備',
  sandbox: '作業環境の準備',
  agent: 'AIが実装中',
  review: '変更を検証中',
  publish: '公開準備中',
  done: '完了',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`;
}

export default function CloudPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<CloudOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'history' | 'issue'>('history');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cloud/overview');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
      setData(json as CloudOverview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [load, refreshKey]);

  const activeJob = useMemo(
    () => data?.jobs.find((job) => ['queued', 'provisioning', 'running', 'blocked'].includes(job.status)) ?? null,
    [data],
  );

  const groups = useMemo(() => groupCloudJobsByIssue(data?.jobs ?? []), [data]);

  const submit = async () => {
    if (!title.trim() || !prompt.trim() || submitting) return;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch('/api/cloud/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '依頼の登録に失敗しました');
      setTitle('');
      setPrompt('');
      setMessage('依頼を受け付けました。順番に実行します。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (job: CloudJob) => {
    if (cancelling) return;
    setCancelling(job.id);
    try {
      const res = await fetch(`/api/cloud/jobs/${job.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'キャンセルできませんでした');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCancelling(null);
    }
  };

  const retry = async (job: CloudJob) => {
    if (retrying) return;
    setRetrying(job.id);
    setMessage('');
    try {
      const res = await fetch(`/api/cloud/jobs/${job.id}/retry`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '再実行できませんでした');
      setMessage('再実行を受け付けました。順番に実行します。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRetrying(null);
    }
  };

  const startNow = async (job: CloudJob) => {
    if (starting) return;
    setStarting(job.id);
    setMessage('');
    try {
      const res = await fetch(`/api/cloud/jobs/${job.id}/start`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '実行を開始できませんでした');
      setMessage('実行を開始しました。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(null);
    }
  };

  const decide = async (job: CloudJob, action: 'approve' | 'reject') => {
    if (deciding) return;
    setDeciding(job.id);
    setMessage('');
    try {
      const res = await fetch(`/api/cloud/jobs/${job.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '操作に失敗しました');
      if (action === 'reject') {
        setMessage('却下しました。');
      } else if (json.started) {
        setMessage('実行を開始しました。');
      } else {
        setMessage(`実行待ちに登録しました${json.dispatch_error ? `（${json.dispatch_error}）` : '。順番に実行します。'}`);
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDeciding(null);
    }
  };

  const renderJobs = (jobs: CloudJob[], compact = false) => (
    <div style={{ display: 'grid', gap: '0.45rem' }}>
      {jobs.map((job) => (
        <JobRow
          key={job.id}
          job={job}
          compact={compact}
          isAdmin={Boolean(data?.is_admin)}
          cancelling={cancelling === job.id}
          deciding={deciding === job.id}
          retrying={retrying === job.id}
          starting={starting === job.id}
          onCancel={() => void cancel(job)}
          onDecide={(action) => void decide(job, action)}
          onRetry={() => void retry(job)}
          onStart={() => void startNow(job)}
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <Loader2 className="animate-spin" size={16} /> クラウド作業を確認しています...
      </div>
    );
  }

  const remaining = data ? Math.max(0, data.daily_limit - data.daily_used) : 0;

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', display: 'grid', gap: '0.8rem' }}>
      <section style={{ padding: '0.2rem 0.1rem' }}>
        <h2 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.7rem)', margin: '0.1rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Cloud size={20} className="text-accent" /> クラウド作業
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          AIエージェントがクラウド作業環境で依頼を実行します。一般ユーザーの依頼は、アプリ本体のコードや秘密情報にアクセスできない隔離環境で実行されます。
          かかった時間とトークン使用量に応じてクレジットを消費します。
        </p>
      </section>

      {message && (
        <div className="glass-panel" style={{ padding: '0.6rem 0.8rem', fontSize: '0.78rem', border: '1px solid var(--glass-border)' }}>
          {message}
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
          <div className="glass-panel" style={{ padding: '0.7rem' }}>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>利用できるクレジット</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Coins size={15} className="text-accent" /> {data.user_balance.toFixed(1)}
            </p>
          </div>
          <div className="glass-panel" style={{ padding: '0.7rem' }}>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>1回あたりの目安</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>{data.estimated_credits.toFixed(1)}</p>
          </div>
          <div className="glass-panel" style={{ padding: '0.7rem' }}>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>今日の残り回数</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>{remaining} / {data.daily_limit}</p>
          </div>
        </div>
      )}

      {data && !data.available && (
        <div className="glass-panel" style={{ padding: '0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {data.message}
        </div>
      )}

      {data?.is_admin && (
        <div className="glass-panel" style={{ padding: '0.8rem', display: 'grid', gap: '0.35rem' }}>
          <h3 style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={14} className="text-accent" /> アプリ改善の自動実行
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {data.auto_enabled ? '有効' : '無効'}
            {data.auto_repo ? ` / 対象: ${data.auto_repo}` : ''}
            {` / 同時実行: ${data.max_concurrent}`}
            {` / 自動PR: ${data.auto_push ? '有効（安全検査後にPRを作成）' : '無効（承認待ち）'}`}
          </p>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
            10分おきにアプリの課題を確認します。危険な指示・秘密情報・保護対象ファイルの変更を検出した場合は自動実行を停止します。
          </p>
        </div>
      )}

      {data?.available && (
        <div className="glass-panel" style={{ padding: '0.9rem' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <SparklesIcon /> クラウドに依頼する
          </h3>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            調査、文章作成、データ整理など、PCを離れている間に進めたい作業を書いてください。
            外部ネットワーク・シェル実行・秘密情報へのアクセスは許可されません。秘密情報らしき文字列は自動的に伏せられます。
            {activeJob && ' 実行中の作業が終わると次に進みます。'}
          </p>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="タイトル（例: 新機能の設計メモを作る）"
              maxLength={120}
              style={inputStyle}
            />
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="依頼内容（例: このアプリの課題タブを改善する案を3つ、根拠付きで出して）"
              rows={5}
              maxLength={8000}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            {data.user_balance < data.estimated_credits && (
              <p style={{ fontSize: '0.65rem', color: '#f59e0b' }}>
                残高が目安を下回っています。実行はできますが、利用分は残高の範囲で消費されます。
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                目安 {data.estimated_credits.toFixed(1)} クレジット。時間と使用量に応じて精算します。
              </span>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!title.trim() || !prompt.trim() || submitting}
                className="btn-primary"
                style={{
                  padding: '0.5rem 0.9rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  opacity: !title.trim() || !prompt.trim() || submitting ? 0.6 : 1,
                }}
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                {submitting ? '登録中...' : '依頼する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {data && data.jobs.length > 0 && (
        <div className="glass-panel" style={{ padding: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.85rem', margin: 0 }}>最近の作業</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <button
                type="button"
                onClick={() => setView('history')}
                style={viewButtonStyle(view === 'history')}
                aria-pressed={view === 'history'}
              >
                <Clock3 size={12} /> 履歴
              </button>
              <button
                type="button"
                onClick={() => setView('issue')}
                style={viewButtonStyle(view === 'issue')}
                aria-pressed={view === 'issue'}
              >
                <Layers size={12} /> イシューごと
              </button>
              <button
                type="button"
                onClick={() => void load()}
                title="再読み込み"
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '0.1rem', display: 'flex', marginLeft: '0.2rem' }}
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {view === 'history' ? (
            renderJobs(data.jobs)
          ) : (
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {groups.map((group) => (
                <IssueGroup
                  key={group.key}
                  group={group}
                  isAdmin={data.is_admin}
                  cancelling={cancelling}
                  retrying={retrying}
                  starting={starting}
                  onCancel={(job) => void cancel(job)}
                  onRetry={(job) => void retry(job)}
                  onStart={(job) => void startNow(job)}
                  renderJobs={(jobs) => renderJobs(jobs, true)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueGroup({
  group,
  isAdmin,
  cancelling,
  retrying,
  starting,
  onCancel,
  onRetry,
  onStart,
  renderJobs,
}: {
  group: CloudJobGroup;
  isAdmin: boolean;
  cancelling: string | null;
  retrying: string | null;
  starting: string | null;
  onCancel: (job: CloudJob) => void;
  onRetry: (job: CloudJob) => void;
  onStart: (job: CloudJob) => void;
  renderJobs: (jobs: CloudJob[]) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(group.hasActive);
  const meta = STATUS_META[group.status] ?? STATUS_META.failed;
  const activeJob = group.jobs.find(isActiveJob) ?? null;
  const queuedJob = group.jobs.find((job) => job.status === 'queued') ?? null;
  const retryJob = group.jobs.find((job) => ['failed', 'cancelled', 'timed_out'].includes(job.status)) ?? null;
  const canRetry = !activeJob && retryJob !== null;
  const isAppIssue = group.jobs.some((job) => job.kind === 'app_issue');

  return (
    <div style={{ border: '1px solid var(--glass-border)', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.7rem 0.15rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            flex: 1,
            minWidth: 'min(200px, 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: 0,
            background: 'none',
            border: 'none',
            color: 'white',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Layers size={13} style={{ color: meta.color, flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {group.issueNumber != null ? `#${group.issueNumber} ` : ''}
            {group.title}
          </span>
          {isAppIssue && isAdmin && (
            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', flexShrink: 0 }}>アプリ改善</span>
          )}
          {group.jobs.length > 1 && (
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{group.jobs.length}件</span>
          )}
          <span style={{ fontSize: '0.62rem', padding: '0.08rem 0.4rem', borderRadius: '999px', color: meta.color, background: meta.bg, flexShrink: 0 }}>
            {meta.label}
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexShrink: 0 }}>
          {group.issueUrl && (
            <a href={group.issueUrl} target="_blank" rel="noreferrer" style={linkStyle}>
              <ExternalLink size={11} /> 課題
            </a>
          )}
          {isAdmin && queuedJob && (
            <button
              type="button"
              onClick={() => onStart(queuedJob)}
              disabled={starting === queuedJob.id}
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}
            >
              <Play size={11} className={starting === queuedJob.id ? 'animate-pulse' : undefined} />
              {starting === queuedJob.id ? '開始中...' : '今すぐ実行'}
            </button>
          )}
          {activeJob && (
            <button
              type="button"
              onClick={() => onCancel(activeJob)}
              disabled={cancelling === activeJob.id}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: 0, cursor: 'pointer' }}
            >
              {cancelling === activeJob.id ? '停止中...' : 'キャンセル'}
            </button>
          )}
          {canRetry && retryJob && (
            <button
              type="button"
              onClick={() => onRetry(retryJob)}
              disabled={retrying === retryJob.id}
              title="もう一度実行します"
              style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}
            >
              <RefreshCw size={11} className={retrying === retryJob.id ? 'animate-spin' : undefined} />
              {retrying === retryJob.id ? '受付中...' : '再実行'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0 0.7rem 0.5rem 2.15rem', fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
        {group.repo && <span>{group.repo}</span>}
        <span>最終更新 {formatDate(group.latestAt)}</span>
      </div>

      {expanded && <div style={{ padding: '0 0.7rem 0.7rem' }}>{renderJobs(group.jobs)}</div>}
    </div>
  );
}

function JobRow({
  job,
  compact = false,
  isAdmin,
  cancelling,
  deciding,
  retrying,
  starting,
  onCancel,
  onDecide,
  onRetry,
  onStart,
}: {
  job: CloudJob;
  compact?: boolean;
  isAdmin: boolean;
  cancelling: boolean;
  deciding: boolean;
  retrying: boolean;
  starting: boolean;
  onCancel: () => void;
  onDecide: (action: 'approve' | 'reject') => void;
  onRetry: () => void;
  onStart: () => void;
}) {
  const meta = STATUS_META[job.status] ?? STATUS_META.failed;
  const active = ['queued', 'provisioning', 'running', 'blocked'].includes(job.status);
  const canRetry = ['failed', 'cancelled', 'timed_out'].includes(job.status);
  const canReview = isAdmin && job.status === 'blocked' && job.blocked_stage === 'precheck';
  const retryExhausted = canReview && job.retry_exhausted === true;
  const Icon = job.status === 'succeeded'
    ? CheckCircle2
    : job.status === 'failed'
      ? XCircle
      : job.status === 'blocked'
        ? ShieldCheck
        : active
          ? Clock3
          : Play;

  return (
    <div
      style={{
        padding: '0.6rem 0.7rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: '10px',
        display: 'grid',
        gap: '0.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} />
        {!compact && (
          <span style={{ fontSize: '0.8rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.title}
          </span>
        )}
        {!compact && job.kind === 'app_issue' && isAdmin && (
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>アプリ改善</span>
        )}
        <span style={{ fontSize: '0.62rem', padding: '0.08rem 0.4rem', borderRadius: '999px', color: meta.color, background: meta.bg, marginLeft: compact ? 'auto' : undefined }}>
          {meta.label}
        </span>
        {isAdmin && job.status === 'running' && job.progress_stage && (
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
            {STAGE_LABELS[job.progress_stage] ?? job.progress_stage}
          </span>
        )}
        {isAdmin && job.status === 'queued' && !compact && (
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}
          >
            <Play size={11} className={starting ? 'animate-pulse' : undefined} />
            {starting ? '開始中...' : '今すぐ実行'}
          </button>
        )}
        {active && !compact && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: 0, cursor: 'pointer' }}
          >
            {cancelling ? '停止中...' : 'キャンセル'}
          </button>
        )}
        {canRetry && !compact && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            title="もう一度実行します"
            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}
          >
            <RefreshCw size={11} className={retrying ? 'animate-spin' : undefined} />
            {retrying ? '受付中...' : '再実行'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', fontSize: '0.64rem', color: 'var(--text-secondary)' }}>
        <span>{formatDate(job.created_at)}</span>
        {job.started_at && <span>実行 {formatDuration(job.runtime_seconds)}</span>}
        {job.credits_charged > 0 && <span>{job.credits_charged.toFixed(1)} クレジット</span>}
        {job.payment_status === 'shortfall' && <span style={{ color: '#f59e0b' }}>残高不足</span>}
        {isAdmin && job.cost_usd != null && job.cost_usd > 0 && <span>API ${job.cost_usd.toFixed(4)}</span>}
        {isAdmin && job.output_tokens != null && <span>{job.input_tokens ?? 0} / {job.output_tokens} tokens</span>}
      </div>

      {job.result_summary && (
        <p style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {job.result_summary}
        </p>
      )}
      {job.error && !job.result_summary && (
        <p style={{ fontSize: '0.7rem', color: job.status === 'blocked' ? '#f59e0b' : '#f87171', overflowWrap: 'anywhere' }}>
          {job.error}
        </p>
      )}

      {isAdmin && job.technical_error && (
        <p style={{ fontSize: '0.65rem', color: '#f87171', overflowWrap: 'anywhere' }}>
          実行時のエラー: {job.technical_error}
        </p>
      )}

      {isAdmin && job.human_approved && (
        <p style={{ fontSize: '0.62rem', color: '#4ade80' }}>管理者承認済み</p>
      )}

      {isAdmin && job.security_flags && job.security_flags.length > 0 && (
        <div
          style={{
            padding: '0.4rem 0.5rem',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            fontSize: '0.65rem',
            color: '#f59e0b',
          }}
        >
          検出: {job.security_flags.join(' / ')}
        </div>
      )}

      {canReview && (
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
            {retryExhausted
              ? `過去の失敗が自動実行の試行上限（${job.auto_attempts ?? 2}回）に達したため停止しています。原因を解消したあと「手動で実行」を押すと、この上限に関係なく実行できます。失敗すると自動実行は再び停止します。`
              : '安全確認のため実行を停止しています。承認するとクラウド作業を再開し、却下すると実行せず終了します。'}
            {!compact && job.issue_url && (
              <>
                {' '}
                <a href={job.issue_url} target="_blank" rel="noreferrer" style={linkStyle}>
                  <ExternalLink size={11} /> 課題の内容を確認
                </a>
              </>
            )}
          </p>
          {job.prompt && (
            <details>
              <summary style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>依頼内容を確認</summary>
              <pre
                style={{
                  marginTop: '0.3rem',
                  padding: '0.45rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '6px',
                  fontSize: '0.66rem',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  maxHeight: '240px',
                  overflowY: 'auto',
                }}
              >
                {job.prompt}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onDecide('approve')}
              disabled={deciding}
              className="btn-primary"
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <ShieldCheck size={12} /> {deciding ? '処理中...' : retryExhausted ? '手動で実行' : '承認して実行'}
            </button>
            <button
              type="button"
              onClick={() => onDecide('reject')}
              disabled={deciding}
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.7rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                color: 'white',
              }}
            >
              {retryExhausted ? '実行せず終了' : '却下して終了'}
            </button>
          </div>
        </div>
      )}

      {job.result_detail && job.result_detail !== job.result_summary && (
        <details open={retryExhausted ? true : undefined}>
          <summary style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>詳細を見る</summary>
          <pre
            style={{
              marginTop: '0.3rem',
              padding: '0.45rem',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '6px',
              fontSize: '0.66rem',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              maxHeight: '240px',
              overflowY: 'auto',
            }}
          >
            {job.result_detail}
          </pre>
        </details>
      )}

      {(job.pr_url || (!compact && isAdmin && job.issue_url)) && (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {job.pr_url && (
            <a href={job.pr_url} target="_blank" rel="noreferrer" style={linkStyle}>
              <ExternalLink size={11} /> {job.status === 'blocked' ? '確認用の下書きPRを見る' : '変更内容を見る'}
            </a>
          )}
          {!compact && isAdmin && job.issue_url && (
            <a href={job.issue_url} target="_blank" rel="noreferrer" style={linkStyle}>
              <ExternalLink size={11} /> 課題
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function SparklesIcon() {
  return <Play size={14} className="text-accent" />;
}

function viewButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    padding: '0.22rem 0.5rem',
    fontSize: '0.65rem',
    borderRadius: '999px',
    border: '1px solid var(--glass-border)',
    background: active ? 'var(--accent-color)' : 'rgba(255,255,255,0.04)',
    color: active ? 'white' : 'var(--text-secondary)',
    cursor: 'pointer',
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.65rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  color: 'white',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
};

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.2rem',
  fontSize: '0.68rem',
  color: 'var(--accent-color)',
};
