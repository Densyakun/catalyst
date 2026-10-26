'use client';

import { useState, useEffect, useCallback } from 'react';
import IntakeWizard from '@/components/IntakeWizard';
import AuthUI from '@/components/Auth';
import SourcesPanel from '@/components/SourcesPanel';
import InsightsPanel from '@/components/InsightsPanel';
import IdeaInboxPanel from '@/components/IdeaInboxPanel';
import FundsPanel from '@/components/FundsPanel';
import CommunityIdeasPanel from '@/components/CommunityIdeasPanel';
import SharingPanel from '@/components/SharingPanel';
import ChatPanel from '@/components/ChatPanel';
import ResourcesPanel from '@/components/ResourcesPanel';
import ProjectsPanel from '@/components/ProjectsPanel';
import EvolutionPanel from '@/components/EvolutionPanel';
import DynamicUISlot from '@/components/DynamicUISlot';
import NotificationsBell from '@/components/NotificationsBell';
import APITokensPanel from '@/components/APITokensPanel';
import MCPSetupPanel from '@/components/MCPSetupPanel';
import CloudPanel from '@/components/CloudPanel';
import TodayView, { type NavTab } from '@/components/TodayView';
import ExecutionView from '@/components/ExecutionView';
import DiagnosisResultView from '@/components/DiagnosisResultView';
import { motion, AnimatePresence } from 'framer-motion';
import type { EditingInsight, FocusContext } from '@/components/ChatPanel';
import type { TodayFocus } from '@/lib/types/today';
import {
  ArrowRight,
  ClipboardList,
  Cloud,
  FolderKanban,
  History,
  Loader2,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface ActionLike {
  id?: string;
  description?: string;
  reason?: string;
  is_recommended?: boolean;
  cost?: { time?: string; money?: number } | null;
  [key: string]: unknown;
}

interface ProblemLike {
  id?: string;
  context: string;
  goal?: string;
  [key: string]: unknown;
}

interface HistoryItem extends ProblemLike {
  id: string;
  created_at: string;
  actions?: ActionLike[];
}

interface DiagnosisResult {
  type: 'result';
  results: Array<{ problem: ProblemLike; actions: ActionLike[] }>;
}

interface ExecutionResult {
  summary?: string;
  details?: { title: string; content: string; link?: string }[];
  next_steps?: string[];
  advice?: string;
  actionId?: string | null;
  actionDescription?: string | null;
}

interface ClusterItem {
  id: string;
  title: string;
  description: string;
  problem_count?: number;
}

const TABS: Array<{ key: NavTab; label: string; icon: typeof Sun }> = [
  { key: 'today', label: '今日', icon: Sun },
  { key: 'issues', label: '課題', icon: ClipboardList },
  { key: 'plan', label: '計画', icon: FolderKanban },
  { key: 'connect', label: 'つながり', icon: Users },
  { key: 'cloud', label: 'クラウド', icon: Cloud },
  { key: 'settings', label: '設定', icon: Settings },
];

const NAV_TAB_KEYS = new Set<string>(TABS.map((tab) => tab.key));

function readUrlState(): { tab: NavTab; focus: string | null } {
  if (typeof window === 'undefined') return { tab: 'today', focus: null };
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  return {
    tab: tab && NAV_TAB_KEYS.has(tab) ? (tab as NavTab) : 'today',
    focus: params.get('focus'),
  };
}

function buildUrl(tab: NavTab, focus: string | null): string {
  const params = new URLSearchParams(window.location.search);
  if (tab === 'today') {
    params.delete('tab');
  } else {
    params.set('tab', tab);
  }
  if (focus) {
    params.set('focus', focus);
  } else {
    params.delete('focus');
  }
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('today');
  const [todayFocusKey, setTodayFocusKey] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [clusters, setClusters] = useState<ClusterItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState('');
  const [editingInsight, setEditingInsight] = useState<EditingInsight | null>(null);
  const [consultTarget, setConsultTarget] = useState<FocusContext | null>(null);
  const [todayRefreshKey, setTodayRefreshKey] = useState(0);
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0);
  const [sourcesRefreshKey, setSourcesRefreshKey] = useState(0);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [fundsRefreshKey, setFundsRefreshKey] = useState(0);
  const [communityRefreshKey, setCommunityRefreshKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const applyUrlState = () => {
      const next = readUrlState();
      setActiveTab(next.tab);
      setTodayFocusKey(next.focus);
      setConsultTarget(null);
      setExecutionResult(null);
      setResult(null);
    };

    applyUrlState();
    window.addEventListener('popstate', applyUrlState);
    return () => window.removeEventListener('popstate', applyUrlState);
  }, []);

  const writeUrl = useCallback((tab: NavTab, focus: string | null, replace = false) => {
    if (typeof window === 'undefined') return;
    const next = buildUrl(tab, focus);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (replace) {
      window.history.replaceState(null, '', next);
    } else {
      window.history.pushState(null, '', next);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistory(data as HistoryItem[]);
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [session?.user?.id]);

  const fetchClusters = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('clusters').select('*').limit(6);
      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('relation "clusters" does not exist')) {
          return;
        }
        throw error;
      }
      setClusters((data || []) as unknown as ClusterItem[]);
    } catch (err) {
      console.error('Fetch clusters error:', err);
    }
  }, []);

  const fetchSourceNames = useCallback(async () => {
    try {
      const res = await fetch('/api/sources');
      if (res.ok) {
        const data = await res.json();
        setSourceNames((data.sources || []).map((s: { source_name: string }) => s.source_name));
      }
    } catch (err) {
      console.error('Fetch source names error:', err);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const run = async () => {
      await Promise.all([fetchHistory(), fetchClusters(), fetchSourceNames()]);
    };
    void run();
  }, [session, fetchHistory, fetchClusters, fetchSourceNames]);

  const bumpToday = useCallback(() => {
    setTodayRefreshKey((k) => k + 1);
  }, []);

  const handleSourcesChanged = useCallback(() => {
    setSourcesRefreshKey((k) => k + 1);
    setInsightsRefreshKey((k) => k + 1);
    bumpToday();
    void fetchSourceNames();
  }, [bumpToday, fetchSourceNames]);

  const handleIdeaProcessed = useCallback(() => {
    setInsightsRefreshKey((k) => k + 1);
    bumpToday();
  }, [bumpToday]);

  const handleFundsChanged = useCallback(() => {
    setCommunityRefreshKey((k) => k + 1);
  }, []);

  const handleCommunitySupported = useCallback(() => {
    setFundsRefreshKey((k) => k + 1);
  }, []);

  const handleSharingChanged = useCallback(() => {
    setFundsRefreshKey((k) => k + 1);
    setCommunityRefreshKey((k) => k + 1);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setResult(null);
    setTodayFocusKey(null);
    setActiveTab('today');
    writeUrl('today', null, true);
  };

  const handleLinkAccount = async (provider: 'google' | 'github') => {
    try {
      const { error } = await supabase.auth.linkIdentity({ provider });
      if (error) throw error;
    } catch (err: unknown) {
      console.error('Linking error:', err);
      alert('連携に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleResult = (newResult: DiagnosisResult) => {
    setResult(newResult);
    setExecutionResult(null);
    setConsultTarget(null);
    setTodayFocusKey(null);
    setActiveTab('issues');
    writeUrl('issues', null);
    bumpToday();
    void fetchHistory();
  };

  const handleConsult = (focus: TodayFocus) => {
    setConsultTarget({
      title: focus.title,
      description: focus.description,
      goal: focus.goal,
      nextStep: focus.nextStep,
    });
    setResult(null);
    setExecutionResult(null);
    setTodayFocusKey(null);
    setActiveTab('issues');
    writeUrl('issues', null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const closeConsult = () => {
    setConsultTarget(null);
    bumpToday();
    void fetchHistory();
  };

  const handleExecute = async (action: ActionLike, problem: ProblemLike) => {
    setIsExecuting(true);
    setExecutionResult(null);
    setExecuteError('');
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, problem }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '実行計画の作成に失敗しました');
      setExecutionResult({
        ...data,
        actionId: action.id ?? null,
        actionDescription: action.description ?? null,
      });
    } catch (err) {
      console.error('Execute error:', err);
      setExecuteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setResult({
      type: 'result',
      results: [{
        problem: item,
        actions: item.actions ?? [],
      }],
    });
    setExecutionResult(null);
    setTodayFocusKey(null);
    setActiveTab('issues');
    writeUrl('issues', null);
  };

  const handleNewDiagnosis = () => {
    setResult(null);
    setExecutionResult(null);
  };

  if (!session) {
    return <AuthUI />;
  }

  const isAnonymous = session.user.is_anonymous;
  const username = isAnonymous
    ? '匿名ユーザー'
    : (session.user.user_metadata.full_name || session.user.email?.split('@')[0]);

  const navigate = (tab: NavTab) => {
    setConsultTarget(null);
    if (tab === 'today') {
      setActiveTab(tab);
      writeUrl(tab, todayFocusKey);
      return;
    }
    setTodayFocusKey(null);
    setActiveTab(tab);
    writeUrl(tab, null);
  };

  const handleTodayFocusChange = (key: string | null) => {
    setTodayFocusKey(key);
    writeUrl('today', key);
  };

  return (
    <main className="container" style={{ paddingBottom: '2rem' }}>
      <header
        className="app-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.6rem',
          marginTop: '0.3rem',
          flexWrap: 'wrap',
          gap: '0.6rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
          <h1 className="text-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>Katalyse</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: 0 }}>課題解決AI</p>
        </div>

        <div
          className="app-userbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.25rem 0.6rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            maxWidth: '100%',
          }}
        >
          <NotificationsBell />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            <User size={13} className="text-accent" style={{ flexShrink: 0 }} />
            <span className="app-username" style={{ fontWeight: 'bold', fontSize: '0.75rem' }}>{username}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('settings')}
            title="設定"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 0, display: 'flex' }}
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="メインナビゲーション">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.key)}
              className={`app-nav-btn ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'today' && (
            <TodayView
              username={username || 'あなた'}
              onNavigate={navigate}
              onConsult={handleConsult}
              refreshKey={todayRefreshKey}
              onDataChanged={bumpToday}
              focusKey={todayFocusKey}
              onFocusChange={handleTodayFocusChange}
            />
          )}

          {activeTab === 'issues' && (
            <>
              {executeError && (
                <div
                  className="glass-panel"
                  style={{
                    padding: '0.7rem 0.9rem',
                    marginBottom: '0.6rem',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    fontSize: '0.78rem',
                  }}
                >
                  実行計画を作成できませんでした: {executeError}
                </div>
              )}
              {consultTarget ? (
                <ConsultView
                  target={consultTarget}
                  sourceNames={sourceNames}
                  onSourcesChanged={handleSourcesChanged}
                  onClose={closeConsult}
                />
              ) : executionResult ? (
                <ExecutionView
                  result={executionResult}
                  actionId={executionResult.actionId}
                  actionDescription={executionResult.actionDescription}
                  onBack={() => setExecutionResult(null)}
                  backLabel="アクション一覧に戻る"
                  onOutcomeSubmitted={() => {
                    bumpToday();
                    void fetchHistory();
                  }}
                />
              ) : result ? (
                <DiagnosisResultView
                  result={result}
                  onExecute={handleExecute}
                  onBack={handleNewDiagnosis}
                />
              ) : (
                <IssuesContent
                  editingInsight={editingInsight}
                  onClearEditingInsight={() => setEditingInsight(null)}
                  onInsightUpdated={() => {
                    setInsightsRefreshKey((k) => k + 1);
                    bumpToday();
                    setEditingInsight(null);
                  }}
                  onEditInChat={(insight) => setEditingInsight(insight)}
                  sourceNames={sourceNames}
                  onSourcesChanged={handleSourcesChanged}
                  sourcesRefreshKey={sourcesRefreshKey}
                  insightsRefreshKey={insightsRefreshKey}
                  onIdeaProcessed={handleIdeaProcessed}
                  onResult={handleResult}
                  history={history}
                  isLoadingHistory={isLoadingHistory}
                  onSelectHistory={handleSelectHistory}
                />
              )}
            </>
          )}

          {activeTab === 'plan' && (
            <div className="panel-grid">
              <ProjectsPanel />
              <ResourcesPanel />
            </div>
          )}

          {activeTab === 'connect' && (
            <div className="panel-grid">
              <CommunityIdeasPanel
                refreshKey={communityRefreshKey}
                onSupported={handleCommunitySupported}
              />
              <SharingPanel
                refreshKey={fundsRefreshKey + communityRefreshKey}
                onChanged={handleSharingChanged}
              />
              <FundsPanel refreshKey={fundsRefreshKey} onDonated={handleFundsChanged} />
              {clusters.length > 0 && (
                <DynamicUISlot area="dashboard_focus">
                <div className="glass-panel" style={{ padding: '0.8rem' }}>
                  <h3 style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>共有されている課題</h3>
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    {clusters.map((cluster) => (
                      <div
                        key={cluster.id}
                        style={{
                          padding: '0.55rem 0.65rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                        }}
                      >
                        <h4 style={{ fontSize: '0.8rem', marginBottom: '0.15rem', color: 'var(--accent-color)' }}>
                          {cluster.title}
                        </h4>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {cluster.description}
                        </p>
                        {typeof cluster.problem_count === 'number' && (
                          <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            {cluster.problem_count}人が同じ課題を抱えています
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                </DynamicUISlot>
              )}
            </div>
          )}

          {activeTab === 'cloud' && <CloudPanel />}

          {activeTab === 'settings' && (
            <SettingsContent
              username={username || 'あなた'}
              isAnonymous={Boolean(isAnonymous)}
              onLinkAccount={handleLinkAccount}
              onLogout={handleLogout}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {isExecuting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2 className="animate-spin" size={48} style={{ color: 'var(--accent-color)', marginBottom: '1.5rem' }} />
          <h2 style={{ fontSize: '1.5rem' }}>AIがリサーチを実行中...</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>最適な情報を収集し、実行計画を立てています</p>
        </div>
      )}
    </main>
  );
}

function ConsultView({
  target,
  sourceNames,
  onSourcesChanged,
  onClose,
}: {
  target: FocusContext;
  sourceNames: string[];
  onSourcesChanged: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', display: 'grid', gap: '0.8rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel"
        style={{
          padding: 'clamp(1rem, 3vw, 1.4rem)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.05))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <MessageSquare size={14} className="text-accent" />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
            今日の1つについて相談
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              padding: '0.3rem 0.6rem',
              fontSize: '0.7rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            相談を終える
          </button>
        </div>

        <h2 style={{ fontSize: 'clamp(1.1rem, 2.4vw, 1.4rem)', marginBottom: '0.35rem', overflowWrap: 'anywhere' }}>
          {target.title}
        </h2>
        {target.description && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginBottom: '0.4rem' }}>
            {target.description}
          </p>
        )}
        {target.nextStep && (
          <p style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--accent-color)' }}>提示された次の一歩: </span>
            {target.nextStep}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.4rem',
            marginTop: '0.6rem',
          }}
        >
          {[
            '① 下の入力欄に、今困っていることを書く',
            '② AIの返答に、続けて質問する',
            '③ 出てきた提案から次の一歩を選ぶ',
          ].map((step) => (
            <div
              key={step}
              style={{
                padding: '0.45rem 0.55rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                fontSize: '0.7rem',
                color: 'var(--text-secondary)',
              }}
            >
              {step}
            </div>
          ))}
        </div>
      </motion.div>

      <ChatPanel
        focusContext={target}
        onClearFocusContext={onClose}
        heading="相談チャット"
        description="この課題についてAIと話せます。返答に続けて質問できます。"
        autoFocus
        sourceNames={sourceNames}
        onSourcesChanged={onSourcesChanged}
      />
    </div>
  );
}

function IssuesContent({
  editingInsight,
  onClearEditingInsight,
  onInsightUpdated,
  onEditInChat,
  sourceNames,
  onSourcesChanged,
  sourcesRefreshKey,
  insightsRefreshKey,
  onIdeaProcessed,
  onResult,
  history,
  isLoadingHistory,
  onSelectHistory,
}: {
  editingInsight: EditingInsight | null;
  onClearEditingInsight: () => void;
  onInsightUpdated: () => void;
  onEditInChat: (insight: EditingInsight) => void;
  sourceNames: string[];
  onSourcesChanged: () => void;
  sourcesRefreshKey: number;
  insightsRefreshKey: number;
  onIdeaProcessed: () => void;
  onResult: (result: DiagnosisResult) => void;
  history: HistoryItem[];
  isLoadingHistory: boolean;
  onSelectHistory: (item: HistoryItem) => void;
}) {
  return (
    <div>
      <div className="glass-panel" style={{ padding: '0.9rem 1rem', marginBottom: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
          <Sparkles size={14} className="text-accent" />
          <h2 style={{ fontSize: '0.95rem', margin: 0 }}>課題タブの使い方</h2>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          迷ったら、まずは「AIと話す」から。下のクイック入力に状況を書くだけで相談できます。
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              document.getElementById('issues-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <MessageSquare size={13} /> AIと話す
          </button>
          <button
            type="button"
            onClick={() =>
              document.getElementById('issues-diagnosis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            style={{
              padding: '0.4rem 0.7rem',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            <ArrowRight size={13} /> じっくり診断する
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
          {['① 状況を書く', '② AIの返答に追加で聞く', '③ 提案から次の一歩を選ぶ'].map((step) => (
            <span key={step} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {step}
            </span>
          ))}
        </div>
      </div>

      <div id="issues-diagnosis" style={{ marginBottom: '0.8rem' }}>
        <IntakeWizard onResult={onResult} />
      </div>

      <div className="panel-grid">
        <div id="issues-chat">
          <ChatPanel
            editingInsight={editingInsight}
            onClearEditingInsight={onClearEditingInsight}
            onInsightUpdated={onInsightUpdated}
            sourceNames={sourceNames}
            onSourcesChanged={onSourcesChanged}
          />
        </div>
        <InsightsPanel onEditInChat={onEditInChat} refreshKey={insightsRefreshKey} />
        <IdeaInboxPanel onProcessed={onIdeaProcessed} />
        <SourcesPanel refreshKey={sourcesRefreshKey} />
        <aside className="glass-panel" style={{ padding: '0.8rem' }}>
          <h3 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <History size={14} /> 診断履歴
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {isLoadingHistory ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>読み込み中...</p>
            ) : history.length > 0 ? (
              history.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistory(item)}
                  className="history-item"
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.6rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    maxWidth: '100%',
                    minWidth: 0,
                    color: 'white',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, maxWidth: '100%' }}>
                    {item.context}
                  </p>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                    {new Date(item.created_at).toLocaleDateString('ja-JP')}
                  </span>
                </button>
              ))
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>履歴はありません。</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SettingsContent({
  username,
  isAnonymous,
  onLinkAccount,
  onLogout,
}: {
  username: string;
  isAnonymous: boolean;
  onLinkAccount: (provider: 'google' | 'github') => void;
  onLogout: () => void;
}) {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gap: '0.8rem' }}>
      <div className="glass-panel" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.6rem' }}>アカウント</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <User size={16} className="text-accent" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{username}</span>
        </div>

        {isAnonymous ? (
          <div
            style={{
              padding: '0.8rem',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '10px',
              marginBottom: '0.8rem',
            }}
          >
            <p style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              今は匿名モードです。アカウントを連携すると、他のデバイスからも履歴を確認できます。
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => onLinkAccount('google')}
                className="btn-primary"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.78rem' }}
              >
                Google 連携
              </button>
              <button
                onClick={() => onLinkAccount('github')}
                style={{
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.78rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'white',
                }}
              >
                GitHub 連携
              </button>
            </div>
          </div>
        ) : null}

        <button
          onClick={onLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            padding: '0.45rem 0.8rem',
            fontSize: '0.78rem',
          }}
        >
          <LogOut size={14} /> ログアウト
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>高度な設定</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
          通常の利用では開く必要はありません。エージェント連携や自己進化の設定です。
        </p>

        <details style={{ marginBottom: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', padding: '0.3rem 0' }}>自己進化エンジン</summary>
          <div style={{ marginTop: '0.5rem' }}>
            <EvolutionPanel />
          </div>
        </details>

        <details style={{ marginBottom: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', padding: '0.3rem 0' }}>APIトークン</summary>
          <div style={{ marginTop: '0.5rem' }}>
            <APITokensPanel />
          </div>
        </details>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', padding: '0.3rem 0' }}>MCPで使う</summary>
          <div style={{ marginTop: '0.5rem' }}>
            <MCPSetupPanel />
          </div>
        </details>
      </div>

      <div className="glass-panel" style={{ padding: '0.9rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
          <Zap size={12} /> Katalyse の使い方
        </p>
        <p>「今日」で1つに集中し、終わったら結果を記録する。これが基本の流れです。</p>
      </div>
    </div>
  );
}
