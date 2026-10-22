#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * Catalyst エージェント用 MCP サーバー（stdio）。
 * 既存の REST エージェントAPI (/api/agent/*) をMCPツールとして公開する。
 *
 * 環境変数（または設定ファイル）:
 *   CATALYST_BASE_URL  Catalyst のURL（既定 http://localhost:3000）
 *   CATALYST_TOKEN     Catalyst のユーザーAPIトークン（cat_...）
 *   CATALYST_MCP_CONFIG 設定ファイルのパス（省略時 ~/.config/opencode/catalyst-mcp.json）
 */

function loadConfig() {
  const configPath =
    process.env.CATALYST_MCP_CONFIG ||
    path.join(os.homedir(), '.config', 'opencode', 'catalyst-mcp.json');
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    // 設定ファイルは任意
  }
  const baseUrl = process.env.CATALYST_BASE_URL || fileConfig.baseUrl || fileConfig.base_url || 'http://localhost:3000';
  const token = process.env.CATALYST_TOKEN || fileConfig.token || '';
  return { baseUrl: String(baseUrl).replace(/\/$/, ''), token };
}

const { baseUrl: BASE, token: TOKEN } = loadConfig();

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
      'Catalyst の改善提案を取得する。Issue化すべき提案（既に approved など）や、実装済みの提案を一覧できる。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'],
          description: '絞り込むステータス（既定 approved）',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_proposal_context',
    description:
      '提案1件と、その根拠となるCatalystデータ（ユーザーの不満・欲求・課題・統計）を取得する。Issue本文の作成に使う。',
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
          description: 'GitHub側の状態（open / merged / closed など）。ステータスへ自動マッピングされる。',
        },
        issue_number: { type: 'number' },
        issue_url: { type: 'string' },
        repo: { type: 'string', description: 'owner/repo' },
        pr_url: { type: 'string' },
        summary: { type: 'string', description: 'ユーザー向けの報告文' },
        notify: { type: 'boolean', description: 'ユーザーへ通知するか（既定 true）' },
      },
      required: ['proposal_id'],
    },
  },
  {
    name: 'list_problems',
    description: 'Catalyst の課題（problems）を一覧する。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'unsolved / solved などで絞り込む' },
        limit: { type: 'number', description: '取得件数（既定50、最大200）' },
      },
      required: [],
    },
  },
  {
    name: 'create_problem',
    description: 'Catalyst に課題（problem）を登録する。構想・要望の移行に使う。',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', description: '課題の文脈・概要' },
        symptoms: { type: 'string', description: '発生している症状' },
        constraints: { type: 'string', description: '制約条件' },
        goal: { type: 'string', description: '達成したいゴール' },
        severity: { type: 'number', description: '深刻度 1-10' },
        frequency: { type: 'string', description: '発生頻度' },
        priority: { type: 'number', description: '優先度' },
        tags: { type: 'array', items: { type: 'string' }, description: 'タグ' },
        status: { type: 'string', description: 'unsolved / solved（既定 unsolved）' },
      },
      required: ['context'],
    },
  },
  {
    name: 'list_projects',
    description: 'Catalyst のプロジェクトを一覧する。',
    inputSchema: {
      type: 'object',
      properties: {
        with_tasks: { type: 'boolean', description: 'タスクも含める' },
        limit: { type: 'number', description: '取得件数（既定50、最大200）' },
      },
      required: [],
    },
  },
  {
    name: 'create_project',
    description: 'Catalyst にプロジェクトとタスクを作成する。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'プロジェクト名' },
        description: { type: 'string', description: '説明' },
        is_social: { type: 'boolean', description: '社会課題か' },
        estimated_beneficiaries: { type: 'number', description: '想定受益者数' },
        status: { type: 'string', enum: ['planning', 'in_progress', 'completed', 'on_hold'] },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              estimated_cost: { type: 'number' },
              execution_type: { type: 'string', enum: ['auto', 'user', 'hybrid'] },
              depends_on_indices: {
                type: 'array',
                items: { type: 'number' },
                description: '依存するタスクの配列インデックス',
              },
              sort_order: { type: 'number' },
              status: {
                type: 'string',
                enum: ['pending', 'ready', 'in_progress', 'completed', 'blocked'],
              },
            },
            required: ['title'],
          },
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_resources',
    description: 'Catalyst のユーザーリソースを一覧する。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '取得件数（既定50、最大200）' },
      },
      required: [],
    },
  },
  {
    name: 'create_resource',
    description: 'Catalyst にユーザーリソース（時間・金・スキル・道具・人脈）を登録する。',
    inputSchema: {
      type: 'object',
      properties: {
        resource_type: {
          type: 'string',
          enum: ['time', 'money', 'skill', 'tool', 'connection'],
        },
        name: { type: 'string' },
        description: { type: 'string' },
        metadata: { type: 'object', description: '任意のメタデータ' },
      },
      required: ['resource_type', 'name'],
    },
  },
  {
    name: 'create_proposal',
    description: 'Catalyst に改善提案（evolution_proposals）を登録する。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: { type: 'string', enum: ['feature', 'ux', 'bug', 'performance', 'content'] },
        rationale: { type: 'string', description: '提案の根拠' },
        target_area: { type: 'string', description: '対象画面・機能' },
        proposed_change: { type: 'string', description: '具体的な変更内容' },
        priority: { type: 'number', description: '0-1' },
        evidence: { type: 'array', items: { type: 'string' } },
        status: {
          type: 'string',
          enum: ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'],
        },
      },
      required: ['title', 'rationale'],
    },
  },
  {
    name: 'run_evolution_analysis',
    description:
      'Catalyst の自己進化分析を実行する。ユーザーのフィードバック・操作ログ・課題から改善提案を生成して保存する。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_proposal_status',
    description: '改善提案のステータスを更新する（承認・実装中・実装済・却下）。',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string', description: '改善提案のUUID' },
        status: {
          type: 'string',
          enum: ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'],
        },
      },
      required: ['proposal_id', 'status'],
    },
  },
];

