import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFakeAccessory, hap } from './testing/fakeAccessory.ts';
import { ZoneSensorHandler } from './zoneSensor.ts';

const { Characteristic, Service } = hap;

test('motion zone exposes MotionSensor', () => {
  const accessory = createFakeAccessory('Zone 1', 'u1');
  const handler = new ZoneSensorHandler(accessory, hap, { objectId: 'zone_1', name: 'Zone 1', type: 'motion' });
  handler.applyState(true);
  const service = accessory.getService(Service.MotionSensor)!;
  assert.equal(service.getCharacteristic(Characteristic.MotionDetected).value, true);
  handler.applyState(false);
  assert.equal(service.getCharacteristic(Characteristic.MotionDetected).value, false);
  assert.equal(accessory.getService(Service.ContactSensor), undefined);
});

test('contact zone exposes ContactSensor', () => {
  const accessory = createFakeAccessory('Zone 2', 'u2');
  const handler = new ZoneSensorHandler(accessory, hap, { objectId: 'zone_2', name: 'Zone 2', type: 'contact' });
  const state = accessory.getService(Service.ContactSensor)!.getCharacteristic(Characteristic.ContactSensorState);
  handler.applyState(true);
  assert.equal(state.value, Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  handler.applyState(false);
  assert.equal(state.value, Characteristic.ContactSensorState.CONTACT_DETECTED);
});

test('type change replaces the old service', () => {
  const accessory = createFakeAccessory('Zone 3', 'u3');
  new ZoneSensorHandler(accessory, hap, { objectId: 'zone_3', name: 'Zone 3', type: 'motion' });
  new ZoneSensorHandler(accessory, hap, { objectId: 'zone_3', name: 'Zone 3', type: 'contact' });
  assert.equal(accessory.getService(Service.MotionSensor), undefined);
  assert.ok(accessory.getService(Service.ContactSensor));
});

test('missing state sets fault', () => {
  const accessory = createFakeAccessory('Zone 4', 'u4');
  const handler = new ZoneSensorHandler(accessory, hap, { objectId: 'zone_4', name: 'Zone 4', type: 'motion' });
  const service = accessory.getService(Service.MotionSensor)!;
  handler.applyState(true, true);
  assert.equal(service.getCharacteristic(Characteristic.MotionDetected).value, false);
  assert.equal(service.getCharacteristic(Characteristic.StatusFault).value, Characteristic.StatusFault.GENERAL_FAULT);
  handler.applyState(true);
  assert.equal(service.getCharacteristic(Characteristic.MotionDetected).value, true);
  assert.equal(service.getCharacteristic(Characteristic.StatusFault).value, Characteristic.StatusFault.NO_FAULT);
});

test('setFault combines with missing-state fault', () => {
  const accessory = createFakeAccessory('Zone 5', 'u5');
  const handler = new ZoneSensorHandler(accessory, hap, { objectId: 'zone_5', name: 'Zone 5', type: 'contact' });
  const fault = accessory.getService(Service.ContactSensor)!.getCharacteristic(Characteristic.StatusFault);
  handler.setFault(true);
  assert.equal(fault.value, Characteristic.StatusFault.GENERAL_FAULT);
  handler.applyState(false);
  assert.equal(fault.value, Characteristic.StatusFault.GENERAL_FAULT);
  handler.setFault(false);
  assert.equal(fault.value, Characteristic.StatusFault.NO_FAULT);
  assert.equal(handler.zone.objectId, 'zone_5');
});
