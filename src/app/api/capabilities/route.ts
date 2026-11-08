import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { applyCapabilityFeedback, createCapability, matchCapabilities, toCapability } from '@/lib/capability/matcher';
import type { CapabilityResource, RegisterCapabilityRequest } from '@/lib/types/capability';

const VALID_RESOURCE_TYPES = ['time', 'money', 'skill', 'tool', 'connection'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_resources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const resources = (data || []) as CapabilityResource[];
    const url = new URL(req.url);
    const label = url.searchParams.get('label') ?? url.searchParams.get('q') ?? '';
    const tags = (url.searchParams.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const maxCost = parseNumber(url.searchParams.get('max_cost'));
    const minReliability = parseNumber(url.searchParams.get('min_reliability'));
    const limit = parseNumber(url.searchParams.get('limit'));
    const shouldMatch = label.trim() !== '' || tags.length > 0 || maxCost !== undefined || minReliability !== undefined;

    if (!shouldMatch) {
      return NextResponse.json(
        resources.map((resource) => ({
          ...resource,
          capability: toCapability(resource.metadata, { label: resource.name }),
        })),
      );
    }

    const need = {
      label,
      tags,
      max_cost: maxCost,
      min_reliability: minReliability,
      limit,
    };

    return NextResponse.json({ need, candidates: matchCapabilities(need, resources) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as RegisterCapabilityRequest;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const resourceType = body?.resource_type;
    const capabilityLabel = typeof body?.capability?.label === 'string' ? body.capability.label.trim() : '';

    if (!name || !capabilityLabel) {
      return NextResponse.json({ error: 'name and capability.label are required' }, { status: 400 });
    }
    if (!VALID_RESOURCE_TYPES.includes(resourceType)) {
      return NextResponse.json(
        { error: `Invalid resource_type. Must be one of: ${VALID_RESOURCE_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const capability = createCapability(body.capability, name);

    const { data, error } = await supabase
      .from('user_resources')
      .insert({
        user_id: user.id,
        resource_type: resourceType,
        name,
        description: body.description ?? null,
        metadata: { capability },
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const resourceId = typeof body?.resource_id === 'string' ? body.resource_id : '';
    const success = body?.success === true;

    if (!resourceId || typeof body?.success !== 'boolean') {
      return NextResponse.json({ error: 'resource_id and success are required' }, { status: 400 });
    }

    const { data: resource, error: resourceError } = await supabase
      .from('user_resources')
      .select('*')
      .eq('id', resourceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (resourceError) throw resourceError;
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const capability = applyCapabilityFeedback(
      toCapability(resource.metadata, { label: resource.name }),
      { success, note: typeof body.note === 'string' ? body.note : undefined },
    );
    const metadata = isRecord(resource.metadata) ? { ...resource.metadata, capability } : { capability };

    const { data, error } = await supabase
      .from('user_resources')
      .update({ metadata })
      .eq('id', resourceId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
