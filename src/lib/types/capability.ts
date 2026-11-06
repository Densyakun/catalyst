export type CapabilityAvailabilityStatus = 'available' | 'limited' | 'unavailable';

export interface CapabilityCost {
  amount: number;
  unit: string;
  note?: string;
}

export interface CapabilityAvailability {
  status: CapabilityAvailabilityStatus;
  hours_per_week?: number;
  note?: string;
}

export interface Capability {
  label: string;
  tags: string[];
  constraints: string[];
  cost: CapabilityCost | null;
  availability: CapabilityAvailability | null;
  reliability: number;
  execution_count: number;
  success_count: number;
  last_note?: string;
  updated_at?: string;
}

export interface CapabilityResource {
  id: string;
  name: string;
  resource_type: string;
  description?: string | null;
  metadata?: unknown;
}

export interface CapabilityNeed {
  label: string;
  tags?: string[];
  max_cost?: number;
  min_reliability?: number;
  limit?: number;
}

export interface CapabilityCandidate {
  resource_id: string;
  name: string;
  resource_type: string;
  description: string | null;
  capability: Capability;
  score: number;
  rationale: string[];
  warnings: string[];
}

export interface CapabilityFeedback {
  success: boolean;
  note?: string;
}

export interface RegisterCapabilityRequest {
  resource_type: string;
  name: string;
  description?: string;
  capability: Partial<Capability> & { label: string };
}
