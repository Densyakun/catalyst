import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  listProposals,
  getProposalContext,
  reportResult,
  listProblems,
  createProblem,
  listProjects,
  createProject,
  listResources,
  createResource,
  createProposal,
  updateProposalStatus,
  type CreateProblemInput,
  type CreateProjectInput,
  type CreateProposalInput,
  type CreateResourceInput,
} from '@/lib/agent-tools';
import { runEvolutionAnalysis } from '@/lib/evolution/run';
import type { AgentReportRequest, ProposalStatus } from '@/lib/types/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Last-Event-ID',
};

const TOOLS = [
  {
    name: 'list_proposals',
    description:
      'Katalyse の改善提案を取得する。Issue化・実装の対象となる提案（既定: approved）を一覧できる。',
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
      '提案1件と、根拠となる Katalyse データ（ユーザーの不満・欲求・課題・統計）を取得する。',
    inputSchema: {
      type: 'object',
      properties: { proposal_id: { type: 'string', description: '改善提案のUUID' } },
      required: ['proposal_id'],
    },
  },
  {
    name: 'report_result',
    description:
      '実装などの結果を Katalyse に報告する。提案のステータスを更新し、ユーザーへ通知を作成する。',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        state: { type: 'string', description: 'open / in_progress / merged / implemented / rejected など' },
        issue_number: { type: 'number' },
        issue_url: { type: 'string' },
        repo: { type: 'string' },
        pr_url: { type: 'string' },
        summary: { type: 'string', description: 'ユーザー向けの報告文（通知の概要）' },
        detail: { type: 'string', description: '通知に表示する詳細な説明（省略時は summary と提案内容）' },
        notify: { type: 'boolean', description: 'ユーザーへ通知するか（既定: true）' },
      },
      required: ['proposal_id'],
    },
  },
  {
    name: 'list_problems',
    description: 'Katalyse の課題（problems）を一覧する。',
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
    description: 'Katalyse に課題（problem）を登録する。構想・要望の移行に使う。',
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
    description: 'Katalyse のプロジェクトを一覧する。',
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
    description: 'Katalyse にプロジェクトとタスクを作成する。',
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
    description: 'Katalyse のユーザーリソースを一覧する。',
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
    description: 'Katalyse にユーザーリソース（時間・金・スキル・道具・人脈）を登録する。',
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
    description: 'Katalyse に改善提案（evolution_proposals）を登録する。',
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
      'Katalyse の自己進化分析を実行する。ユーザーのフィードバック・操作ログ・課題から改善提案を生成して保存する。',
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

function buildServer(userId: string, supabase: SupabaseClient): Server {
  const server = new Server(
    { name: 'catalyst', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: 'Katalyse のデータを読み書きするツール群です。' },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments || {}) as Record<string, unknown>;
    try {
      let result: unknown;
      if (name === 'list_proposals') {
        const status = (args.status as ProposalStatus) || 'approved';
        result = { proposals: await listProposals(supabase, userId, status) };
      } else if (name === 'get_proposal_context') {
        result = await getProposalContext(supabase, userId, String(args.proposal_id));
      } else if (name === 'report_result') {
        result = await reportResult(supabase, userId, args as unknown as AgentReportRequest);
      } else if (name === 'list_problems') {
        result = {
          problems: await listProblems(supabase, userId, {
            status: args.status as string | undefined,
            limit: args.limit as number | undefined,
          }),
        };
      } else if (name === 'create_problem') {
        result = { ok: true, problem: await createProblem(supabase, userId, args as unknown as CreateProblemInput) };
      } else if (name === 'list_projects') {
        result = {
          projects: await listProjects(supabase, userId, {
            withTasks: args.with_tasks === true,
            limit: args.limit as number | undefined,
          }),
        };
      } else if (name === 'create_project') {
        result = { ok: true, project: await createProject(supabase, userId, args as unknown as CreateProjectInput) };
      } else if (name === 'list_resources') {
        result = {
          resources: await listResources(supabase, userId, { limit: args.limit as number | undefined }),
        };
      } else if (name === 'create_resource') {
        result = { ok: true, resource: await createResource(supabase, userId, args as unknown as CreateResourceInput) };
      } else if (name === 'create_proposal') {
        result = { ok: true, proposal: await createProposal(supabase, userId, args as unknown as CreateProposalInput) };
      } else if (name === 'run_evolution_analysis') {
        result = await runEvolutionAnalysis(supabase, userId);
      } else if (name === 'update_proposal_status') {
        result = {
          ok: true,
          proposal: await updateProposalStatus(
            supabase,
            userId,
            String(args.proposal_id),
            args.status as ProposalStatus,
          ),
        };
      } else {
        return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  });

  return server;
}

export async function POST(req: Request): Promise<Response> {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof Response) return withCors(auth);

  try {
    const supabase = createAdminClient();
    const server = buildServer(auth.userId, supabase);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    return withCors(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('MCP error:', error);
    return withCors(
      new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
}

export async function GET(): Promise<Response> {
  return withCors(
    new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    }),
  );
}

export async function OPTIONS(): Promise<Response> {
  return withCors(new Response(null, { status: 204 }));
}

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
