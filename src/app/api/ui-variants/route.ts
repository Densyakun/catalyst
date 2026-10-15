import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateUIVariant } from '@/lib/ai/agents/evolution';
import { collectEvolutionSignals } from '@/lib/evolution/signals';
import type { GenerateUIVariantRequest } from '@/lib/types/evolution';

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

    const signals = await collectEvolutionSignals(supabase, user.id);
    const draft = await generateUIVariant({ area, instruction: body.instruction, signals });

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
