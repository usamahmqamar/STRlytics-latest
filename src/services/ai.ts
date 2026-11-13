/**
 * Browser client for the server-side AI endpoint (api/ai.ts).
 * Each request carries the signed-in user's access token and the active workspace;
 * the server checks membership and counts usage against shared limits.
 */
import { supabase } from '../lib/supabase';

let activeWorkspaceId: string | null = null;
export const setActiveWorkspace = (id: string | null) => { activeWorkspaceId = id; };

async function callAi<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !activeWorkspaceId) throw new Error('Please log in again.');
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-workspace-id': activeWorkspaceId,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error(body?.error || 'AI limit reached. Please try again later.');
  if (!res.ok) throw new Error(body?.error || 'AI request failed. Please try again.');
  return body as T;
}

/** Reads an uploaded document (booking PDF, bank statement or payout report) on the server. */
export const readDocument = (documentId: string) =>
  callAi<any>({ action: 'document', documentId });

export const extractReceiptData = (base64Image: string) =>
  callAi<any>({ action: 'receipt', image: base64Image });

export const getMarketIntelligence = (location: string, bedrooms: number) =>
  callAi<any>({ action: 'market', location, bedrooms });
