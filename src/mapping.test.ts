import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Characteristic } from '@homebridge/hap-nodejs';
import { AlarmControlPanelCommand, AlarmControlPanelState as S } from 'esphome-client';

import { AcpFeature, commandForTarget, confirmsRequest, HkCurrent, HkTarget, mapPanelState, validTargets } from './mapping.ts';
import type { MappedState } from './mapping.ts';

const disarmed: MappedState = { current: HkCurrent.DISARMED, target: HkTarget.DISARM };
const armedAway: MappedState = { current: HkCurrent.AWAY_ARM, target: HkTarget.AWAY_ARM };

test('HK constants equal HAP values', () => {
  const cur = Characteristic.SecuritySystemCurrentState;
  const tgt = Characteristic.SecuritySystemTargetState;
  assert.equal(HkCurrent.STAY_ARM, cur.STAY_ARM);
  assert.equal(HkCurrent.AWAY_ARM, cur.AWAY_ARM);
  assert.equal(HkCurrent.NIGHT_ARM, cur.NIGHT_ARM);
  assert.equal(HkCurrent.DISARMED, cur.DISARMED);
  assert.equal(HkCurrent.ALARM_TRIGGERED, cur.ALARM_TRIGGERED);
  assert.equal(HkTarget.STAY_ARM, tgt.STAY_ARM);
  assert.equal(HkTarget.AWAY_ARM, tgt.AWAY_ARM);
  assert.equal(HkTarget.NIGHT_ARM, tgt.NIGHT_ARM);
  assert.equal(HkTarget.DISARM, tgt.DISARM);
});

test('armed and disarmed states map to matching current and target', () => {
  assert.deepEqual(mapPanelState(S.ARMED_HOME, disarmed, null), { current: HkCurrent.STAY_ARM, target: HkTarget.STAY_ARM });
  assert.deepEqual(mapPanelState(S.ARMED_AWAY, disarmed, null), { current: HkCurrent.AWAY_ARM, target: HkTarget.AWAY_ARM });
  assert.deepEqual(mapPanelState(S.ARMED_NIGHT, disarmed, null), { current: HkCurrent.NIGHT_ARM, target: HkTarget.NIGHT_ARM });
  assert.deepEqual(mapPanelState(S.ARMED_VACATION, disarmed, null), { current: HkCurrent.AWAY_ARM, target: HkTarget.AWAY_ARM });
  assert.deepEqual(mapPanelState(S.ARMED_CUSTOM_BYPASS, disarmed, null), { current: HkCurrent.STAY_ARM, target: HkTarget.STAY_ARM });
  assert.deepEqual(mapPanelState(S.DISARMED, armedAway, null), disarmed);
});

test('ARMING keeps current and targets the requested mode', () => {
  assert.deepEqual(mapPanelState(S.ARMING, disarmed, HkTarget.NIGHT_ARM), { current: HkCurrent.DISARMED, target: HkTarget.NIGHT_ARM });
  assert.deepEqual(mapPanelState(S.ARMING, disarmed, null), { current: HkCurrent.DISARMED, target: HkTarget.AWAY_ARM });
});

test('ARMING with a disarm request pending still targets an armed mode', () => {
  assert.deepEqual(mapPanelState(S.ARMING, disarmed, HkTarget.DISARM), { current: HkCurrent.DISARMED, target: HkTarget.AWAY_ARM });
});

test('PENDING keeps armed state', () => {
  assert.deepEqual(mapPanelState(S.PENDING, armedAway, null), armedAway);
});

test('DISARMING targets DISARM and keeps current', () => {
  assert.deepEqual(mapPanelState(S.DISARMING, armedAway, null), { current: HkCurrent.AWAY_ARM, target: HkTarget.DISARM });
});

test('TRIGGERED sets current only', () => {
  assert.deepEqual(mapPanelState(S.TRIGGERED, armedAway, null), { current: HkCurrent.ALARM_TRIGGERED, target: HkTarget.AWAY_ARM });
});

test('commands never swap home and away', () => {
  assert.equal(commandForTarget(HkTarget.STAY_ARM), AlarmControlPanelCommand.ARM_HOME);
  assert.equal(commandForTarget(HkTarget.AWAY_ARM), AlarmControlPanelCommand.ARM_AWAY);
  assert.equal(commandForTarget(HkTarget.NIGHT_ARM), AlarmControlPanelCommand.ARM_NIGHT);
  assert.equal(commandForTarget(HkTarget.DISARM), AlarmControlPanelCommand.DISARM);
});

test('validTargets follows supported_features', () => {
  assert.deepEqual(validTargets(AcpFeature.ARM_HOME | AcpFeature.ARM_AWAY), [HkTarget.STAY_ARM, HkTarget.AWAY_ARM, HkTarget.DISARM]);
  assert.deepEqual(validTargets(AcpFeature.ARM_HOME | AcpFeature.ARM_AWAY | AcpFeature.ARM_NIGHT),
    [HkTarget.STAY_ARM, HkTarget.AWAY_ARM, HkTarget.NIGHT_ARM, HkTarget.DISARM]);
  assert.deepEqual(validTargets(0), [HkTarget.DISARM]);
});

test('confirmsRequest', () => {
  assert.equal(confirmsRequest(HkTarget.STAY_ARM, S.ARMED_HOME), true);
  assert.equal(confirmsRequest(HkTarget.STAY_ARM, S.ARMING), true);
  assert.equal(confirmsRequest(HkTarget.STAY_ARM, S.ARMED_AWAY), false);
  assert.equal(confirmsRequest(HkTarget.AWAY_ARM, S.ARMED_AWAY), true);
  assert.equal(confirmsRequest(HkTarget.NIGHT_ARM, S.ARMED_NIGHT), true);
  assert.equal(confirmsRequest(HkTarget.DISARM, S.DISARMED), true);
  assert.equal(confirmsRequest(HkTarget.DISARM, S.ARMING), false);
});
