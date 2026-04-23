import { NextResponse } from 'next/server';
import { executeAction } from '@/lib/ai/agents/executor';

export async function POST(req: Request) {
  try {
    const { action, problem } = await req.json();

    const result = await executeAction(action, problem);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Execute API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
