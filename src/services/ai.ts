/**
 * Browser client for the server-side AI endpoint (api/ai.ts).
 */
import { supabase } from '../lib/supabase';

async function callAi<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please log in again.');
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `AI request failed (${res.status})`);
  return body as T;
}

export const extractReceiptData = (base64Image: string) =>
  callAi<any>({ action: 'receipt', image: base64Image });

export const getMarketIntelligence = (location: string, bedrooms: number) =>
  callAi<any>({ action: 'market', location, bedrooms });
