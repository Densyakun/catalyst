export type ShareType = 'money' | 'resource' | 'api' | 'mcp';
export type ShareStatus = 'active' | 'revoked' | 'expired' | 'exhausted';
export type SharePermission = 'read' | 'execute';
export type ShareGrantStatus = 'active' | 'revoked' | 'expired';

export interface ResourceShare {
  id: string;
  owner_id: string;
  resource_id: string | null;
  purpose_id: string | null;
  shared_idea_id: string | null;
  share_type: ShareType;
  title: string;
  description: string | null;
  amount_limit: number;
  amount_used: number;
  permissions: SharePermission[];
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  access_code_prefix: string;
  status: ShareStatus;
  created_at: string;
  updated_at: string;
}

export interface ResourceShareGrant {
  id: string;
  share_id: string;
  grantee_id: string;
  status: ShareGrantStatus;
  amount_used: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShareEvent {
  id: string;
  share_id: string;
  grant_id: string | null;
  actor_id: string | null;
  action: string;
  amount: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SharedResourceInfo {
  id: string;
  name: string;
  description: string | null;
  resource_type: string;
}

export interface ShareUseResult {
  allowed: boolean;
  reason?: string;
  share_id: string;
  remaining_amount?: number;
  remaining_uses?: number;
  resource?: SharedResourceInfo | null;
}

export interface ReceivedShare {
  share: ResourceShare;
  grant: ResourceShareGrant;
}

export interface SharingSnapshot {
  owned: ResourceShare[];
  received: ReceivedShare[];
}
