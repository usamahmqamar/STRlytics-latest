/**
 * Security tests for the server functions, the save layer and shared safety helpers.
 * Run with: npm run test:security
 * (Database row-level security tests: supabase/tests/rls_access_test.sql)
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { HttpError, consumeAiQuota, handle, readJson, requireUser } from '../api/_lib/security';
import { MAX_IMAGE_BYTES, validateMarketInput, validateReceiptImage } from '../api/_lib/validate';
import { POST as aiPOST } from '../api/ai';
import { GET as cronGET } from '../api/cron/reminders';
import { GET as ratesGET } from '../api/cron/rates';
import { buildEmail } from '../api/_lib/reminderEmail';
import { parseDsn, reportServerError, scrubServer } from '../api/_lib/monitor';
import { scrub as scrubBrowser } from '../src/lib/monitoring';
import { cleanBankStatement, cleanBookings, cleanDate, cleanMoney, cleanPayoutReport, detectType } from '../api/_lib/documents';
import { csvFileProblem, safeUnparseOptions, MAX_CSV_BYTES } from '../src/lib/csv';
import { diffTable, rowsFor, toDate } from '../src/services/dataStore';
import { DEFAULT_USER_DATA } from '../src/constants';

const WS = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'a'.repeat(40);
process.env.SUPABASE_URL = 'https://project.test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
delete process.env.GEMINI_API_KEY;

// ---- fake Supabase (records every outgoing call) ----
type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let authStatus = 200;
let rpcReply: { status: number; body: any } = { status: 204, body: null };
let docRows: any[] = [];
let cronDue: any[] = [];
let resendStatus = 200;
let fileBytes: Buffer = Buffer.from('%PDF-1.7 test');
const realFetch = globalThis.fetch;
let ratesStatus: { latest_stored: string | null; earliest_stored: string | null; earliest_needed: string | null } =
  { latest_stored: null, earliest_stored: null, earliest_needed: null };
const ecbDay = (d: string) => `<Cube time='${d}'><Cube currency='USD' rate='1.16'/><Cube currency='GBP' rate='0.87'/></Cube>`;
const ECB_90 = `<Cube>${['2026-11-12', '2026-11-11', '2026-08-20'].map(ecbDay).join('')}</Cube>`;
const ECB_ALL_XML = `<Cube>${['2026-11-12', '2026-08-20', '2026-03-02', '2026-02-27', '2025-01-02'].map(ecbDay).join('')}</Cube>`;
globalThis.fetch = (async (url: any, init?: RequestInit) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/auth/v1/user')) {
    return new Response(authStatus === 200 ? JSON.stringify({ id: 'user-1' }) : '{}', { status: authStatus });
  }
  if (String(url).includes('/rest/v1/rpc/cron_reminders_due')) {
    return new Response(JSON.stringify(cronDue), { status: 200 });
  }
  if (String(url).includes('/rest/v1/rpc/cron_mark_reminders_sent')) {
    return new Response('1', { status: 200 });
  }
  if (String(url).includes('/rest/v1/rpc/cron_rates_status')) {
    return new Response(JSON.stringify([ratesStatus]), { status: 200 });
  }
  if (String(url).includes('/rest/v1/rpc/cron_store_rates')) {
    const days = JSON.parse(String(init?.body)).p_days;
    return new Response(String(Object.keys(days).length), { status: 200 });
  }
  if (String(url).startsWith('https://www.ecb.europa.eu/')) {
    return new Response(String(url).includes('hist-90d') ? ECB_90 : ECB_ALL_XML, { status: 200 });
  }
  if (String(url).startsWith('https://api.resend.com/')) {
    return new Response('{}', { status: resendStatus });
  }
  if (String(url).includes('.ingest.sentry.io/')) {
    return new Response('{}', { status: 200 });
  }
  if (String(url).includes('/rest/v1/source_documents')) {
    return new Response(JSON.stringify(docRows), { status: 200 });
  }
  if (String(url).includes('/storage/v1/object/authenticated/')) {
    return new Response(fileBytes, { status: 200 });
  }
  if (String(url).includes('/rest/v1/rpc/consume_ai_quota')) {
    return new Response(rpcReply.body ? JSON.stringify(rpcReply.body) : null, { status: rpcReply.status });
  }
  return realFetch(url, init);
}) as typeof fetch;
beforeEach(() => { calls = []; authStatus = 200; rpcReply = { status: 204, body: null }; docRows = []; fileBytes = Buffer.from('%PDF-1.7 test'); });

const req = (init: RequestInit = {}) => new Request('https://app.test/api/x', { method: 'POST', ...init });
const authed = (extra: Record<string, string> = {}) =>
  ({ authorization: `Bearer ${TOKEN}`, 'x-workspace-id': WS, 'content-type': 'application/json', ...extra });

async function status(p: Promise<unknown>): Promise<number> {
  try { await p; return 200; } catch (e) { return e instanceof HttpError ? e.status : -1; }
}

// ---------- Authentication ----------
test('unauthenticated and malformed requests are rejected without calling Supabase', async () => {
  assert.equal(await status(requireUser(req())), 401);
  assert.equal(await status(requireUser(req({ headers: { authorization: 'Token abc' } }))), 401);
  assert.equal(await status(requireUser(req({ headers: { authorization: 'Bearer <script>' } }))), 401);
  assert.equal(calls.length, 0);
});

test('a session Supabase does not recognise is rejected', async () => {
  authStatus = 401;
  assert.equal(await status(requireUser(req({ headers: authed() }))), 401);
});

test('a valid session returns the Supabase user id, never one from the request', async () => {
  const caller = await requireUser(req({ headers: authed({ 'x-user-id': 'attacker' }) }));
  assert.equal(caller.userId, 'user-1');
  assert.equal(caller.workspaceId, WS);
});

test('workspace id must be a UUID (no injection into the database call)', async () => {
  for (const bad of ['', 'x', `${WS}' or 1=1`, '../../etc']) {
    assert.equal(await status(requireUser(req({ headers: authed({ 'x-workspace-id': bad }) }))), 400);
  }
});

test('missing server configuration fails closed', async () => {
  const url = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  try {
    assert.equal(await status(requireUser(req({ headers: authed() }))), 500);
  } finally {
    process.env.SUPABASE_URL = url;
  }
});

// ---------- Shared AI limits ----------
test('limit reached in the database becomes 429; wrong role or workspace becomes 403', async () => {
  const caller = { userId: 'user-1', token: TOKEN, workspaceId: WS };
  rpcReply = { status: 400, body: { code: 'P0429' } };
  assert.equal(await status(consumeAiQuota(caller, 'receipt')), 429);
  rpcReply = { status: 400, body: { code: '42501' } };
  assert.equal(await status(consumeAiQuota(caller, 'receipt')), 403);
  rpcReply = { status: 204, body: null };
  assert.equal(await status(consumeAiQuota(caller, 'receipt')), 200);
  const rpc = calls.find(c => c.url.includes('consume_ai_quota'))!;
  assert.equal((rpc.init!.headers as any).authorization, `Bearer ${TOKEN}`, 'quota is checked with the user’s own token');
});

test('AI endpoints require sign-in before doing any work', async () => {
  for (const action of ['receipt', 'market']) {
    const res = await aiPOST(req({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});

test('invalid input is rejected before any AI usage is counted', async () => {
  const res = await aiPOST(req({ headers: authed(), body: JSON.stringify({ action: 'receipt', image: 'data:text/html;base64,PGI+' }) }));
  assert.ok(res.status >= 400 && res.status < 500);
  assert.ok(!calls.some(c => c.url.includes('consume_ai_quota')));
});

test('unknown actions are rejected before any AI usage is counted', async () => {
  const res = await aiPOST(req({ headers: authed(), body: JSON.stringify({ action: 'delete-everything' }) }));
  assert.equal(res.status, 400);
  assert.ok(!calls.some(c => c.url.includes('consume_ai_quota')));
});

test('over-limit users never reach the AI provider', async () => {
  rpcReply = { status: 400, body: { code: 'P0429' } };
  const res = await aiPOST(req({ headers: authed(), body: JSON.stringify({ action: 'market', location: 'Dubai Marina', bedrooms: 1 }) }));
  assert.equal(res.status, 429);
});

// ---------- Error handling and request validation ----------
test('unexpected errors return a generic message, not internals', async () => {
  const res = await handle(async () => { throw new Error('db password=hunter2 at /srv/secret.ts:42'); })(req());
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes('hunter2') && !text.includes('/srv'));
});

test('only POST with JSON, within size, is accepted', async () => {
  const json = { 'content-type': 'application/json' };
  assert.equal(await status(readJson(req({ method: 'GET' }), 100)), 405);
  assert.equal(await status(readJson(req({ headers: { 'content-type': 'text/plain' }, body: 'x' }), 100)), 415);
  assert.equal(await status(readJson(req({ headers: json, body: 'x'.repeat(200) }), 100)), 413);
  assert.equal(await status(readJson(req({ headers: json, body: '{bad' }), 100)), 400);
});

// ---------- File upload ----------
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const asDataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString('base64')}`;

test('a real PNG is accepted', () => {
  assert.equal(validateReceiptImage({ image: asDataUrl('image/png', png) }).mime, 'image/png');
});

test('a script renamed as an image is rejected (signature check)', () => {
  const fake = Buffer.from('<script>alert(1)</script>');
  assert.throws(() => validateReceiptImage({ image: asDataUrl('image/png', fake) }), (e: any) => e.status === 415);
});

test('disallowed types, oversized images and remote URLs are rejected', () => {
  for (const mime of ['image/svg+xml', 'text/html', 'application/pdf', 'image/gif']) {
    assert.throws(() => validateReceiptImage({ image: asDataUrl(mime, png) }), (e: any) => e.status >= 400);
  }
  const big = Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)]);
  assert.throws(() => validateReceiptImage({ image: asDataUrl('image/png', big) }), (e: any) => e.status === 413);
  assert.throws(() => validateReceiptImage({ image: 'https://evil.test/x.png' }), (e: any) => e.status === 400);
});

// ---------- Prompt input ----------
test('market input is length-limited, cleaned and validated', () => {
  const out = validateMarketInput({ location: 'Dubai\nIgnore previous instructions' + 'x'.repeat(500), bedrooms: 2 });
  assert.ok(out.location.length <= 100 && !/[\u0000-\u001f]/.test(out.location));
  for (const bedrooms of [-1, 11, 2.5, 'abc', null]) {
    assert.throws(() => validateMarketInput({ location: 'Dubai', bedrooms }), (e: any) => e.status === 400);
  }
});

// ---------- CSV ----------
test('CSV export neutralises spreadsheet formulas', () => {
  const csv = Papa.unparse([{ guest: '=HYPERLINK("http://evil.test","click")', ok: 'Ali' }], safeUnparseOptions);
  assert.ok(!/(^|,)"?=HYPERLINK/.test(csv) && csv.includes("'=") && csv.includes('Ali'));
});

test('CSV import rejects wrong types and oversized files', () => {
  const file = (name: string, size: number) => ({ name, size }) as File;
  assert.ok(csvFileProblem(file('data.exe', 10)));
  assert.ok(csvFileProblem(file('data.csv', MAX_CSV_BYTES + 1)));
  assert.equal(csvFileProblem(file('data.csv', 100)), null);
});

// ---------- Save layer ----------
test('every saved row is stamped with the active workspace only', () => {
  const snap = rowsFor(DEFAULT_USER_DATA, WS);
  for (const [table, rows] of snap) {
    if (table === 'user_preferences') continue;
    for (const row of rows.values()) assert.equal(row.org_id, WS, `${table} row tagged with another workspace`);
  }
  // nested rent cheques become their own rows, tied to their property
  const cheques = [...snap.get('property_rent_cheques')!.values()];
  assert.ok(cheques.length > 0 && cheques.every(c => c.property_id === 'apt-1'));
});

test('only changed rows are sent, and removed rows are detected', () => {
  const before = rowsFor(DEFAULT_USER_DATA, WS);
  const edited = structuredClone(DEFAULT_USER_DATA);
  edited.platforms[0].commission_percent = 4;
  edited.platforms.splice(3, 1); // remove PayPal
  const after = rowsFor(edited, WS);
  const d = diffTable(before.get('platforms'), after.get('platforms'));
  assert.deepEqual(d.upserts.map(([k]) => k), ['airbnb']);
  assert.deepEqual(d.deletes, ['paypal']);
  assert.deepEqual(diffTable(before.get('vendors'), after.get('vendors')), { upserts: [], deletes: [] });
});

test('bad dates are stored as empty, never sent as invalid values', () => {
  assert.equal(toDate('2026-11-05'), '2026-11-05');
  assert.equal(toDate('2026-11-05T10:00:00Z'), '2026-11-05');
  for (const v of ['05/11/2026', '', 'tomorrow', null, 42]) assert.equal(toDate(v), null);
});

// ---------- Documents (OTA PDFs, bank statements, payout reports) ----------
const DOC = '99999999-2222-4333-8444-555555555555';
const docReq = (documentId: unknown) => aiPOST(req({ headers: authed(), body: JSON.stringify({ action: 'document', documentId }) }));
const usedQuota = () => calls.some(c => c.url.includes('consume_ai_quota'));

test('document reading requires sign-in', async () => {
  const res = await aiPOST(req({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'document', documentId: DOC }) }));
  assert.equal(res.status, 401);
});

test('a malformed document id is rejected before anything is fetched', async () => {
  for (const bad of ['', '../../etc/passwd', `${DOC}' or 1=1`, 42]) {
    assert.equal((await docReq(bad)).status, 400);
  }
  assert.ok(!calls.some(c => c.url.includes('source_documents')) && !usedQuota());
});

test("a document the caller cannot see (another workspace, or none) is not found, and no AI use is counted", async () => {
  docRows = [];
  assert.equal((await docReq(DOC)).status, 404);
  assert.ok(!usedQuota());
  // the lookup is scoped to the caller's workspace and made with the caller's own token
  const lookup = calls.find(c => c.url.includes('source_documents'))!;
  assert.ok(lookup.url.includes(`org_id=eq.${WS}`));
  assert.equal((lookup.init!.headers as any).authorization, `Bearer ${TOKEN}`);
});

test('a stored path outside the workspace folder is refused', async () => {
  docRows = [{ kind: 'bookings', file_path: `other-org/bookings/x.pdf`, platform_id: null, file_size: 10 }];
  assert.equal((await docReq(DOC)).status, 400);
  docRows = [{ kind: 'bookings', file_path: `${WS}/bookings/../../x.pdf`, platform_id: null, file_size: 10 }];
  assert.equal((await docReq(DOC)).status, 400);
  assert.ok(!usedQuota());
});

test('oversized files are refused before reading', async () => {
  docRows = [{ kind: 'bookings', file_path: `${WS}/bookings/x.pdf`, platform_id: null, file_size: 16 * 1024 * 1024 }];
  assert.equal((await docReq(DOC)).status, 413);
  assert.ok(!usedQuota());
});

test('binary files posing as documents are refused', async () => {
  docRows = [{ kind: 'bookings', file_path: `${WS}/bookings/x.pdf`, platform_id: null, file_size: 10 }];
  fileBytes = Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02]); // an executable header
  assert.equal((await docReq(DOC)).status, 415);
  assert.equal(detectType(Buffer.from('%PDF-1.4')), 'application/pdf');
  assert.equal(detectType(Buffer.from('date,amount\n2026-01-01,10')), 'text/csv');
});

test('without an AI key, reading fails clearly after the usage check', async () => {
  docRows = [{ kind: 'bookings', file_path: `${WS}/bookings/x.pdf`, platform_id: null, file_size: 10 }];
  const res = await docReq(DOC);
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /not configured/);
});

test('AI output for bookings is cleaned: bad rows dropped, codes and text made safe', () => {
  const out = cleanBookings({
    platform: 'Airbnb, Inc.',
    bookings: [
      { reservation_code: 'HM4X<script>', guest_name: 'Ali\u0000 Khan', check_in: '2026-03-01', check_out: '2026-03-04', host_payout: '1,250.50', status: 'Confirmed' },
      { reservation_code: 'BAD1', check_in: '2026-02-30', check_out: '2026-03-02' },
      { reservation_code: 'BAD2', check_in: '2026-03-05', check_out: '2026-03-01' },
      { reservation_code: '', check_in: '2026-03-01', check_out: '2026-03-02' },
      { reservation_code: 'CXL9', check_in: '2026-04-01', check_out: '2026-04-02', status: 'Cancelled by guest' },
    ],
  });
  assert.equal(out.platform, 'airbnb');
  assert.equal(out.rows.length, 2);
  assert.equal(out.skipped, 3);
  assert.equal(out.rows[0].reservation_code, 'HM4Xscript');
  assert.equal(out.rows[0].guest_name, 'Ali Khan');
  assert.equal(out.rows[0].nights, 3);
  assert.equal(out.rows[0].host_payout, 1250.5);
  assert.equal(out.rows[1].status, 'cancelled');
});

test('bank statements keep only money received', () => {
  const out = cleanBankStatement({ transactions: [
    { date: '2026-03-02', amount: 1250.5, description: 'AIRBNB PAYMENTS UK 0302', reference: 'G-123' },
    { date: '2026-03-03', amount: -5000, description: 'Rent cheque' },
    { date: 'yesterday', amount: 10 },
  ] });
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].platform, 'airbnb');
  assert.equal(out.skipped, 2);
});

test('payout reports keep the bookings each payout covers', () => {
  const out = cleanPayoutReport({ platform: 'Booking.com', payouts: [
    { date: '2026-03-10', amount: 2400, reference: 'PO-1', items: [{ reservation_code: '4012345678', amount: 1400 }, { reservation_code: '4012345679', amount: 1000 }, { amount: 5 }] },
    { date: '2026-03-11', amount: 0 },
  ] });
  assert.equal(out.platform, 'booking');
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].items.length, 2);
});

test('dates and amounts outside sensible ranges are rejected', () => {
  assert.equal(cleanDate('1899-01-01'), null);
  assert.equal(cleanDate('2026-02-29'), null);
  assert.equal(cleanDate('2028-02-29'), '2028-02-29');
  assert.equal(cleanMoney('AED 1,234.567'), 1234.57);
  assert.equal(cleanMoney(1e12), null);
  assert.equal(cleanMoney('n/a'), null);
});

// ---------- Error monitoring ----------
test('server error reports leave out secrets and emails', () => {
  const msg = scrubServer('failed for ali@example.com with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmno and sb_secret_abc123 password=hunter2');
  assert.ok(!/ali@example|eyJhbGci|sb_secret_abc|hunter2/.test(msg));
});

test('reports are sent only when a valid DSN is configured, and only the scrubbed error', async () => {
  delete process.env.SENTRY_DSN;
  await reportServerError(new Error('x'), '/api/ai');
  assert.ok(!calls.some(c => c.url.includes('sentry')));
  assert.equal(parseDsn('not a dsn'), null);
  process.env.SENTRY_DSN = 'https://abc123@o1.ingest.sentry.io/42';
  try {
    await reportServerError(new Error('boom for ali@example.com'), '/api/ai');
    const sent = calls.find(c => c.url.startsWith('https://o1.ingest.sentry.io/api/42/envelope/'));
    assert.ok(sent);
    const body = String(sent!.init!.body);
    assert.ok(body.includes('boom for [email]') && !body.includes('ali@example.com'));
    assert.ok(!/authorization|cookie/i.test(body));
  } finally {
    delete process.env.SENTRY_DSN;
  }
});

test('browser error reports leave out emails, tokens, keys and sign-in codes', () => {
  const out = scrubBrowser('ali@example.com https://app.test/update-password#access_token=abc.def&code=123 sb_publishable_xyz AIzaSyA1234567890123456789012345');
  assert.ok(!/ali@example|abc\.def|code=123|sb_publishable_xyz|AIzaSy/.test(out), out);
});

// ---------- Reminder emails ----------
const SECRET = 'cron-secret-0123456789abcdef0123456789abcdef';
const ORG_A = '22222222-2222-4222-8222-222222222222';
const reminder = (o: any = {}) => ({ reminder_key: `cheque:${ORG_A}:p1:c1:cheque_7d|x`, kind: 'cheque_7d', org_id: ORG_A, org_name: 'Qamar Homes',
  email: 'owner@example.test', details: { property: 'Marina 1BR', amount: 27500, currency: 'AED', due_date: '2026-11-20', cheque_number: '0001' }, ...o });
const cronReq = (auth?: string) => new Request('https://app.test/api/cron/reminders', { method: 'GET', headers: auth ? { authorization: auth } : {} });
function withEnv(fn: () => Promise<void>) {
  return async () => {
    Object.assign(process.env, { CRON_SECRET: SECRET, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Staylytics <r@example.test>', APP_URL: 'https://app.example.test' });
    cronDue = []; resendStatus = 200;
    try { await fn(); } finally { for (const k of ['CRON_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL']) delete process.env[k]; }
  };
}

test('the reminder job refuses calls without the exact secret', withEnv(async () => {
  assert.equal((await cronGET(cronReq())).status, 401);
  assert.equal((await cronGET(cronReq('Bearer wrong'))).status, 401);
  assert.equal((await cronGET(cronReq(`Bearer ${SECRET}x`))).status, 401);
  assert.ok(!calls.some(c => c.url.includes('cron_reminders_due')));
}));

test('one email per person per workspace, and only sent reminders are recorded', withEnv(async () => {
  cronDue = [reminder(), reminder({ reminder_key: `trial:${ORG_A}:trial_3d|x`, kind: 'trial_3d', details: { trial_ends_on: '2026-11-16' } }),
             reminder({ email: 'manager@example.test', reminder_key: `cheque:${ORG_A}:p1:c1:cheque_7d|y` })];
  const res = await cronGET(cronReq(`Bearer ${SECRET}`));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { due: 3, emails: 2, sent: 2, failed: 0 });
  assert.equal(calls.filter(c => c.url.startsWith('https://api.resend.com/')).length, 2);
  const marked = JSON.parse(String(calls.find(c => c.url.includes('cron_mark_reminders_sent'))!.init!.body));
  assert.equal(marked.p_keys.length, 3);
}));

test('if sending fails, nothing is marked, so it is retried tomorrow', withEnv(async () => {
  cronDue = [reminder()];
  resendStatus = 500;
  const res = await cronGET(cronReq(`Bearer ${SECRET}`));
  assert.deepEqual(await res.json(), { due: 1, emails: 1, sent: 0, failed: 1 });
  assert.ok(!calls.some(c => c.url.includes('cron_mark_reminders_sent')));
}));

test('without email settings the job stops before reading anything', async () => {
  process.env.CRON_SECRET = SECRET;
  try {
    assert.equal((await cronGET(cronReq(`Bearer ${SECRET}`))).status, 503);
    assert.ok(!calls.some(c => c.url.includes('cron_reminders_due')));
  } finally { delete process.env.CRON_SECRET; }
});

test('reminder emails escape every value and read clearly', () => {
  const e = buildEmail([reminder({ org_name: 'Qamar <script>alert(1)</script>', details: { property: '<img src=x onerror=1>', amount: 27500, currency: 'AED', due_date: '2026-11-20', cheque_number: '0001' } })], 'https://app.example.test');
  assert.ok(!e.html.includes('<script>') && !e.html.includes('<img'));
  assert.match(e.text, /rent cheque 0001 for <img src=x onerror=1> \(AED 27,500\) is due in 7 days, on 20 November 2026/);
  assert.match(e.subject, /^Rent cheque due in 7 days/);
});

/* ---------- daily exchange rates job ---------- */

