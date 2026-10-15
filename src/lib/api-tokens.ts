import { randomBytes, createHash } from 'crypto';

export interface GeneratedApiToken {
  token: string;
  prefix: string;
  hash: string;
}

/**
 * ユーザーAPIトークンを生成する。平文は発行時のみ返し、DBにはハッシュを保存する。
 */
export function generateApiToken(): GeneratedApiToken {
  const token = `cat_${randomBytes(24).toString('base64url')}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashApiToken(token),
  };
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
