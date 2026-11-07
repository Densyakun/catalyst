'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export default function DataExportPanel() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const exportData = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await fetch('/api/export');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'エクスポートに失敗しました');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `katalyse-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem' }}>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>データのエクスポート</h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
        課題・アイデア・プロジェクト・資金履歴などをJSON形式でダウンロードできます。認証情報は含まれません。
      </p>
      <button
        type="button"
        onClick={() => void exportData()}
        disabled={exporting}
        className="btn-primary"
        style={{
          padding: '0.45rem 0.9rem',
          fontSize: '0.78rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          opacity: exporting ? 0.6 : 1,
        }}
      >
        {exporting ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
        {exporting ? 'エクスポート中...' : '自分のデータをダウンロード'}
      </button>
      {error && (
        <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '0.5rem' }}>{error}</p>
      )}
    </div>
  );
}
