/**
 * Browser client for the server-side AI endpoint (api/ai.ts).
 */
async function callAi<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `AI request failed (${res.status})`);
  return data as T;
}

export const extractReceiptData = (base64Image: string) =>
  callAi<any>({ action: 'receipt', image: base64Image });

export const getMarketIntelligence = (location: string, bedrooms: number) =>
  callAi<any>({ action: 'market', location, bedrooms });
