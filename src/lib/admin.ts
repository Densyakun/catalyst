import type { User } from '@supabase/supabase-js';

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user: Pick<User, 'id' | 'email'> & { user_metadata?: Record<string, unknown> } | null | undefined): boolean {
  if (!user) return false;

  const ids = list(process.env.ADMIN_USER_IDS);
  if (ids.includes(user.id.toLowerCase())) return true;

  const emails = list(process.env.ADMIN_EMAILS);
  if (user.email && emails.includes(user.email.toLowerCase())) return true;

  const role = user.user_metadata?.role;
  return typeof role === 'string' && role.toLowerCase() === 'admin';
}
