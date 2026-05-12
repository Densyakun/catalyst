import crypto from 'crypto';

function base64UrlEncode(str: string | Buffer): string {
  const base64 = typeof str === 'string' 
    ? Buffer.from(str).toString('base64') 
    : str.toString('base64');
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generates a short-lived HMAC-SHA256 JWT-like token for safe cross-instance communication.
 */
export function generatePublishToken(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes expiration
  }));
  
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signatureInput);
  const signature = base64UrlEncode(hmac.digest());
  
  return `${signatureInput}.${signature}`;
}

/**
 * Verifies a short-lived HMAC-SHA256 JWT-like token. Throws error if invalid or expired.
 */
export function verifyPublishToken(token: string, secret: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }
  
  const [header, payload, signature] = parts;
  
  // Verify signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${header}.${payload}`);
  const expectedSignature = base64UrlEncode(hmac.digest());
  
  if (signature !== expectedSignature) {
    throw new Error('Token signature is invalid. Secret mismatch.');
  }
  
  const decodedPayload = JSON.parse(base64UrlDecode(payload));
  
  // Verify expiration
  if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token has expired');
  }
  
  return decodedPayload;
}
