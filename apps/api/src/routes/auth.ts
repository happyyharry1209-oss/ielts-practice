import { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword, signToken, verifyPassword } from '../auth';
import { query, queryOne } from '../db';
import { env } from '../env';
import { checkRateLimit, HttpError, parseBody, requireAuth } from '../http';
import { appLink, resetPasswordMail, sendMail, verifyEmailMail } from '../mailer';
import { createToken, hashToken, tokenExpiry } from '../tokens';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  created_at: string;
  email_verified: boolean;
  password_hash: string;
}

function publicUser(row: Omit<UserRow, 'password_hash'>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const tokenSchema = z.object({ token: z.string().min(10).max(200) });
const emailSchema = z.object({ email: z.string().email().max(200) });
const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(200),
});

/**
 * Create a single-use token and email the link. Returns a debug link when no
 * mail provider is configured and we are not in production, so the flow can be
 * tested locally without signing up for anything.
 */
async function sendVerification(userId: string, email: string): Promise<string | undefined> {
  const token = createToken();
  await query(
    `insert into auth_tokens (user_id, kind, token_hash, expires_at)
     values ($1, 'verify_email', $2, $3)`,
    [userId, hashToken(token), tokenExpiry('verify_email')],
  );
  const link = appLink(`verify-email?token=${encodeURIComponent(token)}`);
  const mail = verifyEmailMail(link);
  const result = await sendMail(email, mail.subject, mail.html, mail.text);
  return result.sent || env.isProd ? undefined : link;
}

async function sendPasswordReset(userId: string, email: string): Promise<string | undefined> {
  const token = createToken();
  await query(
    `insert into auth_tokens (user_id, kind, token_hash, expires_at)
     values ($1, 'reset_password', $2, $3)`,
    [userId, hashToken(token), tokenExpiry('reset_password')],
  );
  const link = appLink(`reset-password?token=${encodeURIComponent(token)}`);
  const mail = resetPasswordMail(link);
  const result = await sendMail(email, mail.subject, mail.html, mail.text);
  return result.sent || env.isProd ? undefined : link;
}

export const authRoutes = new Hono();

authRoutes.post('/register', async (c) => {
  if (!env.registrationOpen) {
    throw new HttpError(403, 'Registration is currently closed');
  }

  const body = await parseBody(c, registerSchema);
  const email = body.email.trim().toLowerCase();

  const existing = await queryOne<{ id: string }>('select id from users where email = $1', [email]);
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  // Unverified users may still log in; verification enables password recovery
  // and is surfaced in the UI as a banner.
  const rows = await query<Omit<UserRow, 'password_hash'>>(
    `insert into users (email, password_hash, display_name)
     values ($1, $2, $3)
     returning id, email, display_name, role, email_verified, created_at`,
    [email, hashPassword(body.password), body.displayName ?? ''],
  );
  const user = rows[0]!;
  const debugLink = await sendVerification(user.id, user.email);
  const token = await signToken({ sub: user.id, role: user.role });

  return c.json({ token, user: publicUser(user), debugLink }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await parseBody(c, loginSchema);
  const email = body.email.trim().toLowerCase();
  const row = await queryOne<UserRow>('select * from users where email = $1', [email]);
  if (!row || !verifyPassword(body.password, row.password_hash)) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  await query('update users set last_login_at = now() where id = $1', [row.id]);
  const token = await signToken({ sub: row.id, role: row.role });
  return c.json({ token, user: publicUser(row) });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const row = await queryOne<UserRow>('select * from users where id = $1', [c.get('userId')]);
  if (!row) throw new HttpError(401, 'Account no longer exists');
  return c.json({ user: publicUser(row) });
});

authRoutes.post('/verify-email', async (c) => {
  const body = await parseBody(c, tokenSchema);

  const row = await queryOne<{ id: string; user_id: string }>(
    `select id, user_id from auth_tokens
     where token_hash = $1 and kind = 'verify_email' and used_at is null and expires_at > now()`,
    [hashToken(body.token)],
  );
  if (!row) throw new HttpError(400, 'This verification link is invalid or has expired');

  await query('update auth_tokens set used_at = now() where id = $1', [row.id]);
  await query('update users set email_verified = true where id = $1', [row.user_id]);

  return c.json({ ok: true });
});

authRoutes.post('/resend-verification', requireAuth, async (c) => {
  const userId = c.get('userId');
  const row = await queryOne<UserRow>('select * from users where id = $1', [userId]);
  if (!row) throw new HttpError(401, 'Account no longer exists');
  if (row.email_verified) return c.json({ ok: true, alreadyVerified: true });

  if (!checkRateLimit(`resend:${userId}`, 3, 60 * 60 * 1000)) {
    throw new HttpError(429, 'Too many verification emails. Try again later.');
  }

  await query(
    `update auth_tokens set used_at = now()
     where user_id = $1 and kind = 'verify_email' and used_at is null`,
    [userId],
  );
  const debugLink = await sendVerification(userId, row.email);

  return c.json({ ok: true, debugLink });
});

authRoutes.post('/forgot-password', async (c) => {
  const body = await parseBody(c, emailSchema);
  const email = body.email.trim().toLowerCase();

  // Always answer 200 so the endpoint cannot be used to discover accounts.
  if (!checkRateLimit(`forgot:${email}`, 5, 60 * 60 * 1000)) {
    return c.json({ ok: true });
  }

  const user = await queryOne<{ id: string; email: string }>(
    'select id, email from users where email = $1',
    [email],
  );

  let debugLink: string | undefined;
  if (user) {
    await query(
      `update auth_tokens set used_at = now()
       where user_id = $1 and kind = 'reset_password' and used_at is null`,
      [user.id],
    );
    debugLink = await sendPasswordReset(user.id, user.email);
  }

  return c.json({ ok: true, debugLink });
});

authRoutes.post('/reset-password', async (c) => {
  const body = await parseBody(c, resetSchema);

  const row = await queryOne<{ id: string; user_id: string }>(
    `select id, user_id from auth_tokens
     where token_hash = $1 and kind = 'reset_password' and used_at is null and expires_at > now()`,
    [hashToken(body.token)],
  );
  if (!row) throw new HttpError(400, 'This reset link is invalid or has expired');

  await query('update users set password_hash = $1, email_verified = true where id = $2', [
    hashPassword(body.password),
    row.user_id,
  ]);
  await query(
    `update auth_tokens set used_at = now()
     where user_id = $1 and kind = 'reset_password' and used_at is null`,
    [row.user_id],
  );

  return c.json({ ok: true });
});
