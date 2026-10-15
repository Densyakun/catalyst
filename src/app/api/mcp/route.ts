import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { listProposals, getProposalContext, reportResult } from '@/lib/agent-tools';
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
      'Catalyst の改善提案を取得する。Issue化・実装の対象となる提案（既定: approved）を一覧できる。',
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
      '提案1件と、根拠となる Catalyst データ（ユーザーの不満・欲求・課題・統計）を取得する。',
    inputSchema: {
      type: 'object',
      properties: { proposal_id: { type: 'string', description: '改善提案のUUID' } },
      required: ['proposal_id'],
    },
  },
  {
    name: 'report_result',
    description:
      '実装などの結果を Catalyst に報告する。提案のステータスを更新し、ユーザーへ通知を作成する。',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        state: { type: 'string', description: 'open / in_progress / merged / implemented / rejected など' },
        issue_number: { type: 'number' },
        issue_url: { type: 'string' },
        repo: { type: 'string' },
        pr_url: { type: 'string' },
        summary: { type: 'string', description: 'ユーザー向けの報告文' },
        notify: { type: 'boolean', description: 'ユーザーへ通知するか（既定: true）' },
      },
      required: ['proposal_id'],
    },
  },
];

function buildServer(userId: string, supabase: SupabaseClient): Server {
  const server = new Server(
    { name: 'catalyst', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: 'Catalyst のデータを読み書きするツール群です。' },
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
