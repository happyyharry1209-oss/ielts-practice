import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { verifyToken } from './auth';
import { queryOne } from './db';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userRole: 'user' | 'admin';
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new HttpError(400, message);
  }
  return result.data;
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Missing bearer token');
  const payload = await verifyToken(token);
  if (!payload) throw new HttpError(401, 'Invalid or expired token');
  c.set('userId', payload.sub);
  c.set('userRole', payload.role);
  await next();
};

/**
 * Re-reads the role from the database so revoking admin access takes effect
 * without waiting for the current token to expire.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const row = await queryOne<{ role: string }>('select role from users where id = $1', [
    c.get('userId'),
  ]);
  if (row?.role !== 'admin') throw new HttpError(403, 'Admin access required');
  c.set('userRole', 'admin');
  await next();
};

const hits = new Map<string, number[]>();

/** Simple in-memory sliding-window limiter. Per-process only. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
