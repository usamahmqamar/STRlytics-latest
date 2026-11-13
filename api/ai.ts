/**
 * Server-side AI endpoint: POST /api/ai with { action: 'receipt' | 'market', ... }.
 *
 * Order matters: sign-in and workspace membership first, then input validation,
 * then the shared usage limit (counted in the database), and only then the AI provider.
 * Errors return a generic message; details stay in the server logs.
 */
import { HttpError, consumeAiQuota, handle, json, readJson, requireUser } from './_lib/security.js';
import { MAX_BODY_BYTES, validateMarketInput, validateReceiptImage } from './_lib/validate.js';
import { extractDocument, extractReceiptData, getMarketIntelligence } from './_gemini.js';
import { cleanBankStatement, cleanBookings, cleanPayoutReport, loadDocument } from './_lib/documents.js';

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
    case 'document': {
      // Reads a file the caller uploaded to this workspace. Access is checked by the database
      // (row-level security on the document and the stored file), using the caller's token.
      const doc = await loadDocument(caller, body.documentId);
      await consumeAiQuota(caller, 'document');
      let raw: any;
      try {
        raw = await extractDocument(doc.kind, doc.mime, doc.bytes);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(502, 'Could not read this document. Check it opens correctly, or enter the details by hand.');
      }
      if (doc.kind === 'bookings') return json(200, { kind: doc.kind, ...cleanBookings(raw) });
      if (doc.kind === 'bank_statement') return json(200, { kind: doc.kind, ...cleanBankStatement(raw) });
      return json(200, { kind: doc.kind, ...cleanPayoutReport(raw) });
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
});
