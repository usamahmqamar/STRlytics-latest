// Fails when api/_lib/ownerReportsCore.js is out of date with src (run `npm run build:server`).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const banner = '// Generated from src/server/ownerReports.ts by npm run build:server. Do not edit.';
const result = await build({
  entryPoints: ['src/server/ownerReports.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20',
  packages: 'external', legalComments: 'none', logLevel: 'warning', write: false, banner: { js: banner },
});
const fresh = result.outputFiles[0].text;
const committed = readFileSync('api/_lib/ownerReportsCore.js', 'utf8');
if (fresh !== committed) {
  console.error('api/_lib/ownerReportsCore.js is out of date. Run: npm run build:server');
  process.exit(1);
}
console.log('Server bundle is up to date.');
