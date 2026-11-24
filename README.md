# STRlytics

Short-term rental analytics for operators: daily P&L per listing, cash flow, rent cheques, operations.
Working name; the final brand is decided later.

This `saas` branch turns the single-user app into a multi-tenant SaaS billed per active listing.
The build plan and status live in the "STRlytics Review" doc.

## Stack

- React 19 + Vite + Tailwind, React Router (`/app/:tab`)
- Supabase (Postgres, Auth, row-level security); Firebase has been removed
- Vercel for hosting; server functions in `api/` (Gemini calls run there, never in the browser)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
npm run lint                 # type-check
npm run test:security        # server auth, AI limits, upload, CSV and save-layer tests
```

## Database

Migrations live in `supabase/migrations/`, policy tests in `supabase/tests/`.

```bash
# Runs all migrations + tests against a disposable Postgres (CI does the same):
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

`supabase/tests/_shim_supabase_auth.sql` imitates Supabase's `auth` schema and roles for plain Postgres.
It is for tests only and must never be applied to a Supabase project.

## Environment variables

See `.env.example`. Anything prefixed `VITE_` is shipped to the browser, so secrets
(`GEMINI_API_KEY`) must never use that prefix. No service-role key is used. See `SECURITY.md`.
