'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, RefreshCw, Search, CheckCircle2, Clock,
  Link2, Loader2, X, Filter, FolderOpen,
} from 'lucide-react';
import type { UserSource } from '@/lib/types/sources';

interface GoogleDoc {
  id: string;
  name: string;
  modifiedTime: string;
  is_synced: boolean;
  last_synced_at: string | null;
}

type SyncMode = 'all' | 'keyword' | 'selected';

export default function SourcesPanel() {
  const [sources, setSources] = useState<UserSource[]>([]);
  const [googleDocs, setGoogleDocs] = useState<GoogleDoc[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>('selected');
  const [keyword, setKeyword] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [searchLoading, setSearchLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchGoogleDocs = async (query?: string) => {
    setSearchLoading(true);
    setErrorMessage(null);
    try {
      const url = query ? `/api/sources/docs?query=${encodeURIComponent(query)}` : '/api/sources/docs';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setGoogleDocs(data);
        setIsConnected(true);
      } else {
        const err = await res.json();
        if (err.error?.includes('not connected')) {
          setIsConnected(false);
        }
        setErrorMessage(err.error || 'ドキュメントの取得に失敗しました');
      }
    } catch (err) {
      console.error('Failed to fetch docs:', err);
      setErrorMessage('ネットワークエラーが発生しました');
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchSources = async () => {
    try {
      const res = await fetch('/api/sources');
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
        setIsConnected(data.googleConnected || false);
      }
    } catch (err) {
      console.error('Failed to fetch sources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();

    // OAuth完了後に自動でドキュメントピッカーを表示
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setIsConnected(true);
      setShowDocPicker(true);
      fetchGoogleDocs();
      const url = new URL(window.location.href);
      url.searchParams.delete('google_connected');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const res = await fetch('/api/sources/google/auth');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Google auth error:', err);
    }
  };

  const handleAddSource = async (doc: GoogleDoc) => {
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'google_docs',
          source_name: doc.name,
          source_config: {
            doc_id: doc.id,
            doc_title: doc.name,
            doc_url: `https://docs.google.com/document/d/${doc.id}`,
          },
        }),
      });
      if (res.ok) {
        fetchSources();
      }
    } catch (err) {
      console.error('Add source error:', err);
    }
  };

  const handleSync = async (sourceId: string) => {
    setSyncing(sourceId);
    try {
      const res = await fetch(`/api/sources/${sourceId}/sync`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchSources();
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(null);
    }
  };

  const handleBulkSync = async () => {
    const toSync = syncMode === 'all'
      ? sources
      : sources.filter((s) => {
          const config = s.source_config as { doc_id?: string };
          return config?.doc_id && selectedDocs.has(config.doc_id);
        });

    for (const source of toSync) {
      await handleSync(source.id);
    }
  };

  const handleKeywordSearch = () => {
    if (keyword.trim()) {
      fetchGoogleDocs(keyword);
    }
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '未取得';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <FolderOpen size={20} className="text-accent" />
          ソース管理
        </h3>
        {!isConnected ? (
          <button onClick={handleConnectGoogle} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
            <Link2 size={14} style={{ marginRight: '0.3rem' }} />
            Google連携
          </button>
        ) : (
          <button
            onClick={() => { setShowDocPicker(!showDocPicker); if (!showDocPicker) fetchGoogleDocs(); }}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Plus size={14} />
            ドキュメント追加
          </button>
        )}
      </div>

      {/* 読み込みモード選択 */}
      {sources.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            {(['selected', 'keyword', 'all'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSyncMode(mode)}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.75rem',
                  background: syncMode === mode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${syncMode === mode ? 'var(--accent-color)' : 'var(--glass-border)'}`,
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {mode === 'selected' && '個別選択'}
                {mode === 'keyword' && '目的指定'}
                {mode === 'all' && '全件読み込み'}
              </button>
            ))}
          </div>

          {syncMode === 'keyword' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="キーワードで絞り込み..."
                onKeyDown={(e) => e.key === 'Enter' && handleKeywordSearch()}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.7rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.85rem',
                }}
              />
              <button onClick={handleKeywordSearch} style={{
                padding: '0.4rem 0.6rem',
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid var(--accent-color)',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
              }}>
                <Search size={14} />
              </button>
            </div>
          )}

          {syncMode === 'all' && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
              全ドキュメントを読み込みます（時間がかかる場合があります）
            </p>
          )}
        </div>
      )}

      {/* 連携済みソース一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sources.map((source) => {
          const config = source.source_config as { doc_id?: string; doc_title?: string };
          return (
            <div
              key={source.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.6rem 0.8rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                {syncMode === 'selected' && (
                  <input
                    type="checkbox"
                    checked={selectedDocs.has(config?.doc_id || '')}
                    onChange={() => toggleDocSelection(config?.doc_id || '')}
                    style={{ accentColor: 'var(--accent-color)' }}
                  />
                )}
                <FileText size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {source.source_name}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={10} />
                    {formatTime(source.last_synced_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleSync(source.id)}
                disabled={syncing === source.id}
                style={{
                  padding: '0.3rem 0.5rem',
                  background: 'transparent',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  cursor: syncing === source.id ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  fontSize: '0.75rem',
                }}
              >
                {syncing === source.id ? (
                  <Loader2 className="animate-spin" size={12} />
                ) : (
                  <RefreshCw size={12} />
                )}
                同期
              </button>
            </div>
          );
        })}

        {sources.length === 0 && isConnected && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
            ドキュメントを追加して、自動で課題を検出しましょう
          </p>
        )}

        {!isConnected && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
            Googleアカウントを連携すると、ドキュメントから自動で課題を検出できます
          </p>
        )}
      </div>

      {/* 一括同期ボタン */}
      {sources.length > 0 && (
        <button
          onClick={handleBulkSync}
          disabled={syncing !== null}
          className="btn-primary"
          style={{ width: '100%', marginTop: '0.8rem', padding: '0.6rem', fontSize: '0.85rem' }}
        >
          {syncing ? (
            <Loader2 className="animate-spin" size={14} style={{ marginRight: '0.3rem' }} />
          ) : (
            <RefreshCw size={14} style={{ marginRight: '0.3rem' }} />
          )}
          {syncMode === 'all' ? '全件読み込み開始' : syncMode === 'keyword' ? 'キーワード一致を読み込み' : '選択したドキュメントを読み込み'}
        </button>
      )}

      {/* ドキュメントピッカー */}
      <AnimatePresence>
        {showDocPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginTop: '1rem', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
                <Filter size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                Google Docsから選択
              </h4>
              <button
                onClick={() => setShowDocPicker(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                placeholder="ドキュメントを検索..."
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length > 2 || v.length === 0) fetchGoogleDocs(v || undefined);
                }}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.7rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            {searchLoading ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {googleDocs.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.7rem',
                      background: doc.is_synced ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255,255,255,0.02)',
                      borderRadius: '6px',
                      border: '1px solid var(--glass-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                      {doc.is_synced ? (
                        <CheckCircle2 size={14} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                      ) : (
                        <FileText size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.name}
                      </span>
                    </div>
                    {!doc.is_synced && (
                      <button
                        onClick={() => handleAddSource(doc)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.75rem',
                          background: 'rgba(99, 102, 241, 0.2)',
                          border: '1px solid var(--accent-color)',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        追加
                      </button>
                    )}
                    {doc.is_synced && doc.last_synced_at && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {formatTime(doc.last_synced_at)}
                      </span>
                    )}
                  </div>
                ))}
                {googleDocs.length === 0 && !errorMessage && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
                    ドキュメントが見つかりません
                  </p>
                )}
                {errorMessage && (
                  <p style={{ fontSize: '0.8rem', color: '#f87171', textAlign: 'center', padding: '1rem' }}>
                    {errorMessage}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
