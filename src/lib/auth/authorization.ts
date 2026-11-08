export const AUTH_ROLES = ['guest', 'user', 'operator', 'admin'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const AUTH_PERMISSIONS = [
  'self:read', 'self:write', 'ideas:read', 'ideas:write', 'sharing:read',
  'sharing:write', 'cloud:run', 'proxy:act', 'admin:read', 'admin:write',
] as const;

export type AuthPermission = (typeof AUTH_PERMISSIONS)[number];

const USER_PERMISSIONS: readonly AuthPermission[] = [
  'self:read', 'self:write', 'ideas:read', 'ideas:write',
  'sharing:read', 'sharing:write', 'cloud:run',
];

const ROLE_PERMISSIONS: Record<AuthRole, readonly AuthPermission[]> = {
  guest: [],
  user: USER_PERMISSIONS,
  operator: [...USER_PERMISSIONS, 'proxy:act'],
  admin: AUTH_PERMISSIONS,
};

const PERMISSION_SET = new Set<string>(AUTH_PERMISSIONS);

export function isAuthPermission(value: unknown): value is AuthPermission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

export function normalizeAuthRole(value: unknown): AuthRole {
  if (typeof value !== 'string') return 'user';
  const normalized = value.trim().toLowerCase();
  return (AUTH_ROLES as readonly string[]).includes(normalized)
    ? (normalized as AuthRole)
    : 'user';
}

export function permissionsForRole(role: AuthRole): AuthPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export interface ProxyGrant {
  id: string;
  subject_id: string;
  actor_id: string;
  permissions: readonly AuthPermission[];
  expires_at?: string | null;
  revoked_at?: string | null;
}

export interface AuthorizationUser {
  id: string;
  role?: unknown;
  isAdmin?: boolean;
}

export interface Authorization {
  actor_id: string;
  subject_id: string;
  role: AuthRole;
  is_admin: boolean;
  is_proxy: boolean;
  proxy_grant_id: string | null;
  permissions: AuthPermission[];
}

export function isActiveProxyGrant(grant: ProxyGrant, now: Date = new Date()): boolean {
  if (grant.revoked_at) return false;
  if (!grant.expires_at) return true;
  const expiresAt = Date.parse(grant.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function resolveAuthorization(
  user: AuthorizationUser,
  options: { proxyGrant?: ProxyGrant | null; now?: Date } = {},
): Authorization {
  const now = options.now ?? new Date();
  const role: AuthRole = user.isAdmin ? 'admin' : normalizeAuthRole(user.role);
  const permissions = permissionsForRole(role);
  const grant = options.proxyGrant ?? null;
  const isProxy = Boolean(
    grant &&
      permissions.includes('proxy:act') &&
      grant.actor_id === user.id &&
      grant.subject_id !== user.id &&
      isActiveProxyGrant(grant, now),
  );

  if (grant && isProxy) {
    const granted = new Set(grant.permissions.filter(isAuthPermission));
    return {
      actor_id: user.id,
      subject_id: grant.subject_id,
      role,
      is_admin: role === 'admin',
      is_proxy: true,
      proxy_grant_id: grant.id,
      permissions: permissions.filter((permission) => granted.has(permission)),
    };
  }

  return {
    actor_id: user.id,
    subject_id: user.id,
    role,
    is_admin: role === 'admin',
    is_proxy: false,
    proxy_grant_id: null,
    permissions,
  };
}

export function can(authorization: Authorization, permission: AuthPermission): boolean {
  return authorization.permissions.includes(permission);
}

export const DEFAULT_SESSION_MAX_AGE_MINUTES = 12 * 60;
export const DEFAULT_REAUTH_WINDOW_MINUTES = 15;

export type SessionFreshnessReason = 'fresh' | 'reauth_required' | 'expired' | 'unknown';

export interface SessionFreshness {
  age_minutes: number | null;
  expired: boolean;
  requires_reauth: boolean;
  reason: SessionFreshnessReason;
}

export function evaluateSessionFreshness(input: {
  authenticatedAt?: string | Date | null;
  now?: Date;
  maxAgeMinutes?: number;
  reauthWindowMinutes?: number;
}): SessionFreshness {
  const nowMs = (input.now ?? new Date()).getTime();
  const authenticatedMs = input.authenticatedAt
    ? (input.authenticatedAt instanceof Date
        ? input.authenticatedAt.getTime()
        : new Date(input.authenticatedAt).getTime())
    : NaN;

  if (!Number.isFinite(authenticatedMs)) {
    return { age_minutes: null, expired: false, requires_reauth: true, reason: 'unknown' };
  }

  const maxAgeMinutes = input.maxAgeMinutes ?? DEFAULT_SESSION_MAX_AGE_MINUTES;
  const reauthWindowMinutes = input.reauthWindowMinutes ?? DEFAULT_REAUTH_WINDOW_MINUTES;
  const ageMinutes = Math.max(0, (nowMs - authenticatedMs) / 60_000);

  if (ageMinutes >= maxAgeMinutes) {
    return { age_minutes: ageMinutes, expired: true, requires_reauth: true, reason: 'expired' };
  }
  if (ageMinutes >= reauthWindowMinutes) {
    return {
      age_minutes: ageMinutes,
      expired: false,
      requires_reauth: true,
      reason: 'reauth_required',
    };
  }

  return { age_minutes: ageMinutes, expired: false, requires_reauth: false, reason: 'fresh' };
}
