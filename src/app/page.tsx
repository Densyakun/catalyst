'use client';

import { useState, useEffect } from 'react';
import IntakeWizard from '@/components/IntakeWizard';
import AuthUI from '@/components/Auth';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Target, History, Sparkles, ExternalLink, MessageCircleWarning, ArrowLeft, LogOut, User, CheckCircle2, ChevronRight, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchHistory = async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistory(data);
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchClusters = async () => {
    try {
      const { data, error } = await supabase.from('clusters').select('*').limit(3);
      if (error) {
        // テーブルがない場合は静かに終了
        if (error.code === 'PGRST116' || error.message?.includes('relation "clusters" does not exist')) {
          console.warn('Clusters table not found. Please run migration.');
          return;
        }
        throw error;
      }
      setClusters(data || []);
    } catch (err) {
      console.error('Fetch clusters error:', err);
    }
  };

  useEffect(() => {
    if (session) {
      fetchHistory();
      fetchClusters();
    }
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setResult(null);
  };

  const handleLinkAccount = async (provider: 'google' | 'github') => {
    try {
      const { error } = await supabase.auth.linkIdentity({ provider });
      if (error) throw error;
    } catch (err: any) {
      console.error('Linking error:', err);
      alert('連携に失敗しました: ' + err.message);
    }
  };

  const handleResult = (newResult: any) => {
    setResult(newResult);
    fetchHistory();
  };

  const handleExecute = async (action: any, problem: any) => {
    setIsExecuting(true);
    setExecutionResult(null);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, problem }),
      });
      const data = await res.json();
      setExecutionResult(data);
    } catch (err) {
      console.error('Execute error:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSelectHistory = (item: any) => {
    setResult({
      type: 'result',
      results: [{
        problem: item,
        actions: item.actions
      }]
    });
    setExecutionResult(null);
  };

  const handleNewDiagnosis = () => {
    setResult(null);
    setExecutionResult(null);
  };

  if (!session) {
    return <AuthUI />;
  }

  const isAnonymous = session.user.is_anonymous;
  const username = isAnonymous ? '匿名ユーザー' : (session.user.user_metadata.full_name || session.user.email?.split('@')[0]);

  return (
    <main className="container" style={{ paddingBottom: '5rem' }}>
      {isAnonymous && (
        <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--accent-color)', borderRadius: '12px', padding: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <Sparkles className="text-accent" size={20} />
            <p style={{ fontSize: '0.9rem' }}>現在は匿名モードです。他のデバイスからも履歴を確認できるようにアカウントを連携しませんか？</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => handleLinkAccount('google')} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Google 連携</button>
            <button onClick={() => handleLinkAccount('github')} style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white' }}>GitHub 連携</button>
          </div>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.2rem' }}>Catalyst</h1>
          <p style={{ color: 'var(--text-secondary)' }}>意思決定の後悔を減らすAI</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <User size={18} className="text-accent" />
            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{username}</span>
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
            <LogOut size={16} /> ログアウト
          </button>
        </div>
      </header>

      <div className="main-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: (result || executionResult) ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', 
        gap: '2rem', 
        maxWidth: '1100px', 
        margin: '0 auto',
        alignItems: 'start'
      }}>
        <div style={{ position: 'relative' }}>
          <AnimatePresence mode="wait">
            {!result ? (
              <div key="intake-section">
                {clusters.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>共有されている課題</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                      {clusters.map(c => (
                        <div key={c.id} className="glass-panel" style={{ padding: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                          <h4 style={{ marginBottom: '0.5rem' }}>{c.title}</h4>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <IntakeWizard onResult={handleResult} />
              </div>
            ) : executionResult ? (
              <motion.div key="execution" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel" style={{ padding: '2.5rem' }}>
                <button onClick={() => setExecutionResult(null)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '2rem' }}>
                  <ArrowLeft size={18} /> アクション一覧に戻る
                </button>
                
                <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>リサーチ結果と実行計画</h2>
                <div style={{ marginBottom: '2.5rem', padding: '1.5rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '16px', border: '1px solid var(--accent-color)' }}>
                  <p style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>{executionResult.summary}</p>
                </div>

                <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '3rem' }}>
                  {executionResult?.details?.map((detail: any, i: number) => (
                    <div key={i} style={{ borderLeft: '3px solid var(--accent-color)', paddingLeft: '1.5rem' }}>
                      <h4 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{detail.title}</h4>
                      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{detail.content}</p>
                    </div>
                  )) || <p>詳細情報を読み込み中、または取得できませんでした。</p>}
                </div>

                <section style={{ marginBottom: '3rem' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}><CheckCircle2 className="text-accent" /> 次にとるべきステップ</h3>
                  <div style={{ display: 'grid', gap: '0.8rem' }}>
                    {executionResult?.next_steps?.map((step: string, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{i + 1}</div>
                        <p>{step}</p>
                      </div>
                    )) || <p>次のステップを生成中...</p>}
                  </div>
                </section>

                <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><MessageSquare size={18} /> AIにさらに詳しく聞く</h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" placeholder="例: 具体的な価格を教えて、自分に合うか相談したい..." style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white' }} />
                    <button className="btn-primary" style={{ padding: '12px' }}>送信</button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel" style={{ padding: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                  <button onClick={handleNewDiagnosis} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <ArrowLeft size={18} /> 他の課題を診断する
                  </button>
                  <h2 style={{ fontSize: '1.8rem', margin: 0 }}>
                    {result.results.length > 1 ? `${result.results.length}個の課題が見つかりました` : '診断結果'}
                  </h2>
                </div>

                {result.results.map((res: any, idx: number) => (
                  <div key={idx} style={{ marginBottom: idx < result.results.length - 1 ? '4rem' : 0, paddingBottom: idx < result.results.length - 1 ? '4rem' : 0, borderBottom: idx < result.results.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                    <section style={{ marginBottom: '2.5rem' }}>
                      <h3 style={{ color: 'var(--accent-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Zap size={20} /> 課題 {result.results.length > 1 ? idx + 1 : ''}: {res.problem.context.substring(0, 30)}...
                      </h3>
                      <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{res.problem.context}</p>
                        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>想定されるゴール:</p>
                        <p style={{ color: 'var(--text-secondary)' }}>{res.problem.goal}</p>
                      </div>
                    </section>

                    <section>
                      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Target size={20} /> 推奨されるアクション
                      </h3>
                      <div style={{ display: 'grid', gap: '1rem' }}>
                        {res.actions.map((action: any, i: number) => (
                          <motion.div 
                            key={i} 
                            whileHover={{ scale: 1.01 }} 
                            style={{ 
                              padding: '1.5rem', 
                              background: action.is_recommended ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))' : 'rgba(255,255,255,0.02)', 
                              borderRadius: '16px', 
                              border: action.is_recommended ? '1px solid var(--accent-color)' : '1px solid var(--glass-border)', 
                              cursor: 'pointer' 
                            }} 
                            onClick={() => {
                              handleExecute(action, res.problem);
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h4 style={{ fontSize: '1.1rem' }}>{action.description}</h4>
                              <ChevronRight size={20} style={{ color: 'var(--text-secondary)' }} />
                            </div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{action.reason}</p>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!(result || executionResult) && (
          <aside className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><History size={18} /> 最近の診断履歴</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isLoadingHistory ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>読み込み中...</p>
              ) : history.length > 0 ? history.map((item) => (
                <button key={item.id} onClick={() => handleSelectHistory(item)} className="history-item" style={{ textAlign: 'left', padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'white', marginBottom: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.context}</p>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(item.created_at).toLocaleDateString()}</span>
                </button>
              )) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>履歴はありません。</p>
              )}
            </div>
          </aside>
        )}
      </div>

      {isExecuting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 className="animate-spin" size={48} style={{ color: 'var(--accent-color)', marginBottom: '1.5rem' }} />
          <h2 style={{ fontSize: '1.5rem' }}>AIがリサーチを実行中...</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>最適な情報を収集し、実行計画を立てています</p>
        </div>
      )}
    </main>
  );
}
