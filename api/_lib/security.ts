/**
 * Shared server-side security helpers for Vercel functions.
 * Files under api/_lib are not exposed as endpoints.
 */

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(500, 'Server is not configured.');
  return { url: url.replace(/\/+$/, ''), key };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Caller {
  userId: string;
  token: string;
  workspaceId: string;
}

/**
 * Confirms the caller's Supabase session with Supabase Auth (so signed-out or revoked
 * sessions are refused) and reads the workspace they are acting in.
 */
export async function requireUser(request: Request): Promise<Caller> {
  const { url, key } = supabaseConfig();
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/);
  if (!match) throw new HttpError(401, 'Sign in required.');
  const workspaceId = request.headers.get('x-workspace-id') || '';
  if (!UUID.test(workspaceId)) throw new HttpError(400, 'Workspace missing.');

  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${match[1]}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, 'Sign-in service unavailable. Please try again.');
  }
  if (!res.ok) throw new HttpError(401, 'Session expired. Please sign in again.');
  const user = await res.json().catch(() => null);
  if (!user?.id || typeof user.id !== 'string') throw new HttpError(401, 'Session expired. Please sign in again.');
  return { userId: user.id, token: match[1], workspaceId };
}

/**
 * Records one AI use in the database with the caller's own token. The database function
 * checks workspace membership, role, workspace status and shared hourly/daily limits.
 */
export async function consumeAiQuota(caller: Caller, kind: 'receipt' | 'market' | 'document'): Promise<void> {
  const { url, key } = supabaseConfig();
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${caller.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_org: caller.workspaceId, p_kind: kind }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, 'Service unavailable. Please try again.');
  }
  if (res.ok) return;
  const err = await res.json().catch(() => ({}));
  if (err?.code === 'P0429') throw new HttpError(429, 'AI usage limit reached. Please try again later.');
  if (err?.code === '42501') throw new HttpError(403, 'AI features are not available for your role or workspace.');
  throw new HttpError(503, 'Service unavailable. Please try again.');
}

export async function readJson(request: Request, maxBytes: number): Promise<any> {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Expected JSON.');
  }
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'Request too large.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Wraps a handler so internal errors never leak details to the client. */
export function handle(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      console.error('Unhandled API error:', err instanceof Error ? err.name : 'unknown');
      return json(500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

export function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(503, 'AI features are not configured.');
  return key;
}
