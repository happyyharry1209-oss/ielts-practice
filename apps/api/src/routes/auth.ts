import { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword, signToken, verifyPassword } from '../auth';
import { query, queryOne } from '../db';
import { HttpError, parseBody, requireAuth } from '../http';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  created_at: string;
  password_hash: string;
}

function publicUser(row: Omit<UserRow, 'password_hash'>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
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

export const authRoutes = new Hono();

authRoutes.post('/register', async (c) => {
  const body = await parseBody(c, registerSchema);
  const email = body.email.trim().toLowerCase();

  const existing = await queryOne<{ id: string }>('select id from users where email = $1', [email]);
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const rows = await query<Omit<UserRow, 'password_hash'>>(
    `insert into users (email, password_hash, display_name)
     values ($1, $2, $3)
     returning id, email, display_name, role, created_at`,
    [email, hashPassword(body.password), body.displayName ?? ''],
  );
  const user = rows[0]!;
  const token = await signToken({ sub: user.id, role: user.role });
  return c.json({ token, user: publicUser(user) }, 201);
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
