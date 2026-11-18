import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_TEST_URL ?? '';
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '';
const enabled =
  process.env.SUPABASE_TEST_INTEGRATION === '1' &&
  Boolean(url && anonKey && serviceRoleKey);

describe.skipIf(!enabled)('Supabase RLS: problems', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `test-password-${suffix}`;
  const emailA = `rls-a-${suffix}@example.com`;
  const emailB = `rls-b-${suffix}@example.com`;
  const contextPrefix = `rls-test-${suffix}`;

  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let userAId = '';
  let userBId = '';
  let problemId = '';

  beforeAll(async () => {
    admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const createdA = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (createdA.error) throw createdA.error;
    userAId = createdA.data.user.id;

    const createdB = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (createdB.error) throw createdB.error;
    userBId = createdB.data.user.id;

    userA = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    userB = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const signInA = await userA.auth.signInWithPassword({ email: emailA, password });
    if (signInA.error) throw signInA.error;
    const signInB = await userB.auth.signInWithPassword({ email: emailB, password });
    if (signInB.error) throw signInB.error;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('problems').delete().like('context', `${contextPrefix}%`);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('lets the owner insert and read their own problem', async () => {
    const inserted = await userA
      .from('problems')
      .insert({ context: `${contextPrefix}-owned` })
      .select('id, user_id, context')
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data?.user_id).toBe(userAId);

    problemId = inserted.data?.id ?? '';

    const read = await userA.from('problems').select('id').eq('id', problemId).single();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(problemId);
  });

  it('hides the problem from another user', async () => {
    const read = await userB.from('problems').select('id').eq('id', problemId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
  });

  it('does not let another user update the problem', async () => {
    const updated = await userB
      .from('problems')
      .update({ context: `${contextPrefix}-hijacked` })
      .eq('id', problemId)
      .select('id');

    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([]);

    const stillOwned = await userA
      .from('problems')
      .select('context')
      .eq('id', problemId)
      .single();
    expect(stillOwned.data?.context).toBe(`${contextPrefix}-owned`);
  });

  it('rejects anonymous inserts', async () => {
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const inserted = await anon
      .from('problems')
      .insert({ context: `${contextPrefix}-anon` })
      .select('id');
    expect(inserted.error).not.toBeNull();
  });
});
