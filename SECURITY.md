# Security notes: Staylytics

How the app is protected, what must be configured outside the code, and how to deploy or roll back the `security-hardening` changes.

## How data is protected

- **Sign-in is required.** Google sign-in through Firebase Auth. There is no guest mode.
- **Each user sees only their own data.** Firestore rules (`firestore.rules`) allow a user to read and write only `users/{uid}` and `user_data/{uid}` for their own uid. Listing other users' documents is blocked, and every other path is denied.
- **AI keys stay on the server.** Receipt scanning and market analysis run in Vercel functions (`api/ai/*`). Each request must carry the user's Firebase ID token, which the server verifies against Google's public keys before calling Gemini.
- **Inputs are checked on the server.** Images must be real JPEG, PNG or WebP files (checked by file signature) of 3 MB or less. Market lookups accept a short place name and 0–10 bedrooms. Responses are trimmed to expected fields.
- **Per-user rate limits** on AI endpoints (20 receipts and 10 market analyses an hour, per warm server instance).
- **CSV safety.** Imports are limited to `.csv` files of 5 MB and 5,000 rows, with long cells trimmed. Exports neutralise spreadsheet formulas.
- **Security headers** in `vercel.json` (and `nginx.conf` for Docker): HSTS, no MIME sniffing, no framing, strict referrer, limited browser permissions, and a Content Security Policy (currently report-only; see below).
- **No source maps or debug logs** in production builds.

## Environment variables

| Name | Where | Secret? | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Vercel, server | **Yes** | Gemini calls from `api/ai/*` only |
| `FIREBASE_PROJECT_ID` | Vercel, server | No | Verifying users' sign-in tokens |
| `VITE_FIREBASE_*` | Vercel, build | No | Public Firebase web config |

**Never create `VITE_GEMINI_API_KEY`.** Anything starting with `VITE_` is copied into the browser bundle.

## Manual actions (outside the code)

1. **Rotate the Gemini key** if `VITE_GEMINI_API_KEY` or `GEMINI_API_KEY` was ever set on the Vercel project: old builds placed it in public JavaScript. Create a new key in Google AI Studio, delete the old one, and store the new one only as `GEMINI_API_KEY`.
2. **Restrict the Firebase browser key** (Google Cloud Console → APIs & Services → Credentials): allow only your site's domains as HTTP referrers, and only the Identity Toolkit, Token Service and Cloud Firestore APIs. The key is meant to be public, but restricting it limits abuse.
3. **Firebase Auth → Settings → Authorized domains:** keep only your production domain(s) and `localhost`.
4. **Deploy `firestore.rules`** and confirm in the Firebase console that the live rules match this file.
5. **Turn on Firebase App Check** (reCAPTCHA Enterprise) for Firestore and Auth, first in monitoring mode, then enforced.
6. **Enforce the CSP:** after a day with no CSP reports in the browser console during sign-in, receipt scanning and normal use, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `vercel.json` and `nginx.conf`.
7. **Consider making the GitHub repository private.** It is currently public.
8. **Before opening sign-ups widely,** replace the in-memory rate limit with a shared store (for example Upstash Redis or a Firestore counter) and set a Gemini spending cap.

## Checks to run

```bash
npm run lint            # type check
npm run test:security   # server auth, validation, upload, CSV tests
npm run build && npm run check:bundle   # no secrets, Gemini endpoint or source maps in dist/
```

## Deploying

1. Set `GEMINI_API_KEY` (new key) and `FIREBASE_PROJECT_ID` for **Preview** and **Production** in Vercel. Remove any `VITE_GEMINI_API_KEY`.
2. Push the `security-hardening` branch and open the Vercel **preview** deployment.
3. On the preview: sign in with Google, check that your data loads and saves (the "Saved" indicator), scan one receipt, run one market analysis, import and export a CSV, sign out, and confirm the sign-in screen appears.
4. Deploy `firestore.rules` (`firebase deploy --only firestore:rules`).
5. Merge to `main` to deploy production, then repeat the step 3 checks on the live site.

## Rolling back

- **App:** in Vercel → Deployments, promote the previous production deployment (instant), or revert the merge commit on `main`.
- **Firestore rules:** the Firebase console keeps rule history. Re-publish the previous version from there.
- No data migration is involved, so rolling back does not affect stored data.
