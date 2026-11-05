/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI features run on the server (api/ai/*). The Gemini key never reaches the browser.
 * Each request carries the signed-in user's Supabase access token and the active workspace;
 * the server checks both and records usage against shared limits.
 */
import { supabase } from './supabase';

let activeWorkspaceId: string | null = null;
export const setActiveWorkspace = (id: string | null) => { activeWorkspaceId = id; };

async function callAi<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !activeWorkspaceId) throw new Error('Please sign in to use AI features.');

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Workspace-Id': activeWorkspaceId,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'AI request failed.');
  return json as T;
}

export const extractReceiptData = (dataUrl: string) => callAi<any>('/api/ai/receipt', { image: dataUrl });

export const getMarketIntelligence = (location: string, bedrooms: number) =>
  callAi<any>('/api/ai/market', { location, bedrooms });
