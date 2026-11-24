/**
 * Saving tests: changes are saved one record at a time and never overwrite a teammate's newer edit.
 * A small in-memory stand-in mimics the Supabase query builder (eq filters, insert, update,
 * delete, select, maybeSingle) and bumps updated_at on every write like the database trigger.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsFor, saveChanges, type Versions } from '../src/services/dataStore';
import { DEFAULT_USER_DATA } from '../src/constants';

const ORG = '11111111-2222-4333-8444-555555555555';
const ws: any = { id: ORG, name: 'T', role: 'owner', status: 'active', trial_ends_at: null };
let clock = 0;
const stamp = () => `2026-11-13T00:00:${String(++clock).padStart(2, '0')}.000000+00:00`;

function fakeDb(tables: Record<string, any[]>) {
  const calls: string[] = [];
  const from = (table: string) => {
    tables[table] ??= [];
    let op = 'select'; let payload: any; let single = false;
    const eqs: [string, any][] = [];
    const q: any = {
      insert(p: any) { op = 'insert'; payload = p; return q; },
      update(p: any) { op = 'update'; payload = p; return q; },
      upsert(p: any) { op = 'upsert'; payload = p; return q; },
      delete() { op = 'delete'; return q; },
      select() { return q; },
      eq(k: string, v: any) { eqs.push([k, v]); return q; },
      in() { return q; },
      maybeSingle() { single = true; return q; },
      then(res: any) {
        calls.push(`${op} ${table}`);
        const rows = tables[table];
        const match = (r: any) => eqs.every(([k, v]) => r[k] === v);
        let out: any = { data: null, error: null };
        if (op === 'insert') {
          const list = Array.isArray(payload) ? payload : [payload];
          if (list.some((r: any) => rows.some(x => x.id === r.id && x.property_id === r.property_id))) out = { data: null, error: { code: '23505' } };
          else { const added = list.map((r: any) => ({ ...r, updated_at: stamp() })); rows.push(...added); out = { data: added, error: null }; }
        } else if (op === 'update') {
          const hit = rows.filter(match); hit.forEach(r => Object.assign(r, payload, { updated_at: stamp() }));
          out = { data: hit.map(r => ({ updated_at: r.updated_at })), error: null };
        } else if (op === 'delete') {
          const hit = rows.filter(match); tables[table] = rows.filter(r => !match(r));
          out = { data: hit.map(r => ({ id: r.id })), error: null };
        } else if (op === 'upsert') {
          out = { data: null, error: null };
        } else {
          const hit = rows.filter(match); out = { data: single ? hit[0] ?? null : hit, error: null };
        }
        return Promise.resolve(out).then(res);
      },
    };
    return q;
  };
  return { db: { from }, tables, calls };
}

// Start from the sample data already "saved" in the fake database.
function setup() {
  const data = structuredClone(DEFAULT_USER_DATA);
  const snap = rowsFor(data, ORG);
  const tables: Record<string, any[]> = {};
  const versions: Versions = new Map();
  for (const [t, rows] of snap) {
    if (t === 'user_preferences' || t === 'workspace_settings') continue;
    tables[t] = [...rows.values()].map(r => ({ ...r, updated_at: stamp() }));
    versions.set(t, new Map([...rows.keys()].map((k, i) => [k, tables[t][i].updated_at])));
  }
  return { data, snap, versions, ...fakeDb(tables) };
}

test('only the changed record is written', async () => {
  const { data, snap, versions, db, calls } = setup();
  const edited = structuredClone(data);
  edited.reservations[0].guest_name = 'Changed';
  const r = await saveChanges(ws, 'u', snap, edited, versions, db);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(calls, ['update reservations']);
});

test("a teammate's newer edit is never overwritten", async () => {
  const { data, snap, versions, db, tables } = setup();
  const code = data.reservations[0].reservation_code;
  // teammate saves first
  const theirs = tables.reservations.find(r => r.id === code);
  theirs.guest_name = 'Teammate version'; theirs.updated_at = stamp();
  // I edit the same booking from my stale copy
  const mine = structuredClone(data);
  mine.reservations[0].guest_name = 'My version';
  const r = await saveChanges(ws, 'u', snap, mine, versions, db);
  assert.deepEqual(r.conflicts, [{ table: 'reservations', key: code }]);
  assert.equal(tables.reservations.find(x => x.id === code).guest_name, 'Teammate version');
  // my snapshot still shows the old confirmed row, so the app knows to reload
  assert.notEqual(r.snapshot.get('reservations')!.get(code)!.guest_name, 'My version');
});

test('edits to different records by two people both survive', async () => {
  const { data, snap, versions, db, tables } = setup();
  const [a, b] = data.reservations.map(x => x.reservation_code);
  const theirs = tables.reservations.find(r => r.id === b);
  theirs.guest_name = 'Teammate edit'; theirs.updated_at = stamp();
  const mine = structuredClone(data);
  mine.reservations[0].guest_name = 'My edit';
  const r = await saveChanges(ws, 'u', snap, mine, versions, db);
  assert.equal(r.conflicts.length, 0);
  assert.equal(tables.reservations.find(x => x.id === a).guest_name, 'My edit');
  assert.equal(tables.reservations.find(x => x.id === b).guest_name, 'Teammate edit');
});

test('deleting a record a teammate just changed keeps their version', async () => {
  const { data, snap, versions, db, tables } = setup();
  const code = data.reservations[0].reservation_code;
  const theirs = tables.reservations.find(r => r.id === code);
  theirs.notes = 'updated'; theirs.updated_at = stamp();
  const mine = structuredClone(data);
  mine.reservations.splice(0, 1);
  const r = await saveChanges(ws, 'u', snap, mine, versions, db);
  assert.deepEqual(r.conflicts, [{ table: 'reservations', key: code }]);
  assert.ok(tables.reservations.some(x => x.id === code));
});

test('deleting something a teammate already deleted is not a conflict', async () => {
  const { data, snap, versions, db, tables } = setup();
  const code = data.reservations[0].reservation_code;
  tables.reservations = tables.reservations.filter(x => x.id !== code);
  const mine = structuredClone(data);
  mine.reservations.splice(0, 1);
  const r = await saveChanges(ws, 'u', snap, mine, versions, db);
  assert.equal(r.conflicts.length, 0);
  assert.ok(!r.snapshot.get('reservations')!.has(code));
});

test('two people creating a record with the same code: the second is reported, not merged', async () => {
  const { data, snap, versions, db, tables } = setup();
  tables.reservations.push({ org_id: ORG, id: 'NEW1', guest_name: 'Theirs', updated_at: stamp() });
  const mine = structuredClone(data);
  mine.reservations.push({ ...mine.reservations[0], reservation_code: 'NEW1', guest_name: 'Mine' });
  mine.reservations.push({ ...mine.reservations[0], reservation_code: 'NEW2', guest_name: 'Also mine' });
  const r = await saveChanges(ws, 'u', snap, mine, versions, db);
  assert.deepEqual(r.conflicts, [{ table: 'reservations', key: 'NEW1' }]);
  assert.equal(tables.reservations.find(x => x.id === 'NEW1').guest_name, 'Theirs');
  assert.ok(tables.reservations.some(x => x.id === 'NEW2'));
});

test('after saving, the next edit uses the new version and succeeds', async () => {
  const { data, snap, versions, db } = setup();
  const one = structuredClone(data); one.reservations[0].guest_name = 'First';
  const r1 = await saveChanges(ws, 'u', snap, one, versions, db);
  const two = structuredClone(one); two.reservations[0].guest_name = 'Second';
  const r2 = await saveChanges(ws, 'u', r1.snapshot, two, r1.versions, db);
  assert.equal(r2.conflicts.length, 0);
});
