/**
 * Shared server-side security helpers for Vercel functions.
 * Files under api/_lib are not exposed as endpoints.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google's public keys for Firebase ID tokens.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Verifies the Firebase ID token in the Authorization header and returns the user's uid. */
export async function requireUser(request: Request): Promise<string> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(500, 'Server is not configured.');

  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, 'Sign in required.');

  try {
    const { payload } = await jwtVerify(match[1], FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    if (!payload.sub || typeof payload.sub !== 'string') throw new Error('missing sub');
    return payload.sub;
  } catch {
    throw new HttpError(401, 'Session expired. Please sign in again.');
  }
}

/**
 * Best-effort per-user rate limit (per warm function instance).
 * Not a substitute for a shared store; see SECURITY.md.
 */
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= limit) throw new HttpError(429, 'Too many requests. Please wait and try again.');
  hits.push(now);
  buckets.set(key, hits);
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
