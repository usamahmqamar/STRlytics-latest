import { GoogleGenAI, Type } from '@google/genai';
import { HttpError, getGeminiKey, handle, json, rateLimit, readJson, requireUser } from '../_lib/security';
import { MAX_BODY_BYTES, validateReceiptImage } from '../_lib/validate';

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const CATEGORIES = ['maintenance', 'utilities', 'supplies', 'marketing', 'other'];

export const POST = handle(async request => {
  const uid = await requireUser(request);
  rateLimit(`receipt:${uid}`, 20, 60 * 60 * 1000); // 20 receipts per hour

  const body = await readJson(request, MAX_BODY_BYTES);
  const { mime, data } = validateReceiptImage(body);

  const ai = new GoogleGenAI({ apiKey: getGeminiKey() });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      parts: [
        { text: `Extract expense details from this receipt image. Return a JSON object with:
          - amount (number)
          - date (YYYY-MM-DD)
          - category (one of: maintenance, utilities, supplies, marketing, other)
          - description (string)
          - vendor (string)
          - apartment_id (if identifiable, else null)` },
        { inlineData: { mimeType: mime, data } },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER },
          date: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          vendor: { type: Type.STRING },
          apartment_id: { type: Type.STRING, nullable: true },
        },
        required: ['amount', 'date', 'category', 'description', 'vendor'],
      },
    },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    throw new HttpError(502, 'Could not read the receipt. Please enter it manually.');
  }

  // Only pass back expected, size-limited fields.
  const amount = Number(parsed.amount);
  return json(200, {
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : '',
    category: CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
    description: clip(parsed.description, 500),
    vendor: clip(parsed.vendor, 200),
    apartment_id: parsed.apartment_id ? clip(parsed.apartment_id, 128) : null,
  });
});
