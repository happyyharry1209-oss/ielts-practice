import { createHash, randomBytes } from 'node:crypto';

export type TokenKind = 'verify_email' | 'reset_password';

/** Milliseconds. Verification links live longer than password resets. */
export const TOKEN_TTL_MS: Record<TokenKind, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored; a leaked database cannot be used to verify emails. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenExpiry(kind: TokenKind): Date {
  return new Date(Date.now() + TOKEN_TTL_MS[kind]);
}
