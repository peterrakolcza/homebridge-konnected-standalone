import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HapStatusError } from '@homebridge/hap-nodejs';
import { AlarmControlPanelCommand, AlarmControlPanelState as S } from 'esphome-client';
import type { AlarmControlPanelEntity, AlarmControlPanelState } from 'esphome-client';
import { mockEntity } from 'esphome-client/testing';

import { AcpFeature, HkCurrent, HkTarget } from './mapping.ts';
import type { PanelLink } from './panelLink.ts';
import { SecuritySystemHandler } from './securitySystem.ts';
import { createFakeAccessory, createFakeLog, hap } from './testing/fakeAccessory.ts';

interface Call {
  objectId: string;
  command: AlarmControlPanelCommand;
  code: string | undefined;
  confirm: (s: AlarmControlPanelState) => boolean;
  timeoutMs: number;
  resolve: (s: AlarmControlPanelState) => void;
  reject: (e: unknown) => void;
}

class FakeLink implements PanelLink {
  connected = true;
  readonly calls: Call[] = [];
  sendAlarmCommand(objectId: string, command: AlarmControlPanelCommand, code: string | undefined,
    confirm: (s: AlarmControlPanelState) => boolean, timeoutMs: number): Promise<AlarmControlPanelState> {
    return new Promise((resolve, reject) => {
      this.calls.push({ objectId, command, code, confirm, timeoutMs, resolve, reject });
    });
  }
}

// HAPStatus.SERVICE_COMMUNICATION_FAILURE (ambient const enum, not importable under verbatimModuleSyntax).
const COMM_FAILURE = -70402;

const tick = () => new Promise(resolve => setImmediate(resolve));
const timeoutError = () => new DOMException('timed out', 'TimeoutError');

function panelEntity(overrides: Partial<AlarmControlPanelEntity> = {}): AlarmControlPanelEntity {
  return mockEntity('alarm_control_panel', 'house_alarm', {
    name: 'House Alarm',
    supportedFeatures: AcpFeature.ARM_HOME | AcpFeature.ARM_AWAY | AcpFeature.ARM_NIGHT,
    ...overrides,
  }) as AlarmControlPanelEntity;
}

function setup(opts: { code?: string; entity?: AlarmControlPanelEntity } = {}) {
  const accessory = createFakeAccessory('House Alarm', 'uuid-1');
  const link = new FakeLink();
  const log = createFakeLog();
  const handler = new SecuritySystemHandler(accessory, hap, link, log, { code: opts.code, commandTimeoutMs: 10_000 });
  handler.configure(opts.entity ?? panelEntity());
  handler.applyState(S.DISARMED);
  const service = accessory.getService(hap.Service.SecuritySystem)!;
  const current = service.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState);
  const target = service.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
  const fault = service.getCharacteristic(hap.Characteristic.StatusFault);
  return { handler, link, log, current, target, fault };
}

test('configure sets valid target values from features', () => {
  const { target } = setup({ entity: panelEntity({ supportedFeatures: AcpFeature.ARM_HOME | AcpFeature.ARM_AWAY }) });
  assert.deepEqual(target.props.validValues, [HkTarget.STAY_ARM, HkTarget.AWAY_ARM, HkTarget.DISARM]);
});

test('set target sends mapped command and keeps target until confirmed', async () => {
  const { link, current, target } = setup({ code: '1111', entity: panelEntity({ requiresCodeToArm: true }) });
  await target.handleSetRequest(HkTarget.STAY_ARM);
  assert.equal(link.calls.length, 1);
  assert.equal(link.calls[0].objectId, 'house_alarm');
  assert.equal(link.calls[0].command, AlarmControlPanelCommand.ARM_HOME);
  assert.equal(link.calls[0].code, '1111');
  assert.equal(link.calls[0].timeoutMs, 10_000);
  assert.equal(link.calls[0].confirm(S.ARMED_HOME), true);
  assert.equal(target.value, HkTarget.STAY_ARM);
  assert.equal(current.value, HkCurrent.DISARMED);
});

