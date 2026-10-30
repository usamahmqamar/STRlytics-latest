/**
 * Server-side AI endpoint. The Gemini key stays on the server (GEMINI_API_KEY in Vercel),
 * never in the browser bundle.
 *
 * TODO(step 1.2): require a valid Supabase session and check the organisation's AI quota (step 5.3).
 */
import { extractReceiptData, getMarketIntelligence } from './_gemini.js';

const MAX_IMAGE_CHARS = 8_000_000; // ~6 MB base64

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
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
