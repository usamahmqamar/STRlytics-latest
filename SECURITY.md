# Security notes: Staylytics

How the app is protected, what must be configured outside the code, and how to deploy or roll back.

## How data is protected

- **Supabase Auth.** Sign-in with Google or email and password (`/login`, `/signup`); email confirmation, password reset and invitation links; PKCE flow; no guest mode. Signed-out visitors always land on `/login`.
- **Workspaces and roles.** Every record belongs to a workspace (`organizations`). Row-level security (RLS) on every table:
  - viewer: read-only
  - staff: edit day-to-day records (reservations, expenses, services, bills, assets, documents, tasks, templates)
  - owner and manager: also properties, rent cheques, setup costs, platforms, vendors, invoices, payments, bank reconciliations, workspace settings
- **Rows cannot be moved** to another workspace or property (`private.lock_tenant_columns`).
- **Read-only when unpaid.** Writes are refused when a workspace is `read_only` or `cancelled`, or more than 5 days past its trial (`private.org_is_writable`). Data stays readable.
- **No anonymous access** to any table, and no `TRUNCATE` for app users (it bypasses RLS).
- **Database limits** on every text, number and JSON column. Document links must be `https://`.
- **AI keys stay on the server.** `/api/ai` checks the session and that the caller belongs to the workspace in `X-Workspace-Id` with Supabase Auth, then records usage through `public.consume_ai_quota`: 20 receipts and 10 market analyses per user per hour, and 300 calls per workspace per day, shared across all server instances.
- **Inputs are checked on the server.** Images must be real JPEG, PNG or WebP files of 3 MB or less. CSV files are limited to 5 MB and 5,000 rows, and exports are formula-safe.
- **Security headers** in `vercel.json` (HSTS, no framing, nosniff, strict referrer, permissions policy; Content-Security-Policy in report-only mode until verified on a preview, then switch it to enforcing). No source maps or debug logs in production.

## Environment variables

| Name | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel, build | No | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel, build | No | `sb_publishable_...` key (safe because of RLS) |
| `GEMINI_API_KEY` | Vercel, server | **Yes** | Gemini calls from `api/ai.ts` only |

No Supabase secret or service-role key is used anywhere. Never add one with a `VITE_` prefix.

## Manual actions in the Supabase dashboard

1. **Authentication → Providers → Google:** create an OAuth client in Google Cloud (authorised redirect URI `https://<project>.supabase.co/auth/v1/callback`), then paste its client ID and secret.
2. **Authentication → URL configuration:** set the Site URL to the production domain; allow only that domain and `http://localhost:3000` as redirect URLs.
3. **Authentication → Providers → Email:** keep "Confirm email" on. Set a minimum password length of 10 or more. Turn on leaked-password protection (requires the Pro plan).
4. **Authentication → Rate limits:** keep the defaults or lower them for sign-in, sign-up and password reset.
5. **Authentication → Emails → SMTP:** use your own SMTP provider before launch. The built-in sender is for testing only and heavily rate-limited.
6. **Database → Backups:** confirm daily backups; consider point-in-time recovery.
7. **Billing (later):** a server-only Paddle webhook (verified signature) should be the only thing that changes `organizations.status` and `trial_ends_at`.
8. **Rotate the old Gemini key** if it was ever set as `VITE_GEMINI_API_KEY`, and delete the old Firebase project, or at least restrict its browser key.

## Database tests

`npm run test:db` runs every migration and policy test on a disposable Postgres; CI runs it on each pull request.

- `supabase/tests/core_data_test.sql`: attack checks across workspaces, roles, read-only mode, trial expiry, anonymous access and AI limits for the data tables.
- `tenancy_test.sql`, `team_test.sql`, `onboarding_test.sql`, `hardening_test.sql`: sign-up provisioning, invitations, roles and locked-down helper functions.

## Checks to run

```bash
npm run lint            # type check
npm run test:security   # server auth, AI limits, validation, upload, CSV, save-layer tests
npm run build && npm run check:bundle   # no secrets, Gemini endpoint or source maps in dist/
DATABASE_URL=postgres://... npm run test:db   # migrations + row-level security tests
```

## Deploying

1. Apply `supabase/migrations/*.sql` to the target Supabase project, in order (`supabase db push`). Never apply `supabase/tests/_shim_supabase_auth.sql` to a real project.
2. Complete the dashboard steps above.
3. In Vercel, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `GEMINI_API_KEY` for Preview and Production. Remove old `VITE_FIREBASE_*`, `VITE_GEMINI_API_KEY` and `FIREBASE_PROJECT_ID` variables.
4. On the preview deployment, check: sign up by email (confirm the email), sign in with Google, add a property and a reservation, reload (the data is still there), invite a second account as viewer and confirm it is read-only, scan a receipt, import and export a CSV, then sign out.
5. Merge to `main` to deploy production.

