/**
 * Server-side AI endpoint. The Gemini key stays on the server (GEMINI_API_KEY in Vercel),
 * never in the browser bundle.
 *
 * Only signed-in users may call it (Supabase access token in the Authorization header).
 * TODO(step 5.3): check the organisation's monthly AI quota.
 */
import { extractReceiptData, getMarketIntelligence } from './_gemini.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Returns the user id for a valid Supabase access token, or null. */
async function authenticatedUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: SUPABASE_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === 'string' ? user.id : null;
}

const MAX_IMAGE_CHARS = 8_000_000; // ~6 MB base64

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await authenticatedUserId(request))) return json({ error: 'Sign in required' }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    switch (body?.action) {
      case 'receipt': {
        const image = body.image;
        if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > MAX_IMAGE_CHARS) {
          return json({ error: 'image must be an image data URL under 6 MB' }, 400);
        }
        return json(await extractReceiptData(image));
      }
      case 'market': {
        const location = String(body.location ?? '').slice(0, 120).trim();
        const bedrooms = Number(body.bedrooms);
        if (!location || !Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 10) {
          return json({ error: 'location and bedrooms (0-10) are required' }, 400);
        }
        return json(await getMarketIntelligence(location, bedrooms));
      }
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    console.error('AI request failed', err);
    return json({ error: 'AI request failed' }, 502);
  }
}
