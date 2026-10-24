import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from '@/lib/notifications';
import { generateShareCode, hashShareCode } from '@/lib/sharing/code';
import type {
  ReceivedShare,
  ResourceShare,
  ResourceShareGrant,
  SharePermission,
  ShareType,
  ShareUseResult,
  SharingSnapshot,
} from '@/lib/types/sharing';

const VALID_PERMISSIONS: SharePermission[] = ['read', 'execute'];
const VALID_SHARE_TYPES: ShareType[] = ['money', 'resource', 'api', 'mcp'];

export class SharingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'SharingError';
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toSafeShare(row: Record<string, unknown>): ResourceShare {
  const safe = { ...row };
  delete safe.access_code_hash;
  return safe as unknown as ResourceShare;
}

function parsePositiveAmount(value: unknown): number | null {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return roundMoney(amount);
}

function isExpired(value: string | null): boolean {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function getAction(value: unknown): 'read' | 'execute' | 'use' {
  if (value === 'execute' || value === 'use') return value;
  return 'read';
}

async function logEvent(
  admin: SupabaseClient,
  params: {
    shareId: string;
    grantId?: string | null;
    actorId?: string | null;
    action: string;
    amount?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('resource_share_events').insert({
    share_id: params.shareId,
    grant_id: params.grantId ?? null,
    actor_id: params.actorId ?? null,
    action: params.action,
    amount: params.amount ?? null,
    metadata: params.metadata ?? {},
  });
}

function deny(
  admin: SupabaseClient,
  params: {
    shareId: string;
    grantId?: string | null;
    actorId: string;
    action: string;
    amount?: number | null;
    reason: string;
  },
): Promise<ShareUseResult> {
  return logEvent(admin, {
    shareId: params.shareId,
    grantId: params.grantId,
    actorId: params.actorId,
    action: 'denied',
    amount: params.amount,
    metadata: { requested_action: params.action, reason: params.reason },
  }).then(() => ({
    allowed: false,
    share_id: params.shareId,
    reason: params.reason,
  }));
}

async function getPurpose(admin: SupabaseClient, purposeId: string) {
  const { data } = await admin
    .from('fund_purposes')
    .select('id, name, owner_id, balance, status')
    .eq('id', purposeId)
    .maybeSingle();
  return data;
}

export interface CreateShareInput {
  share_type: ShareType;
  title?: string;
  description?: string;
  resource_id?: string | null;
  purpose_id?: string | null;
  shared_idea_id?: string | null;
  amount_limit?: number;
  permissions?: string[];
  max_uses?: number;
  expires_at?: string | null;
}

/**
 * 共有を作成する。資金共有の場合は所有者残高から目的資金へ移動する。
 * アクセスコードは発行時のみ返し、DBにはハッシュを保存する。
 */
export async function createShare(
  admin: SupabaseClient,
  ownerId: string,
  input: CreateShareInput,
): Promise<{ share: ResourceShare; access_code: string }> {
  const shareType = input.share_type;
  if (!VALID_SHARE_TYPES.includes(shareType)) {
    throw new SharingError('共有タイプが不正です');
  }

  const permissions = (input.permissions || ['read'])
    .filter((permission): permission is SharePermission => (
      VALID_PERMISSIONS.includes(permission as SharePermission)
    ));

  const maxUses = Number.isFinite(input.max_uses)
    ? Math.max(0, Math.floor(Number(input.max_uses)))
    : 0;
  const expiresAt = input.expires_at ? new Date(input.expires_at) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new SharingError('有効期限が不正です');
  }

  let title = (input.title || '').trim();
  let amountLimit = 0;
  let purposeId: string | null = null;
  let resourceId: string | null = null;

  if (shareType === 'money') {
    amountLimit = parsePositiveAmount(input.amount_limit) ?? 0;
    if (amountLimit <= 0) {
      throw new SharingError('共有する金額を指定してください');
    }
    purposeId = typeof input.purpose_id === 'string' ? input.purpose_id : null;
    if (!purposeId) {
      throw new SharingError('資金の共有先となる目的を選択してください');
    }

    const purpose = await getPurpose(admin, purposeId);
    if (!purpose) throw new SharingError('目的が見つかりません', 404);
    if (purpose.status !== 'active') throw new SharingError('この目的は現在利用できません');

    const { data: balanceRow } = await admin
      .from('user_balance')
      .select('balance')
      .eq('user_id', ownerId)
      .maybeSingle();
    const balance = Number(balanceRow?.balance || 0);
    if (balance < amountLimit) {
      throw new SharingError('残高が不足しています');
    }

    if (!title) title = `資金共有: ${purpose.name}`;
  } else {
    resourceId = typeof input.resource_id === 'string' ? input.resource_id : null;
    if (!resourceId) throw new SharingError('共有するリソースを選択してください');

    const { data: resource } = await admin
      .from('user_resources')
      .select('id, user_id, name, resource_type')
      .eq('id', resourceId)
      .eq('user_id', ownerId)
      .maybeSingle();

    if (!resource) throw new SharingError('リソースが見つかりません', 404);
    if (!title) title = `共有: ${resource.name}`;
  }

  const generated = generateShareCode();
  const now = new Date().toISOString();

  const { data: shareRow, error: shareError } = await admin
    .from('resource_shares')
    .insert({
      owner_id: ownerId,
      resource_id: resourceId,
      purpose_id: purposeId,
      shared_idea_id: input.shared_idea_id ?? null,
      share_type: shareType,
      title: title.slice(0, 200),
      description: typeof input.description === 'string'
        ? input.description.trim().slice(0, 2000)
        : null,
      amount_limit: amountLimit,
      amount_used: 0,
      permissions: shareType === 'money'
        ? ['execute']
        : (permissions.length > 0 ? permissions : ['read']),
      max_uses: maxUses,
      used_count: 0,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      access_code_hash: generated.hash,
      access_code_prefix: generated.prefix,
      status: 'active',
    })
    .select('*')
    .single();

  if (shareError || !shareRow) {
    throw new SharingError(shareError?.message || '共有の作成に失敗しました', 500);
  }

  const share = shareRow as unknown as ResourceShare;

  if (shareType === 'money' && purposeId) {
    const { data: balanceRow } = await admin
      .from('user_balance')
      .select('balance')
      .eq('user_id', ownerId)
      .maybeSingle();
    const currentBalance = Number(balanceRow?.balance || 0);
    if (currentBalance < amountLimit) {
      await admin.from('resource_shares').delete().eq('id', share.id);
      throw new SharingError('残高が不足しています');
    }

    const { error: balanceError } = await admin
      .from('user_balance')
      .update({ balance: currentBalance - amountLimit })
      .eq('user_id', ownerId);

    const purpose = await getPurpose(admin, purposeId);
    const { error: purposeError } = await admin
      .from('fund_purposes')
      .update({ balance: Number(purpose?.balance || 0) + amountLimit, updated_at: now })
      .eq('id', purposeId);

    if (balanceError || purposeError) {
      await admin.from('resource_shares').delete().eq('id', share.id);
      if (!balanceError) {
        await admin
          .from('user_balance')
          .update({ balance: currentBalance })
          .eq('user_id', ownerId);
      }
      if (!purposeError && purpose) {
        await admin
          .from('fund_purposes')
          .update({ balance: Number(purpose.balance) })
          .eq('id', purposeId);
      }
      throw new SharingError('資金の移動に失敗しました', 500);
    }

    const { data: pool } = await admin
      .from('donation_pool')
      .select('id, balance')
      .limit(1)
      .maybeSingle();

    if (pool) {
      await admin
        .from('donation_pool')
        .update({ balance: Number(pool.balance) + amountLimit, updated_at: now })
        .eq('id', pool.id);
    }

    await admin.from('fund_transactions').insert({
      purpose_id: purposeId,
      user_id: ownerId,
      type: 'allocation',
      amount: amountLimit,
      note: `共有のため目的資金へ移動: ${title}`,
    });
  }

  await logEvent(admin, {
    shareId: share.id,
    actorId: ownerId,
    action: 'created',
    amount: amountLimit > 0 ? amountLimit : null,
    metadata: { share_type: shareType },
  });

  return {
    share: toSafeShare(shareRow as unknown as Record<string, unknown>),
    access_code: generated.code,
  };
}

/**
 * 共有コードを使って、自分に利用権を付与する。
 */
export async function redeemShare(
  admin: SupabaseClient,
  granteeId: string,
  code: string,
): Promise<{ share: ResourceShare; grant: ResourceShareGrant }> {
  const trimmed = code.trim();
  if (!trimmed) throw new SharingError('共有コードを入力してください');

  const { data: shareRow } = await admin
    .from('resource_shares')
    .select('*')
    .eq('access_code_hash', hashShareCode(trimmed))
    .maybeSingle();

  const share = shareRow as unknown as ResourceShare | null;
  if (!share) throw new SharingError('共有コードが正しくありません', 404);
  if (share.status !== 'active') throw new SharingError('この共有は現在利用できません');
  if (isExpired(share.expires_at)) {
    await admin
      .from('resource_shares')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', share.id);
    throw new SharingError('この共有は有効期限が切れています');
  }

  const { data: existingGrantRow } = await admin
    .from('resource_share_grants')
    .select('*')
    .eq('share_id', share.id)
    .eq('grantee_id', granteeId)
    .maybeSingle();

  const existingGrant = existingGrantRow as unknown as ResourceShareGrant | null;

  if (existingGrant) {
    if (existingGrant.status !== 'active') {
      throw new SharingError('この共有の利用権は無効です');
    }
    return {
      share: toSafeShare(shareRow as unknown as Record<string, unknown>),
      grant: existingGrant,
    };
  }

  const { data: grantRow, error } = await admin
    .from('resource_share_grants')
    .insert({
      share_id: share.id,
      grantee_id: granteeId,
      status: 'active',
      amount_used: 0,
      used_count: 0,
      expires_at: share.expires_at,
    })
    .select('*')
    .single();

  if (error || !grantRow) {
    throw new SharingError(error?.message || '利用権の付与に失敗しました', 500);
  }

  const grant = grantRow as unknown as ResourceShareGrant;

  await logEvent(admin, {
    shareId: share.id,
    grantId: grant.id,
    actorId: granteeId,
    action: 'redeemed',
  });

  if (share.owner_id !== granteeId) {
    await notifyUser(admin, {
      userId: share.owner_id,
      title: '共有コードが使用されました',
      body: `「${share.title}」の利用権が付与されました。`,
      kind: 'info',
    });
  }

  return {
    share: toSafeShare(shareRow as unknown as Record<string, unknown>),
    grant,
  };
}

/**
 * 共有された資金・リソースの利用可否を検証し、上限内なら使用を記録する。
 */
export async function authorizeShareUse(
  admin: SupabaseClient,
  actorId: string,
  input: { share_id?: unknown; action?: unknown; amount?: unknown },
): Promise<ShareUseResult> {
  const shareId = typeof input.share_id === 'string' ? input.share_id : '';
  if (!shareId) throw new SharingError('share_id が必要です');

  const action = getAction(input.action);

  const { data: shareRow } = await admin
    .from('resource_shares')
    .select('*')
    .eq('id', shareId)
    .maybeSingle();

  const share = shareRow as unknown as ResourceShare | null;
  if (!share) throw new SharingError('共有が見つかりません', 404);

  const { data: grantRow } = await admin
    .from('resource_share_grants')
    .select('*')
    .eq('share_id', shareId)
    .eq('grantee_id', actorId)
    .maybeSingle();

  const grant = grantRow as unknown as ResourceShareGrant | null;

  if (!grant) {
    return deny(admin, {
      shareId,
      actorId,
      action,
      reason: '共有コードを入力して利用権を取得してください',
    });
  }

  if (share.status === 'revoked') {
    return deny(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action,
      reason: '共有は取消されています',
    });
  }
  if (isExpired(share.expires_at)) {
    await admin
      .from('resource_shares')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', shareId);
    return deny(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action,
      reason: '共有の有効期限が切れています',
    });
  }
  if (grant.status !== 'active') {
    return deny(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action,
      reason: '利用権が無効です',
    });
  }
  if (isExpired(grant.expires_at)) {
    await admin
      .from('resource_share_grants')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', grant.id);
    return deny(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action,
      reason: '利用権の有効期限が切れています',
    });
  }
  if (
    share.status === 'exhausted'
    || (Number(share.max_uses) > 0 && Number(share.used_count) >= Number(share.max_uses))
  ) {
    return deny(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action,
      reason: '利用上限に達しています',
    });
  }

  const now = new Date().toISOString();

  if (share.share_type === 'money') {
    if (action !== 'use') {
      return deny(admin, {
        shareId,
        grantId: grant.id,
        actorId,
        action,
        reason: '資金共有では use を指定してください',
      });
    }

    const amount = parsePositiveAmount(input.amount);
    if (amount == null) {
      return deny(admin, {
        shareId,
        grantId: grant.id,
        actorId,
        action,
        amount: null,
        reason: '金額が不正です',
      });
    }

    const remaining = roundMoney(Number(share.amount_limit) - Number(share.amount_used));
    if (amount > remaining) {
      return deny(admin, {
        shareId,
        grantId: grant.id,
        actorId,
        action,
        amount,
        reason: '共有残高を超えています',
      });
    }

    const purpose = share.purpose_id ? await getPurpose(admin, share.purpose_id) : null;
    if (!purpose) {
      return deny(admin, {
        shareId,
        grantId: grant.id,
        actorId,
        action,
        amount,
        reason: '共有先の目的資金が見つかりません',
      });
    }
    if (Number(purpose.balance) < amount) {
      return deny(admin, {
        shareId,
        grantId: grant.id,
        actorId,
        action,
        amount,
        reason: '目的資金の残高が不足しています',
      });
    }

    await admin
      .from('fund_purposes')
      .update({ balance: Number(purpose.balance) - amount, updated_at: now })
      .eq('id', purpose.id);

    const { data: pool } = await admin
      .from('donation_pool')
      .select('id, balance, total_spent')
      .limit(1)
      .maybeSingle();
    if (pool) {
      await admin
        .from('donation_pool')
        .update({
          balance: Math.max(0, Number(pool.balance) - amount),
          total_spent: Number(pool.total_spent) + amount,
          updated_at: now,
        })
        .eq('id', pool.id);
    }

    await admin.from('fund_transactions').insert({
      purpose_id: purpose.id,
      user_id: actorId,
      type: 'spend',
      amount,
      related_shared_idea_id: share.shared_idea_id,
      note: `共有資金の使用: ${share.title}`,
    });

    const newShareUsed = roundMoney(Number(share.amount_used) + amount);
    const newShareStatus = newShareUsed >= Number(share.amount_limit) ? 'exhausted' : share.status;
    await admin
      .from('resource_shares')
      .update({
        amount_used: newShareUsed,
        used_count: Number(share.used_count) + 1,
        status: newShareStatus,
        updated_at: now,
      })
      .eq('id', shareId);

    await admin
      .from('resource_share_grants')
      .update({
        amount_used: roundMoney(Number(grant.amount_used) + amount),
        used_count: Number(grant.used_count) + 1,
        updated_at: now,
      })
      .eq('id', grant.id);

    await logEvent(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action: 'authorized',
      amount,
    });

    if (share.owner_id !== actorId) {
      await notifyUser(admin, {
        userId: share.owner_id,
        title: '共有資金が使用されました',
        body: `「${share.title}」から ¥${amount.toLocaleString()} が使用されました。`,
        kind: 'info',
      });
    }

    return {
      allowed: true,
      share_id: shareId,
      remaining_amount: roundMoney(Number(share.amount_limit) - newShareUsed),
      remaining_uses: Number(share.max_uses) > 0
        ? Math.max(0, Number(share.max_uses) - Number(share.used_count) - 1)
        : undefined,
    };
  }

  const permissions = (share.permissions || []) as SharePermission[];
  const requiredPermission = action === 'use' ? 'execute' : action;
  if (!permissions.includes(requiredPermission)) {
    return deny(admin, {
      shareId,
      grantId: grant.id,
      actorId,
      action,
      reason: '許可されていない操作です',
    });
  }

  const newUsedCount = Number(share.used_count) + 1;
  const exhausted = Number(share.max_uses) > 0 && newUsedCount >= Number(share.max_uses);
  await admin
    .from('resource_shares')
    .update({
      used_count: newUsedCount,
      status: exhausted ? 'exhausted' : share.status,
      updated_at: now,
    })
    .eq('id', shareId);

  await admin
    .from('resource_share_grants')
    .update({ used_count: Number(grant.used_count) + 1, updated_at: now })
    .eq('id', grant.id);

  await logEvent(admin, {
    shareId,
    grantId: grant.id,
    actorId,
    action: 'authorized',
    metadata: { requested_action: action },
  });

  if (share.owner_id !== actorId && Number(grant.used_count) === 0) {
    await notifyUser(admin, {
      userId: share.owner_id,
      title: '共有リソースが使用されました',
      body: `「${share.title}」が ${action} で使用されました。`,
      kind: 'info',
    });
  }

  let resource = null;
  if (share.resource_id) {
    const { data: resourceRow } = await admin
      .from('user_resources')
      .select('id, name, description, resource_type')
      .eq('id', share.resource_id)
      .maybeSingle();
    resource = resourceRow
      ? {
          id: resourceRow.id,
          name: resourceRow.name,
          description: resourceRow.description,
          resource_type: resourceRow.resource_type,
        }
      : null;
  }

  return {
    allowed: true,
    share_id: shareId,
    remaining_uses: Number(share.max_uses) > 0
      ? Math.max(0, Number(share.max_uses) - newUsedCount)
      : undefined,
    resource,
  };
}

