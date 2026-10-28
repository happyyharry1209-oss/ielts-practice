import { query } from './db';
import { createToken, hashToken, tokenExpiry } from './tokens';

/**
 * Issue a single-use password-reset token, invalidating any older unused ones.
 * The raw token is returned once; only its hash is stored.
 */
export async function createResetToken(userId: string): Promise<string> {
  await query(
    `update auth_tokens set used_at = now()
     where user_id = $1 and kind = 'reset_password' and used_at is null`,
    [userId],
  );

  const token = createToken();
  await query(
    `insert into auth_tokens (user_id, kind, token_hash, expires_at)
     values ($1, 'reset_password', $2, $3)`,
    [userId, hashToken(token), tokenExpiry('reset_password')],
  );
  return token;
}
