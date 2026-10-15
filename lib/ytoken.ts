import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Encryption for the YouTube refresh token, and the PKCE and state values of
 * the OAuth handshake. Server only.
 *
 * The refresh token is the one long-lived credential in this feature: whoever
 * holds it can read the channel's analytics until it is revoked. It is stored
 * encrypted with AES-256-GCM under YOUTUBE_TOKEN_KEY, which lives only in the
 * environment, so a copy of the database alone does not carry a usable token.
 * Nothing here logs, and no function returns a token to a caller that could
 * send it to a browser.
 */

/** 32 bytes, from YOUTUBE_TOKEN_KEY written as base64. */
export function tokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.YOUTUBE_TOKEN_KEY ?? '';
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('YOUTUBE_TOKEN_KEY must be 32 random bytes written as base64');
  return key;
}

/** "v1.<iv>.<tag>.<ciphertext>", each part base64url. */
export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function decryptToken(stored: string, key: Buffer): string {
  const [v, iv, tag, body] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('The stored token is not in a format this version can read');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/** A random value for the OAuth state parameter. */
export function newState(): string {
  return randomBytes(32).toString('base64url');
}

/** A PKCE verifier and its S256 challenge. */
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** Compares two strings without leaking where they differ. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
