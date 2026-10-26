import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EntityCategory } from 'esphome-client';
import { mockEntity } from 'esphome-client/testing';

import { findAlarmPanels, selectZones } from './zones.ts';

test('binary sensors become motion zones by default, in entity order', () => {
  const entities = [
    mockEntity('binary_sensor', 'zone_1', { name: 'Zone 1' }),
    mockEntity('binary_sensor', 'zone_2', { name: 'Zone 2' }),
  ];
  assert.deepEqual(selectZones(entities, []), [
    { objectId: 'zone_1', name: 'Zone 1', type: 'motion' },
    { objectId: 'zone_2', name: 'Zone 2', type: 'motion' },
  ]);
});

test('diagnostic, config, status and disabled-by-default sensors skipped', () => {
  const entities = [
    mockEntity('binary_sensor', 'diag', { name: 'Diag', entityCategory: EntityCategory.DIAGNOSTIC }),
    mockEntity('binary_sensor', 'cfg', { name: 'Cfg', entityCategory: EntityCategory.CONFIG }),
    mockEntity('binary_sensor', 'status', { name: 'Status', isStatusBinarySensor: true }),
    mockEntity('binary_sensor', 'off', { name: 'Off', disabledByDefault: true }),
    mockEntity('binary_sensor', 'zone_3', { name: 'Zone 3', entityCategory: EntityCategory.NONE }),
  ];
  assert.deepEqual(selectZones(entities, []).map(z => z.objectId), ['zone_3']);
});

test('override matches objectId or name case-insensitively', () => {
  const entities = [
    mockEntity('binary_sensor', 'zone_2', { name: 'zone 2' }),
    mockEntity('binary_sensor', 'zone_3', { name: 'Kitchen' }),
  ];
  const zones = selectZones(entities, [{ id: 'Zone 2', type: 'contact' }, { id: 'ZONE_3', type: 'contact' }]);
  assert.deepEqual(zones.map(z => z.type), ['contact', 'contact']);
});

test('hidden override removes zone', () => {
  const entities = [mockEntity('binary_sensor', 'zone_6', { name: 'Zone 6' })];
  assert.deepEqual(selectZones(entities, [{ id: 'zone_6', hidden: true }]), []);
});

test('non-binary entities ignored; alarm panels found', () => {
  const entities = [
    mockEntity('switch', 'siren', { name: 'Siren' }),
    mockEntity('sensor', 'wifi', { name: 'WiFi' }),
    mockEntity('alarm_control_panel', 'alarm', { name: 'Alarm' }),
    mockEntity('binary_sensor', 'zone_1', { name: 'Zone 1' }),
  ];
  assert.deepEqual(selectZones(entities, []).map(z => z.objectId), ['zone_1']);
  assert.deepEqual(findAlarmPanels(entities).map(e => e.objectId), ['alarm']);
});
