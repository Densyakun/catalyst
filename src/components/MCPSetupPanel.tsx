'use client';

import { useState } from 'react';
import { Plug, Copy, Check, Bot } from 'lucide-react';

/**
 * MCPSetupPanel:
 * Catalyst の MCP を「誰でも」使えるように、接続方法と開始プロンプトをアプリ内で案内する。
 * トークンは APITokensPanel で発行する（本文中の cat_... を置き換える）。
 */
export default function MCPSetupPanel() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const mcpUrl = 'https://<your-catalyst>/api/mcp';

  const configSnippet = `{
  "mcp": {
    "catalyst": {
      "type": "remote",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer cat_xxxxxxxx" },
      "enabled": true
    }
  }
}`;

  const promptSnippet = `あなたは私のローカルにある Catalyst のコードベース（現在のディレクトリ）を開発するエージェントです。
Catalyst の MCP ツール（run_evolution_analysis / list_proposals / get_proposal_context / update_proposal_status / report_result）を使えます。

1. run_evolution_analysis で自己進化の分析を実行してください。
2. list_proposals で提案を取得し、優先度の高い順に一覧で見せてください。
3. 私が選んだ提案について get_proposal_context で根拠と関連データを確認し、ローカルのコードを実装してください。
4. 実装できたら report_result で state（例: in_progress / implemented）と summary を報告してください。

まずは提案一覧を提示し、どれから着手するか私に確認してください。`;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // クリップボード不可の環境では手動コピー
    }
  };

  return (
    <section className="glass-panel" style={{ padding: '0.8rem' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', background: 'none', color: 'white', padding: 0 }}
      >
        <Plug size={14} className="text-accent" />
        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>MCPで使う</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{open ? '閉じる' : '使い方'}</span>
      </button>

      {open && (
        <div style={{ marginTop: '0.6rem' }}>
          <ol style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.1rem' }}>
            <li>上の「APIトークン」でトークンを発行（<code>cat_...</code>）</li>
            <li>エージェントの MCP 設定に Catalyst を追加（下のJSON）</li>
            <li>エージェントに下のプロンプトを貼って開始</li>
          </ol>
          <p style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
            エンドポイント: <code>/api/mcp</code>（自分の Catalyst のURLを前置。HTTPヘッダに <code>Authorization: Bearer cat_...</code>）
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.5rem 0 0.25rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>MCP接続設定（HTTP）</span>
            <button onClick={() => copy('config', configSnippet)} style={{ background: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              {copied === 'config' ? <Check size={11} /> : <Copy size={11} />} コピー
            </button>
          </div>
          <pre style={{ fontSize: '0.62rem', background: 'rgba(0,0,0,0.35)', padding: '0.5rem', borderRadius: '8px', overflowX: 'auto', whiteSpace: 'pre', maxWidth: '100%' }}>{configSnippet}</pre>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.6rem 0 0.25rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Bot size={12} /> 開始プロンプト
            </span>
            <button onClick={() => copy('prompt', promptSnippet)} style={{ background: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              {copied === 'prompt' ? <Check size={11} /> : <Copy size={11} />} コピー
            </button>
          </div>
          <pre style={{ fontSize: '0.62rem', background: 'rgba(0,0,0,0.35)', padding: '0.5rem', borderRadius: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto', maxWidth: '100%' }}>{promptSnippet}</pre>

          <p style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.8 }}>
            セルフホストの場合はローカルMCP（<code>node scripts/catalyst-mcp.mjs</code>）でも接続できます。
          </p>
        </div>
      )}
    </section>
  );
}
