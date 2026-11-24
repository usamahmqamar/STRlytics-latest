/**
 * Data export tests. Run with: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { buildExport } from '../src/components/YourData';
import { DEFAULT_USER_DATA } from '../src/constants';

globalThis.fetch = (async () => new Response('[]', { status: 503 })) as any; // no server in tests

test('export has a CSV per table, a README, and no formula injection', async () => {
  const data = structuredClone(DEFAULT_USER_DATA);
  data.reservations[0].guest_name = '=HYPERLINK("http://evil.test","x")';
  const ws: any = { id: '11111111-2222-4333-8444-555555555555', name: 'Test Co', role: 'owner', status: 'active' };
  const { zip, files } = await buildExport(data, ws);
  const out = unzipSync(zip);
  assert.ok(out['README.txt']);
  for (const f of ['reservations.csv', 'properties.csv', 'property_rent_cheques.csv', 'platforms.csv']) {
    assert.ok(files.includes(f), `${f} missing`);
  }
  const csv = strFromU8(out['reservations.csv']);
  assert.ok(csv.includes(`"'=HYPERLINK`), 'formula is neutralised');
  assert.ok(!csv.split('\n')[0].includes('org_id'), 'internal workspace id is left out');
});
