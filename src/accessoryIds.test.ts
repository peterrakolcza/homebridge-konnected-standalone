import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accessoryUuid, staleAccessories } from './accessoryIds.ts';
import { createFakeAccessory, hap } from './testing/fakeAccessory.ts';

test('uuid stable and distinct per entity', () => {
  const a = accessoryUuid(hap, 'aa:bb:cc:dd:ee:ff', 'zone_1');
  assert.equal(a, accessoryUuid(hap, 'aa:bb:cc:dd:ee:ff', 'zone_1'));
  assert.notEqual(a, accessoryUuid(hap, 'aa:bb:cc:dd:ee:ff', 'zone_2'));
  assert.notEqual(a, accessoryUuid(hap, '11:22:33:44:55:66', 'zone_1'));
  assert.ok(hap.uuid.isValid(a));
});

test('staleAccessories only touches this panel', () => {
  const mine = createFakeAccessory('Zone 1', 'u1');
  mine.context = { mac: 'aa:bb:cc:dd:ee:ff', objectId: 'zone_1' };
  const gone = createFakeAccessory('Zone 9', 'u9');
  gone.context = { mac: 'aa:bb:cc:dd:ee:ff', objectId: 'zone_9' };
  const other = createFakeAccessory('Other', 'u2');
  other.context = { mac: '11:22:33:44:55:66', objectId: 'zone_1' };
  const stale = staleAccessories([mine, gone, other], 'aa:bb:cc:dd:ee:ff', new Set(['u1']));
  assert.deepEqual(stale.map(a => a.UUID), ['u9']);
});

test('staleAccessories with empty mac removes nothing', () => {
  const a = createFakeAccessory('Zone 1', 'u1');
  a.context = { mac: '', objectId: 'zone_1' };
  assert.deepEqual(staleAccessories([a], '', new Set()), []);
});