const server = new Server(
  { name: 'catalyst', version: '1.1.0' },
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
      result = await api(`/api/agent/proposals?status=${encodeURIComponent(status)}`);
    } else if (name === 'get_proposal_context') {
      result = await api(`/api/agent/context?proposal_id=${encodeURIComponent(args.proposal_id)}`);
    } else if (name === 'report_result') {
      result = await api('/api/agent/report', {
        method: 'POST',
        body: JSON.stringify(args),
      });
    } else if (name === 'list_problems') {
      const params = new URLSearchParams();
      if (args.status) params.set('status', String(args.status));
      if (args.limit) params.set('limit', String(args.limit));
      result = await api(`/api/agent/problems?${params.toString()}`);
    } else if (name === 'create_problem') {
      result = await api('/api/agent/problems', { method: 'POST', body: JSON.stringify(args) });
    } else if (name === 'list_projects') {
      const params = new URLSearchParams();
      if (args.with_tasks) params.set('with_tasks', '1');
      if (args.limit) params.set('limit', String(args.limit));
      result = await api(`/api/agent/projects?${params.toString()}`);
    } else if (name === 'create_project') {
      result = await api('/api/agent/projects', { method: 'POST', body: JSON.stringify(args) });
    } else if (name === 'list_resources') {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', String(args.limit));
      result = await api(`/api/agent/resources?${params.toString()}`);
    } else if (name === 'create_resource') {
      result = await api('/api/agent/resources', { method: 'POST', body: JSON.stringify(args) });
    } else if (name === 'create_proposal') {
      result = await api('/api/agent/proposals', { method: 'POST', body: JSON.stringify(args) });
    } else if (name === 'run_evolution_analysis') {
      result = await api('/api/agent/evolution/analyze', { method: 'POST', body: JSON.stringify({}) });
    } else if (name === 'update_proposal_status') {
      result = await api(`/api/agent/proposals/${encodeURIComponent(args.proposal_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: args.status }),
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
