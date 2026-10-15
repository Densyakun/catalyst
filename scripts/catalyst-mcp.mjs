import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * Catalyst エージェント用 MCP サーバー（stdio）。
 *
 * 既存の REST エージェントAPI (/api/agent/*) を MCP ツールとして公開する。
 * エージェント（opencode 等）はこれを通じて Catalyst のデータを読み書きできる。
 *
 * 必要な環境変数:
 *   CATALYST_BASE_URL  Catalyst のURL（既定: http://localhost:3000）
 *   CATALYST_TOKEN     Catalyst のユーザーAPIトークン（cat_...）
 */

const BASE = (process.env.CATALYST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.CATALYST_TOKEN || '';

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`Catalyst API ${res.status}: ${detail}`);
  }
  return data;
}

const TOOLS = [
  {
    name: 'list_proposals',
    description:
      'Catalyst の改善提案を取得する。Issue化すべき提案（既定: approved）や、実装中の提案を一覧できる。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'],
          description: '絞り込むステータス（既定: approved）',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_proposal_context',
    description:
      '提案1件と、その根拠となる Catalyst データ（ユーザーの不満・欲求・課題・統計）を取得する。Issue本文の作成に使う。',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: '改善提案のUUID' },
      },
      required: ['proposal_id'],
    },
  },
  {
    name: 'report_result',
    description:
      'Issue/PR の結果を Catalyst に報告する。提案のステータスを更新し、ユーザーへ通知を作成する。',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        state: {
          type: 'string',
          description: 'GitHub側の状態（open / merged / closed など）。ステータスへ自動マップされる。',
        },
        issue_number: { type: 'number' },
        issue_url: { type: 'string' },
        repo: { type: 'string', description: 'owner/repo' },
        pr_url: { type: 'string' },
        summary: { type: 'string', description: 'ユーザー向けの報告文' },
        notify: { type: 'boolean', description: 'ユーザーへ通知するか（既定: true）' },
      },
      required: ['proposal_id'],
    },
  },
];

const server = new Server(
  { name: 'catalyst', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};
  try {
    let result;
    if (name === 'list_proposals') {
      const status = args.status || 'approved';
      result = await api(`/api/agent/context?status=${encodeURIComponent(status)}`);
    } else if (name === 'get_proposal_context') {
      result = await api(`/api/agent/context?proposal_id=${encodeURIComponent(args.proposal_id)}`);
    } else if (name === 'report_result') {
      result = await api('/api/agent/report', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    } else {
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: 'Error: ' + (error?.message || String(error)) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
