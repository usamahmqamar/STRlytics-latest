/**
 * Server-side AI endpoint: POST /api/ai with { action: 'receipt' | 'market', ... }.
 *
 * Order matters: sign-in and workspace membership first, then input validation,
 * then the shared usage limit (counted in the database), and only then the AI provider.
 * Errors return a generic message; details stay in the server logs.
 */
import { HttpError, consumeAiQuota, handle, json, readJson, requireUser } from './_lib/security.js';
import { MAX_BODY_BYTES, validateMarketInput, validateReceiptImage } from './_lib/validate.js';
import { extractReceiptData, getMarketIntelligence } from './_gemini.js';

export const POST = handle(async request => {
  const caller = await requireUser(request);
  const body = await readJson(request, MAX_BODY_BYTES);

  switch (body?.action) {
    case 'receipt': {
      const { mime, data } = validateReceiptImage(body);
      await consumeAiQuota(caller, 'receipt');
      return json(200, await extractReceiptData(mime, data));
    }
    case 'market': {
      const { location, bedrooms } = validateMarketInput(body);
      await consumeAiQuota(caller, 'market');
      return json(200, await getMarketIntelligence(location, bedrooms));
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
});
