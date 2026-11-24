/**
 * Reports unexpected server errors to Sentry when SENTRY_DSN is set (server-only variable).
 * Sends the error type, a scrubbed message and a short stack; never request bodies,
 * headers, tokens or user data. Bounded by a short timeout so it cannot slow responses much.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRETS = /(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sb_(secret|publishable)_[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]{20,}|re_[A-Za-z0-9]{20,}|password=\S+)/g;
export const scrubServer = (s: string) => s.replace(SECRETS, '[removed]').replace(EMAIL, '[email]').slice(0, 2000);

export function parseDsn(dsn: string) {
  const m = dsn.match(/^https:\/\/([a-f0-9]+)@([a-z0-9.-]+)\/(\d+)$/i);
  return m ? { key: m[1], host: m[2], project: m[3] } : null;
}

export async function reportServerError(err: unknown, route: string): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN || '');
  if (!dsn) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.VERCEL_ENV || 'development',
    tags: { route },
    exception: {
      values: [{
        type: e.name || 'Error',
        value: scrubServer(e.message || ''),
        stacktrace: {
          frames: scrubServer(e.stack || '').split('\n').slice(1, 15).reverse()
            .map(line => ({ function: line.trim().slice(0, 200) })),
        },
      }],
    },
  };
  const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  try {
    await fetch(`https://${dsn.host}/api/${dsn.project}/envelope/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=staylytics-server/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Monitoring must never fail a request.
  }
}
