'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, RefreshCw, Search, CheckCircle2, Clock,
  Link2, Loader2, X, Filter, FolderOpen, ChevronDown,
} from 'lucide-react';
import type { UserSource } from '@/lib/types/sources';

interface GoogleDoc {
  id: string;
  name: string;
  modifiedTime: string;
  is_synced: boolean;
  last_synced_at: string | null;
}

interface SourcesPanelProps {
  refreshKey?: number;
}

export default function SourcesPanel({ refreshKey }: SourcesPanelProps) {
  const [sources, setSources] = useState<UserSource[]>([]);
  const [googleDocs, setGoogleDocs] = useState<GoogleDoc[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSourceList, setShowSourceList] = useState(false);

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
        if (err.error === 're_auth_required') {
          setIsConnected(false);
          setErrorMessage('Google認証の有効期限が切れました。再連携してください。');
        } else if (err.error?.includes('not connected')) {
          setIsConnected(false);
        } else {
          setErrorMessage(err.error || 'ドキュメントの取得に失敗しました');
        }
      }
    } catch (err) {
      console.error('Failed to fetch docs:', err);
      setErrorMessage('ネットワークエラーが発生しました');
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchSources = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchSources();

    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      setIsConnected(true);
      setShowDocPicker(true);
      fetchGoogleDocs();
      const url = new URL(window.location.href);
      url.searchParams.delete('google_connected');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [fetchSources]);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchSources();
    }
  }, [refreshKey, fetchSources]);

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
      } else {
        const data = await res.json();
        if (data.error === 're_auth_required') {
          setIsConnected(false);
          setErrorMessage('Google認証の有効期限が切れました。再連携してください。');
        }
      }
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(null);
    }
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
      style={{ padding: '0.8rem', marginBottom: 0 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, fontSize: '0.85rem' }}>
          <FolderOpen size={14} className="text-accent" />
          ソース
          {sources.length > 0 && (
            <span style={{
              padding: '0 0.3rem',
              background: 'rgba(99, 102, 241, 0.2)',
              borderRadius: '8px',
              fontSize: '0.65rem',
              color: 'var(--accent-color)',
            }}>
              {sources.length}
            </span>
          )}
        </h3>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {!isConnected ? (
            <button onClick={handleConnectGoogle} className="btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
              <Link2 size={12} style={{ marginRight: '0.2rem' }} />
              Google連携
            </button>
          ) : (
            <button
              onClick={() => { setShowDocPicker(!showDocPicker); if (!showDocPicker) fetchGoogleDocs(); }}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.75rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <Search size={12} />
              Driveから追加
            </button>
          )}
        </div>
      </div>

      {/* ヒント */}
      {sources.length === 0 && isConnected && (
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem', lineHeight: 1.4 }}>
          上の「Driveから追加」でキーワード検索、またはチャットで「○○に関するドキュメントを取り込んで」と指示できます
        </p>
      )}

      {!isConnected && (
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
          Googleを連携するとドキュメントをソースとして追加できます。チャットから「ドキュメントを全件読み込んで」等の指示も可能です
        </p>
      )}

      {errorMessage && (
        <p style={{ fontSize: '0.7rem', color: '#f87171', margin: '0.3rem 0 0' }}>
          {errorMessage}
        </p>
      )}

      {/* 連携済みソース一覧 */}
      {sources.length > 0 && (
        <button
          onClick={() => setShowSourceList(!showSourceList)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.4rem 0.5rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.75rem',
            marginBottom: showSourceList ? '0.4rem' : 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <FileText size={12} style={{ color: 'var(--accent-color)' }} />
            ドキュメント一覧
          </span>
          <ChevronDown size={12} style={{ transform: showSourceList ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}

      <AnimatePresence>
        {showSourceList && sources.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '200px', overflowY: 'auto' }}>
              {sources.map((source) => (
                <div
                  key={source.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.4rem 0.6rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px',
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                    <FileText size={12} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.75rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {source.source_name}
                      </p>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Clock size={8} />
                        {formatTime(source.last_synced_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSync(source.id)}
                    disabled={syncing === source.id}
                    style={{
                      padding: '0.2rem 0.4rem',
                      background: 'transparent',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      cursor: syncing === source.id ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      fontSize: '0.65rem',
                    }}
                  >
                    {syncing === source.id ? (
                      <Loader2 className="animate-spin" size={10} />
                    ) : (
                      <RefreshCw size={10} />
                    )}
                    同期
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Driveからドキュメント検索・追加 */}
      <AnimatePresence>
        {showDocPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginTop: '0.5rem', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Filter size={12} />
                Driveから検索
              </h4>
              <button
                onClick={() => setShowDocPicker(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <input
                type="text"
                placeholder="キーワードで検索..."
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length > 2 || v.length === 0) fetchGoogleDocs(v || undefined);
                }}
                style={{
                  flex: 1,
                  padding: '0.3rem 0.6rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.8rem',
                }}
              />
            </div>
            {searchLoading ? (
              <div style={{ textAlign: 'center', padding: '0.8rem' }}>
                <Loader2 className="animate-spin" size={16} />
              </div>
            ) : (
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {googleDocs.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.4rem 0.6rem',
                      background: doc.is_synced ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255,255,255,0.02)',
                      borderRadius: '6px',
                      border: '1px solid var(--glass-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                      {doc.is_synced ? (
                        <CheckCircle2 size={12} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                      ) : (
                        <FileText size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.name}
                      </span>
                    </div>
                    {!doc.is_synced && (
                      <button
                        onClick={() => handleAddSource(doc)}
                        style={{
                          padding: '0.15rem 0.4rem',
                          fontSize: '0.7rem',
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
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {formatTime(doc.last_synced_at)}
                      </span>
                    )}
                  </div>
                ))}
                {googleDocs.length === 0 && !errorMessage && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0.5rem' }}>
                    ドキュメントが見つかりません
                  </p>
                )}
                {errorMessage && (
                  <p style={{ fontSize: '0.75rem', color: '#f87171', textAlign: 'center', padding: '0.5rem' }}>
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
