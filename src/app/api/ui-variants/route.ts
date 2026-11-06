import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateUIVariant, type UIVariantDraft } from '@/lib/ai/agents/evolution';
import { collectEvolutionSignals } from '@/lib/evolution/signals';
import type { GenerateUIVariantRequest } from '@/lib/types/evolution';
import {
  validateUIVariantCode,
  type UICodeValidationResult,
} from '@/lib/ui/safety';

const GENERATION_ATTEMPTS = 2;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

/**
 * 動的UIバリアント。
 *
 * GET  /api/ui-variants?area=xxx → 一覧
 * POST /api/ui-variants          → AIがUIバリアント(TSX)を生成し、ASTにコンパイルして保存
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const area = new URL(req.url).searchParams.get('area');
    let query = supabase
      .from('ui_variants')
      .select('id, name, area, description, status, performance, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (area) query = query.eq('area', area);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: unknown) {
    return errorResponse(error, 'UI variant list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as GenerateUIVariantRequest;
    const area = body?.area;
    if (!area) {
      return NextResponse.json({ error: 'area is required' }, { status: 400 });
    }

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: rateError } = await supabase
      .from('ui_variants')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if (rateError) throw rateError;
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: 'UI生成のリクエストが多すぎます。しばらく待ってから再試行してください。' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const signals = await collectEvolutionSignals(supabase, user.id);
    let draft: UIVariantDraft | null = null;
    let validation: UICodeValidationResult = { ok: false, errors: ['UIが生成されませんでした'] };
    let instruction = body.instruction;

    for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt += 1) {
      draft = await generateUIVariant({ area, instruction, signals });
      validation = validateUIVariantCode(draft.code);
      if (validation.ok) break;

      const feedback = validation.errors.join(' / ');
      instruction = `${instruction ? `${instruction}\n` : ''}前回の出力は安全性検証に失敗した。次を必ず修正せよ: ${feedback}`;
    }

    if (!draft || !validation.ok) {
      return NextResponse.json(
        {
          error: '生成されたUIが安全性検証に合格しませんでした',
          details: validation.errors,
        },
        { status: 422 },
      );
    }

    const { data, error } = await supabase
      .from('ui_variants')
      .insert({
        user_id: user.id,
        name: draft.name || `variant-${area}`,
        area,
        description: draft.description,
        code: draft.code,
        status: 'proposed',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: unknown) {
    return errorResponse(error, 'UI variant generate');
  }
}

function errorResponse(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
