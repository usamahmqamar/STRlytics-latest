# Security notes: Staylytics

How the app is protected, what must be configured outside the code, and how to deploy or roll back the `security-hardening` changes.

## How data is protected

- **Supabase Auth.** Sign-in with Google or email and password; email confirmation and password reset; PKCE flow; no guest mode.
- **Workspaces and roles.** Every record belongs to a workspace (`organizations`). Row-level security (RLS) on every table:
  - viewer: read-only
  - staff: edit day-to-day records (reservations, expenses, services, bills, assets, documents, tasks, templates)
  - owner and manager: also properties, rent cheques, setup costs, platforms, vendors, invoices, payments, bank reconciliations, workspace settings
- **Rows cannot be moved** to another workspace or property (`private.lock_tenant_columns`).
- **Read-only when unpaid.** Writes are refused when a workspace is `read_only` or `cancelled`, or more than 5 days past its trial (`private.org_is_writable`). Data stays readable.
- **No anonymous access** to any table, and no `TRUNCATE` for app users (it bypasses RLS).
- **Database limits** on every text, number and JSON column. Document links must be `https://`.
- **AI keys stay on the server.** `api/ai/*` checks the session with Supabase Auth, then records usage through `public.consume_ai_quota`: 20 receipts and 10 market analyses per user per hour, and 300 calls per workspace per day, shared across all server instances.
- **Inputs are checked on the server.** Images must be real JPEG, PNG or WebP files of 3 MB or less. CSV files are limited to 5 MB and 5,000 rows, and exports are formula-safe.
- **Security headers** in `vercel.json` and `nginx.conf`. No source maps or debug logs in production.

## Environment variables

| Name | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel, build | No | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel, build | No | `sb_publishable_...` key (safe because of RLS) |
| `GEMINI_API_KEY` | Vercel, server | **Yes** | Gemini calls from `api/ai/*` only |

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

- `supabase/tests/rls_access_test.sql`: 26 attack checks across workspaces, roles, read-only mode, trial expiry, anonymous access and AI limits. Paste it into the SQL editor; it rolls itself back. Any `FAIL` in the message is a problem.

## Checks to run

```bash
npm run lint            # type check
npm run test:security   # server auth, AI limits, validation, upload, CSV, save-layer tests
npm run build && npm run check:bundle   # no secrets, Gemini endpoint or source maps in dist/
```

## Deploying

1. Apply `supabase/migrations/*.sql` to the target Supabase project, in order, and run `supabase/tests/rls_access_test.sql`.
2. Complete the dashboard steps above.
3. In Vercel, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `GEMINI_API_KEY` for Preview and Production. Remove old `VITE_FIREBASE_*`, `VITE_GEMINI_API_KEY` and `FIREBASE_PROJECT_ID` variables.
4. On the preview deployment, check: sign up by email (confirm the email), sign in with Google, add a property and a reservation, reload (the data is still there), invite a second account as viewer and confirm it is read-only, scan a receipt, import and export a CSV, then sign out.
5. Merge to `main` to deploy production.

## Rolling back

- **App:** in Vercel → Deployments, promote the previous production deployment (instant), or revert the merge commit on `main`.
- **Database:** the new tables are additive. Rolling the app back to the Firebase version needs no database change; leave the tables in place.
