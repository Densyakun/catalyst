import type {
  Capability,
  CapabilityAvailability,
  CapabilityAvailabilityStatus,
  CapabilityCandidate,
  CapabilityCost,
  CapabilityFeedback,
  CapabilityNeed,
  CapabilityResource,
} from '@/lib/types/capability';

const DEFAULT_RELIABILITY = 0.5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function toAvailability(value: unknown): CapabilityAvailability | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const availabilityStatus: CapabilityAvailabilityStatus =
    status === 'limited' || status === 'unavailable' ? status : 'available';
  const availability: CapabilityAvailability = { status: availabilityStatus };
  if (value.hours_per_week !== undefined) {
    availability.hours_per_week = toNumber(value.hours_per_week);
  }
  if (typeof value.note === 'string' && value.note.trim()) {
    availability.note = value.note.trim();
  }
  return availability;
}

function toCost(value: unknown): CapabilityCost | null {
  if (!isRecord(value)) return null;
  return {
    amount: Math.max(0, toNumber(value.amount)),
    unit: typeof value.unit === 'string' && value.unit.trim() ? value.unit.trim() : 'credit',
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim() } : {}),
  };
}

export function createCapability(input: Partial<Capability> | null | undefined, fallbackLabel: string): Capability {
  const source = input ?? {};
  const label = typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallbackLabel.trim();
  const executionCount = Math.max(0, Math.floor(toNumber(source.execution_count)));
  const successCount = Math.min(executionCount, Math.max(0, Math.floor(toNumber(source.success_count))));
  const reliability =
    source.reliability !== undefined
      ? clamp(toNumber(source.reliability, DEFAULT_RELIABILITY))
      : executionCount > 0
        ? clamp((successCount + 1) / (executionCount + 2))
        : DEFAULT_RELIABILITY;

  return {
    label,
    tags: unique(toStringArray(source.tags)),
    constraints: unique(toStringArray(source.constraints)),
    cost: toCost(source.cost),
    availability: toAvailability(source.availability),
    reliability: round(reliability),
    execution_count: executionCount,
    success_count: successCount,
    ...(typeof source.last_note === 'string' && source.last_note.trim() ? { last_note: source.last_note.trim() } : {}),
    ...(typeof source.updated_at === 'string' ? { updated_at: source.updated_at } : {}),
  };
}

export function toCapability(metadata: unknown, fallback: { label: string }): Capability {
  const source = isRecord(metadata) && isRecord(metadata.capability) ? metadata.capability : {};
  return createCapability(source, fallback.label);
}

export function applyCapabilityFeedback(capability: Capability, feedback: CapabilityFeedback): Capability {
  const executionCount = capability.execution_count + 1;
  const successCount = capability.success_count + (feedback.success ? 1 : 0);
  const reliability = clamp((successCount + 1) / (executionCount + 2));

  return {
    ...capability,
    reliability: round(reliability),
    execution_count: executionCount,
    success_count: successCount,
    ...(feedback.note && feedback.note.trim() ? { last_note: feedback.note.trim() } : {}),
    updated_at: new Date().toISOString(),
  };
}

function scoreCandidate(
  need: CapabilityNeed,
  resource: CapabilityResource,
  capability: Capability,
): { score: number; rationale: string[]; warnings: string[] } {
  const rationale: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  const needLabel = normalize(need.label);
  const capabilityText = normalize(
    [capability.label, resource.name, resource.description ?? ''].join(' '),
  );

  if (needLabel) {
    if (capabilityText.includes(needLabel)) {
      score += capabilityText === needLabel ? 0.45 : 0.3;
      rationale.push(`能力「${capability.label}」が課題「${need.label}」に一致`);
    } else {
      const words = needLabel.split(/\s+/).filter((word) => word.length >= 2);
      const matchedWords = words.filter((word) => capabilityText.includes(word));
      if (matchedWords.length > 0) {
        score += Math.min(0.2, matchedWords.length * 0.1);
        rationale.push(`キーワード一致: ${matchedWords.join(', ')}`);
      }
    }
  }

  const needTags = unique((need.tags ?? []).map(normalize).filter(Boolean));
  const capabilityTags = capability.tags.map(normalize);
  const matchedTags = needTags.filter((tag) => capabilityTags.includes(tag));
  if (matchedTags.length > 0) {
    score += Math.min(0.3, matchedTags.length * 0.15);
    rationale.push(`タグ一致: ${matchedTags.join(', ')}`);
  }

  if (capability.availability) {
    if (capability.availability.status === 'available') {
      score += 0.15;
      rationale.push('稼働可能');
    } else if (capability.availability.status === 'limited') {
      score += 0.05;
      warnings.push('稼働可能枠が限定的');
    } else {
      score -= 0.5;
      warnings.push('現在は稼働不可');
    }
  }

  if (need.max_cost !== undefined && Number.isFinite(need.max_cost)) {
    if (!capability.cost) {
      warnings.push('コスト情報が未登録');
    } else if (capability.cost.amount <= need.max_cost) {
      score += 0.15;
      rationale.push(`コスト ${capability.cost.amount}${capability.cost.unit} が上限内`);
    } else {
      score -= 0.25;
      warnings.push(`コスト ${capability.cost.amount}${capability.cost.unit} が上限超過`);
    }
  }

  score += capability.reliability * 0.2;
  rationale.push(`信頼スコア ${capability.reliability.toFixed(2)}`);

  if (capability.constraints.length > 0) {
    rationale.push(`制約: ${capability.constraints.join(', ')}`);
  }

  return { score: round(clamp(score)), rationale, warnings };
}

export function matchCapabilities(need: CapabilityNeed, resources: CapabilityResource[]): CapabilityCandidate[] {
  const minReliability = need.min_reliability;
  const limit = Math.max(1, Math.min(need.limit ?? 20, 100));

  return resources
    .map((resource) => {
      const capability = toCapability(resource.metadata, { label: resource.name });
      const { score, rationale, warnings } = scoreCandidate(need, resource, capability);
      const candidate: CapabilityCandidate = {
        resource_id: resource.id,
        name: resource.name,
        resource_type: resource.resource_type,
        description: resource.description ?? null,
        capability,
        score,
        rationale,
        warnings,
      };
      return candidate;
    })
    .filter((candidate) => minReliability === undefined || candidate.capability.reliability >= minReliability)
    .sort((a, b) => b.score - a.score || b.capability.reliability - a.capability.reliability || a.name.localeCompare(b.name))
    .slice(0, limit);
}
