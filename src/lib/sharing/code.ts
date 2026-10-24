import { createHash, randomBytes } from 'crypto';

export function generateShareCode(): { code: string; prefix: string; hash: string } {
  const code = `shr_${randomBytes(24).toString('base64url')}`;
  return {
    code,
    prefix: code.slice(0, 12),
    hash: hashShareCode(code),
  };
}

export function hashShareCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