test('code only sent when the panel requires it', async () => {
  const { link, target } = setup({ code: '1111', entity: panelEntity({ requiresCode: true, requiresCodeToArm: false }) });
  await target.handleSetRequest(HkTarget.AWAY_ARM);
  assert.equal(link.calls[0].code, undefined);
  await target.handleSetRequest(HkTarget.DISARM);
  assert.equal(link.calls[1].code, '1111');
});

test('offline set throws communication failure', async () => {
  const { link, target } = setup();
  link.connected = false;
  // HAP converts a thrown HapStatusError into a rejection carrying the bare status code.
  await assert.rejects(() => target.handleSetRequest(HkTarget.AWAY_ARM),
    (e: unknown) => e === COMM_FAILURE || (e instanceof HapStatusError && e.hapStatus === COMM_FAILURE));
  assert.equal(link.calls.length, 0);
});

test('rejected command reverts and never logs code', async () => {
  const { link, log, target, current } = setup({ code: '4321', entity: panelEntity({ requiresCode: true, requiresCodeToArm: true }) });
  await target.handleSetRequest(HkTarget.AWAY_ARM);
  link.calls[0].reject(timeoutError());
  await tick();
  assert.equal(target.value, HkTarget.DISARM);
  assert.equal(current.value, HkCurrent.DISARMED);
  assert.ok(log.lines.some(l => l.level === 'warn'));
  assert.ok(log.lines.every(l => !l.text.includes('4321')), JSON.stringify(log.lines));
});

test('newer request supersedes older timeout', async () => {
  const { link, target } = setup();
  await target.handleSetRequest(HkTarget.AWAY_ARM);
  await target.handleSetRequest(HkTarget.STAY_ARM);
  link.calls[0].reject(timeoutError());
  await tick();
  assert.equal(target.value, HkTarget.STAY_ARM);
});

test('requested mode is kept while the panel reports ARMING', async () => {
  const { handler, target, current } = setup();
  await target.handleSetRequest(HkTarget.NIGHT_ARM);
  handler.applyState(S.ARMING);
  assert.equal(target.value, HkTarget.NIGHT_ARM);
  assert.equal(current.value, HkCurrent.DISARMED);
  handler.applyState(S.ARMED_NIGHT);
  assert.equal(current.value, HkCurrent.NIGHT_ARM);
});

test('armed from elsewhere corrects target', () => {
  const { handler, target, current } = setup();
  handler.applyState(S.ARMING);
  assert.equal(target.value, HkTarget.AWAY_ARM);
  handler.applyState(S.ARMED_HOME);
  assert.equal(current.value, HkCurrent.STAY_ARM);
  assert.equal(target.value, HkTarget.STAY_ARM);
});

test('triggered updates current only', () => {
  const { handler, target, current } = setup();
  handler.applyState(S.ARMED_AWAY);
  handler.applyState(S.PENDING);
  assert.equal(current.value, HkCurrent.AWAY_ARM);
  handler.applyState(S.TRIGGERED);
  assert.equal(current.value, HkCurrent.ALARM_TRIGGERED);
  assert.equal(target.value, HkTarget.AWAY_ARM);
});

test('requires code with none configured warns once at configure', () => {
  const { handler, log } = setup({ entity: panelEntity({ requiresCode: true }) });
  handler.configure(panelEntity({ requiresCode: true }));
  assert.equal(log.lines.filter(l => l.level === 'warn').length, 1);
});

test('setFault toggles StatusFault', () => {
  const { handler, fault } = setup();
  handler.setFault(true);
  assert.equal(fault.value, hap.Characteristic.StatusFault.GENERAL_FAULT);
  handler.setFault(false);
  assert.equal(fault.value, hap.Characteristic.StatusFault.NO_FAULT);
});
