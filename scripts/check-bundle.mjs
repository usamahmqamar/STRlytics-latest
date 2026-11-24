// Fails the build check if secrets or debug artefacts reach the browser bundle.
// Usage: npm run build && npm run check:bundle
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist';
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(dir);

const problems = [];
const forbidden = [
  ['Gemini API endpoint (AI calls must go through /api)', /generativelanguage\.googleapis\.com/],
  ['private key material', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['guest sign-in bypass', /guest_user/],
  ['Supabase secret or service-role key', /sb_secret_[A-Za-z0-9_-]+|"role"\s*:\s*"service_role"|service_role/],
  ['leftover Firebase SDK', /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com/],
];
const secretValues = [process.env.GEMINI_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY].filter(v => v && v.length > 8);

for (const f of files) {
  if (f.endsWith('.map')) problems.push(`${f}: source map published`);
  if (!/\.(js|html|css|json)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [label, re] of forbidden) if (re.test(text)) problems.push(`${f}: ${label}`);
  for (const v of secretValues) if (text.includes(v)) problems.push(`${f}: contains the server GEMINI_API_KEY value`);
}

if (problems.length) {
  console.error('Bundle security check FAILED:\n' + problems.map(p => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Bundle security check passed (${files.length} files).`);
