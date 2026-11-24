/**
 * Error monitoring for the browser (Sentry). Off unless VITE_SENTRY_DSN is set at build time;
 * the SDK is then loaded on demand so it adds nothing to the app when unused.
 *
 * Privacy: no IP addresses, cookies, request bodies or emails are sent. Users are identified
 * by their internal id only, and anything that looks like an email, a token or a key is
 * replaced before an event leaves the browser.
 */
type Sentry = typeof import('@sentry/browser');

const DSN = ((import.meta as any).env?.VITE_SENTRY_DSN as string | undefined) || '';
let sdk: Sentry | null = null;
const queue: (() => void)[] = [];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const KEYS = /\b(sb_(publishable|secret)_[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]{20,}|re_[A-Za-z0-9]{20,})\b/g;
const TOKEN_PARAMS = /([?&#](access_token|refresh_token|token|code)=)[^&#\s]+/gi;

export function scrub(text: string): string {
  return text.replace(JWT, '[token]').replace(KEYS, '[key]').replace(EMAIL, '[email]').replace(TOKEN_PARAMS, '$1[removed]');
}

function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') return scrub(value) as unknown as T;
  if (Array.isArray(value)) return value.map(v => scrubDeep(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = /authorization|cookie|password|secret|apikey|api_key/i.test(k) ? '[removed]' : scrubDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function monitoringEnabled() {
  return Boolean(DSN);
}

export async function initMonitoring() {
  if (!DSN || sdk) return;
  try {
    const S = await import('@sentry/browser');
    S.init({
      dsn: DSN,
      environment: location.hostname.includes('-git-') ? 'preview' : location.hostname === 'localhost' ? 'development' : 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 30,
      ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications', 'AbortError'],
      denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i],
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.data;
          if (event.request.url) event.request.url = scrub(event.request.url);
        }
        if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
        return scrubDeep(event);
      },
      beforeBreadcrumb(crumb) {
        // Typed values in fields are never recorded.
        if (crumb.category === 'ui.input') return null;
        return scrubDeep(crumb);
      },
    });
    sdk = S;
    queue.splice(0).forEach(fn => fn());
  } catch {
    // Monitoring must never break the app.
  }
}

function withSdk(fn: (S: Sentry) => void) {
  if (!DSN) return;
  if (sdk) fn(sdk);
  else if (queue.length < 20) queue.push(() => fn(sdk!));
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  withSdk(S => S.captureException(error, context ? { extra: scrubDeep(context) } : undefined));
}

/** Identify the signed-in person by internal id only, and the active workspace. */
export function setMonitoringUser(userId: string | null, workspaceId: string | null) {
  withSdk(S => {
    S.setUser(userId ? { id: userId } : null);
    S.setTag('workspace', workspaceId ?? 'none');
  });
}
