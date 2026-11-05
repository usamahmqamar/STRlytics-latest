/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI features run on the server (api/ai/*). The Gemini key never reaches the browser.
 * Each request carries the signed-in user's Firebase ID token.
 */
import { auth } from './firebase';

async function callAi<T>(path: string, body: unknown): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Please sign in to use AI features.');
  const token = await user.getIdToken();

  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'AI request failed.');
  return data as T;
}

export const extractReceiptData = (dataUrl: string) => callAi<any>('/api/ai/receipt', { image: dataUrl });

export const getMarketIntelligence = (location: string, bedrooms: number) =>
  callAi<any>('/api/ai/market', { location, bedrooms });
