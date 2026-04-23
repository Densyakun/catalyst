'use client';

import { useState, useEffect } from 'react';
import DiagnosisForm from '@/components/DiagnosisForm';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Target, History, Sparkles, ExternalLink, MessageCircleWarning, ArrowLeft, Plus } from 'lucide-react';

export default function Home() {
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // 履歴の取得
  const fetchHistory = async () => {
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

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleResult = (newResult: any) => {
    setResult(newResult);
    fetchHistory(); // 診断が終わったら履歴を更新
  };

  const handleSelectHistory = (item: any) => {
    setResult({
      problem: item,
      actions: item.actions
    });
  };

  const handleNewDiagnosis = () => {
    setResult(null);
  };

  // リンクの正規化（AIがURL以外を返した場合のガード）
  const getSafeLink = (link: string) => {
    if (!link) return '#';
    if (link.startsWith('http')) return link;
    // URLでない場合はGoogle検索に飛ばす
    return `https://www.google.com/search?q=${encodeURIComponent(link)}`;
  };

  return (
    <main className="container" style={{ paddingBottom: '5rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Catalyst</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
          課題を構造化し、実行可能なアクションへ。
        </p>
      </header>

      <div className="main-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: result ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', 
        gap: '2rem', 
        maxWidth: '1100px', 
        margin: '0 auto',
        alignItems: 'start'
      }}>
        <div style={{ position: 'relative' }}>
          <AnimatePresence mode="wait">
            {!result || !result.problem ? (
              <DiagnosisForm key="form" onResult={handleResult} />
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass-panel"
                style={{ padding: '2.5rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                  <button onClick={handleNewDiagnosis} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <ArrowLeft size={18} /> 他の課題を診断する
                  </button>
                  <h2 style={{ fontSize: '1.8rem', margin: 0 }}>診断結果</h2>
                </div>

                <section style={{ marginBottom: '2.5rem' }}>
                  <h3 style={{ color: 'var(--accent-color)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Zap size={20} /> 分析された課題
                  </h3>
                  <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
                    <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>現状:</p>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{result.problem.context}</p>
                    <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>想定されるゴール:</p>
                    <p style={{ color: 'var(--text-secondary)' }}>{result.problem.goal}</p>
                  </div>
                </section>

                <section>
                  <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Target size={20} /> 推奨されるアクション
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    ※ 1つを実行しても他のアクションは消えません。すべて検討可能です。
                  </p>
                  
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {result.actions && result.actions.length > 0 ? result.actions.map((action: any, i: number) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        style={{
                          padding: '1.5rem',
                          background: action.is_recommended ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))' : 'rgba(255,255,255,0.02)',
                          borderRadius: '16px',
                          border: action.is_recommended ? '1px solid var(--accent-color)' : '1px solid var(--glass-border)',
                          position: 'relative'
                        }}
                      >
                        {action.is_recommended && (
                          <span style={{ position: 'absolute', top: '-10px', right: '20px', background: 'var(--accent-color)', color: 'white', padding: '2px 10px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                            RECOMMENDED
                          </span>
                        )}
                        <h4 style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>{action.description}</h4>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>⏳ {action.cost?.time || '不明'}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>💰 {action.cost?.money || 0}円</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--accent-color)' }}>✨ 期待効果: {action.expected_gain}</span>
                        </div>
                        <a 
                          href={getSafeLink(action.link)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn-primary" 
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
                        >
                          実行する <ExternalLink size={16} />
                        </a>
                      </motion.div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--glass-border)', borderRadius: '16px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>現在、具体的なアクションが見つかりませんでした。</p>
                        <button className="btn-primary" style={{ marginTop: '1rem' }}>AIに別の切り口で相談する</button>
                      </div>
                    )}
                  </div>
                </section>

                <div style={{ marginTop: '3rem', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,243,205,0.2)', background: 'rgba(255,243,205,0.05)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <MessageCircleWarning size={24} style={{ color: '#ffc107' }} />
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    最適なアクションが見当たりませんか？AIはユーザーのフィードバックから学習します。
                    「具体的に何が不満か」を追加で教えていただければ、より良い解決策を生成します。
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!result && (
          <aside className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={18} /> 最近の診断履歴
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {isLoadingHistory ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>読み込み中...</p>
              ) : history.length > 0 ? history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectHistory(item)}
                  style={{
                    textAlign: 'left',
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  className="history-item"
                >
                  <p style={{ fontSize: '0.85rem', color: 'white', marginBottom: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.context}
                  </p>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </button>
              )) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>履歴はありません。</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
