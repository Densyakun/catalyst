import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // 最新の20件の課題を取得（アクションも含めて取得）
    const { data: problems, error } = await supabase
      .from('problems')
      .select(`
        *,
        actions (*)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json(problems);
  } catch (error: any) {
    console.error('History fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
