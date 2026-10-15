/**
 * What an Instagram-only figure may say about its combined total.
 *
 *   node tests/scope.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { scopeNote } = await import(pathToFileURL(path.resolve(import.meta.dirname, '../lib/scope.ts')).href);
let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log('ok  ', name);
};

test('every linked copy in the sum: combined, with the reconciled carousel', () => {
  const n = scopeNote({ value: 206 + 880, included: ['instagram', 'facebook-personal'], missing: [], apart: [] });
  assert.deepEqual(n, { kind: 'combined', value: 1086, included: ['instagram', 'facebook-personal'], gaps: [] });
});

test('three accounts, all in the sum: combined', () => {
  const n = scopeNote({ value: 1534, included: ['instagram', 'facebook', 'facebook-personal'], missing: [], apart: [] });
  assert.equal(n.kind, 'combined');
  assert.equal(n.value, 1534);
});

test('a Facebook copy with no figure yet: partial, and it says which', () => {
  const n = scopeNote({ value: 640, included: ['instagram', 'facebook'], missing: ['facebook-personal'], apart: [] });
  assert.equal(n.kind, 'partial');
  assert.deepEqual(n.gaps, [{ platform: 'facebook-personal', reason: 'no-figure' }]);
});

test('a Profile figure of unconfirmed scope: partial, never called combined', () => {
  const n = scopeNote({ value: 640, included: ['instagram', 'facebook'], missing: [], apart: ['facebook-personal'] });
  assert.equal(n.kind, 'partial');
  assert.deepEqual(n.gaps, [{ platform: 'facebook-personal', reason: 'scope-unconfirmed' }]);
});

test('the only Facebook copy cannot be added: no total, not the Instagram figure again', () => {
  const unread = scopeNote({ value: 206, included: ['instagram'], missing: ['facebook-personal'], apart: [] });
  assert.deepEqual([unread.kind, unread.value, unread.included], ['none', null, []]);
  const unconfirmed = scopeNote({ value: 206, included: ['instagram'], missing: [], apart: ['facebook-personal'] });
  assert.equal(unconfirmed.kind, 'none');
  assert.equal(unconfirmed.gaps[0].reason, 'scope-unconfirmed');
});

test('Instagram itself has no figure but Facebook does: partial, naming Instagram', () => {
  const n = scopeNote({ value: 880, included: ['facebook-personal'], missing: ['instagram'], apart: [] });
  assert.equal(n.kind, 'partial');
  assert.deepEqual(n.gaps, [{ platform: 'instagram', reason: 'no-figure' }]);
});

test('nothing has a figure: no total', () => {
  assert.equal(scopeNote({ value: null, included: [], missing: ['instagram', 'facebook'], apart: [] }).kind, 'none');
});

test('a YouTube copy in the sum is not a Facebook copy: no total without one', () => {
  const n = scopeNote({ value: 206 + 1500, included: ['instagram', 'youtube'], missing: ['facebook'], apart: [] });
  assert.equal(n.kind, 'none');
});

test('a YouTube copy beside a Facebook copy is part of the combined sum', () => {
  const n = scopeNote({ value: 206 + 880 + 1500, included: ['instagram', 'facebook-personal', 'youtube'], missing: [], apart: [] });
  assert.deepEqual(n, { kind: 'combined', value: 2586, included: ['instagram', 'facebook-personal', 'youtube'], gaps: [] });
});

console.log(`\n${passed} tests passed`);
