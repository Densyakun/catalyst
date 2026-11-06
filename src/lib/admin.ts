import type { User } from '@supabase/supabase-js';
import { normalizeAuthRole } from '@/lib/auth/authorization';

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

type RoleMetadata = {
  app_metadata?: Record<string, unknown>;
};

export function isAdminUser(
  user: (Pick<User, 'id' | 'email'> & RoleMetadata) | null | undefined,
): boolean {
  if (!user) return false;

  const ids = list(process.env.ADMIN_USER_IDS);
  if (ids.includes(user.id.toLowerCase())) return true;

  const emails = list(process.env.ADMIN_EMAILS);
  if (user.email && emails.includes(user.email.toLowerCase())) return true;

  return normalizeAuthRole(user.app_metadata?.role) === 'admin';
}
