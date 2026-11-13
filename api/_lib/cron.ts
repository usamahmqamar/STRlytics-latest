/**
 * Shared by the scheduled jobs: checks the Vercel Cron secret, and calls the database's
 * token-guarded job functions with the publishable key (no service-role key anywhere).
 */
import { timingSafeEqual } from 'node:crypto';
import { HttpError, supabaseConfig } from './security.js';

export function authorised(request: Request, what = 'Scheduled jobs'): string {
  const secret = process.env.CRON_SECRET || '';
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (secret.length < 32) throw new HttpError(503, `${what} are not configured.`);
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Not allowed.');
  return secret;
}

export async function rpc(name: string, body: unknown) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new HttpError(502, 'Could not reach the database.');
  return res.json();
}