/**
 * 共有を取消し、未使用の資金があれば所有者へ返金する。
 */
export async function revokeShare(
  admin: SupabaseClient,
  ownerId: string,
  shareId: string,
): Promise<ResourceShare> {
  const { data: shareRow } = await admin
    .from('resource_shares')
    .select('*')
    .eq('id', shareId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  const share = shareRow as unknown as ResourceShare | null;
  if (!share) throw new SharingError('共有が見つかりません', 404);
  if (share.status === 'revoked') {
    return toSafeShare(shareRow as unknown as Record<string, unknown>);
  }

  const now = new Date().toISOString();

  if (share.share_type === 'money' && share.purpose_id) {
    const unspent = Math.max(0, Number(share.amount_limit) - Number(share.amount_used));
    if (unspent > 0) {
      const purpose = await getPurpose(admin, share.purpose_id);
      const refund = Math.min(unspent, Number(purpose?.balance || 0));
      if (refund > 0) {
        const { data: balanceRow } = await admin
          .from('user_balance')
          .select('id, balance')
          .eq('user_id', ownerId)
          .maybeSingle();

        if (balanceRow) {
          await admin
            .from('user_balance')
            .update({ balance: Number(balanceRow.balance) + refund, updated_at: now })
            .eq('id', balanceRow.id);
        } else {
          await admin.from('user_balance').insert({
            user_id: ownerId,
            balance: refund,
            total_charged: 0,
            total_deposited: 0,
          });
        }

        await admin
          .from('fund_purposes')
          .update({ balance: Number(purpose?.balance || 0) - refund, updated_at: now })
          .eq('id', share.purpose_id);

        const { data: pool } = await admin
          .from('donation_pool')
          .select('id, balance')
          .limit(1)
          .maybeSingle();
        if (pool) {
          await admin
            .from('donation_pool')
            .update({ balance: Math.max(0, Number(pool.balance) - refund), updated_at: now })
            .eq('id', pool.id);
        }

        await admin.from('fund_transactions').insert({
          purpose_id: share.purpose_id,
          user_id: ownerId,
          type: 'refund',
          amount: refund,
          note: `共有取消による未使用分の返金: ${share.title}`,
        });
      }
    }
  }

  const { data: updatedRow } = await admin
    .from('resource_shares')
    .update({ status: 'revoked', updated_at: now })
    .eq('id', shareId)
    .select('*')
    .single();

  await admin
    .from('resource_share_grants')
    .update({ status: 'revoked', updated_at: now })
    .eq('share_id', shareId);

  await logEvent(admin, {
    shareId,
    actorId: ownerId,
    action: 'revoked',
  });

  if (updatedRow) {
    return toSafeShare(updatedRow as unknown as Record<string, unknown>);
  }
  return { ...share, status: 'revoked' };
}

export async function listShares(
  admin: SupabaseClient,
  userId: string,
): Promise<SharingSnapshot> {
  const { data: ownedData } = await admin
    .from('resource_shares')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: grantsData } = await admin
    .from('resource_share_grants')
    .select('*')
    .eq('grantee_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const grants = (grantsData || []) as unknown as ResourceShareGrant[];
  const shareIds = grants.map((grant) => grant.share_id);
  const shareMap = new Map<string, ResourceShare>();

  if (shareIds.length > 0) {
    const { data: sharesData } = await admin
      .from('resource_shares')
      .select('*')
      .in('id', shareIds);
    for (const row of (sharesData || []) as unknown as Record<string, unknown>[]) {
      const share = toSafeShare(row);
      shareMap.set(share.id, share);
    }
  }

  const received: ReceivedShare[] = [];
  for (const grant of grants) {
    const share = shareMap.get(grant.share_id);
    if (share) received.push({ share, grant });
  }

  return {
    owned: ((ownedData || []) as unknown as Record<string, unknown>[]).map(toSafeShare),
    received,
  };
}