## Rolling back

- **App:** in Vercel → Deployments, promote the previous production deployment (instant), or revert the merge commit on `main`.
- **Database:** the new tables are additive. Rolling the app back needs no database change; leave the tables in place.

## Files, payouts and reconciliation

- Uploaded files live in a private storage bucket (`workspace-files`), one folder per workspace:
  `<workspace>/bookings/` (booking PDFs: all members read, staff and above upload) and
  `<workspace>/finance/` (bank statements and payout reports: owners and managers only).
  Files are never overwritten; only owners and managers can delete them. Links to open a file
  are signed and expire after 2 minutes.
- Payouts, payout matches and explained differences are visible to owners and managers only.
  A payout cannot be matched beyond its own amount (database trigger).
- `/api/ai` with `action: 'document'` reads a stored file using the caller's own token, so
  storage and row-level security decide access; the server holds no storage secret. Files are
  checked by content (PDF signature or plain text), capped at 15 MB, and counted against the
  AI limits (30 documents per user per hour). AI output is treated as untrusted: dates, amounts,
  codes and text are validated and cleaned, and nothing is saved until a person reviews it.
- Tests: `supabase/tests/payouts_test.sql` (roles, other workspaces, read-only mode, storage
  folders, allocation cap, account deletion) and the document tests in `tests/security.test.ts`.

## Data export and workspace deletion

- Settings > Your data downloads every table the user can see as formula-safe CSV files in one
  ZIP (payouts only for owners and managers). The internal workspace id is left out.
- Owners can request deletion by typing the workspace name (`request_workspace_deletion`).
  The workspace becomes read-only at once and any owner can cancel for 30 days
  (`cancel_workspace_deletion`). The deletion columns cannot be changed directly.
- `private.purge_deleted_workspace(org)` removes a workspace whose hold has passed. It is not
  callable by app users and **is not scheduled**: scheduling it (for example a daily pg_cron
  job) permanently deletes customer data and needs the owner's explicit approval first.
  Stored files under the workspace folder must be removed with the Storage API at the same time.
- Tests: `supabase/tests/deletion_test.sql`, `tests/export.test.ts`.

## Error monitoring

- Browser: `@sentry/browser`, loaded only when `VITE_SENTRY_DSN` is set. No IPs, cookies,
  headers, request bodies or typed input; users identified by internal id only; emails,
  tokens, keys and sign-in codes are replaced before sending. Each screen has an error
  boundary, so a crash in one screen leaves the rest of the app usable.
- Server: unexpected errors and 5xx responses are sent to `SENTRY_DSN` with the error type,
  a scrubbed message and stack only (`api/_lib/monitor.ts`).
- The Content-Security-Policy allows Sentry's ingest hosts in `connect-src`.

## Reminder emails

- Vercel Cron calls `/api/cron/reminders` daily with `Authorization: Bearer CRON_SECRET`
  (compared in constant time). The job calls two database functions with the publishable key;
  each requires the same secret, whose SHA-256 is stored in `private.app_settings`. No
  service-role key is used, and the secret unlocks only these two functions, which signed-in
  users cannot call at all.
- Recipients: owners and managers who have not turned reminders off. Workspaces pending
  deletion get none. Each reminder is logged once per person (email stored as an MD5 in the
  key, not in clear) and only after Resend accepts it, so failures retry the next day.
- Every value in an email is HTML-escaped. Tests: `reminders_test.sql`, cron tests in
  `tests/security.test.ts`.

## Currencies and exchange rates

- Every amount is stored in its own currency (a checked code from `public.currencies`); a row
  that arrives without one takes its property's currency, else the workspace's. A property's
  currency cannot change once anything is recorded against it (database trigger).
- Daily rates live in `public.fx_rates`: readable by signed-in users (public market data),
  writable by nobody except the job. Vercel Cron calls `/api/cron/rates` with the same
  `CRON_SECRET`; it fetches the ECB reference rates and stores them through
  `cron_store_rates` / `cron_rates_status`, which require the token and cannot be called by
  signed-in users. Stored days are never overwritten. Dollar-pegged currencies (AED, SAR, QAR,
  OMR, BHD) use their fixed peg.
- Conversion happens only on screen; converted figures are never saved. Tests:
  `multi_currency_test.sql`, `tests/money.test.ts`.