const ratesReq = (auth?: string) => new Request('https://app.test/api/cron/rates', { method: 'GET', headers: auth ? { authorization: auth } : {} });

test('the rates job refuses calls without the exact secret', async () => {
  process.env.CRON_SECRET = SECRET;
  try {
    assert.equal((await ratesGET(ratesReq())).status, 401);
    assert.equal((await ratesGET(ratesReq('Bearer nope'))).status, 401);
    assert.ok(!calls.some(c => c.url.includes('cron_rates_status') || c.url.includes('ecb.europa.eu')));
  } finally { delete process.env.CRON_SECRET; }
});

test('the rates job stores only new days, and fills older history once when bookings need it', async () => {
  process.env.CRON_SECRET = SECRET;
  try {
    calls.length = 0;
    ratesStatus = { latest_stored: '2026-11-11', earliest_stored: '2026-08-20', earliest_needed: '2026-03-05' };
    const res = await ratesGET(ratesReq(`Bearer ${SECRET}`));
    assert.equal(res.status, 200);
    const stores = calls.filter(c => c.url.includes('cron_store_rates')).map(c => JSON.parse(String(c.init!.body)));
    assert.ok(stores.every(b => b.p_token === SECRET));
    const sent = stores.flatMap(b => Object.keys(b.p_days)).sort();
    // new: 11 and 12 Nov from the 90-day file (11 Nov is re-sent; the database skips days it holds);
    // history: from a week before 5 Mar (so the 5th has an earlier rate) up to the oldest stored day.
    assert.deepEqual(sent, ['2026-02-27', '2026-03-02', '2026-11-11', '2026-11-12']);
    assert.ok(calls.some(c => c.url.includes('eurofxref-hist.xml')));
  } finally { delete process.env.CRON_SECRET; ratesStatus = { latest_stored: null, earliest_stored: null, earliest_needed: null }; }
});
