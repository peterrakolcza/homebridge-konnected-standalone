import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AlarmControlPanelCommand, AlarmControlPanelState as S, entityId } from 'esphome-client';
import type { AlarmControlPanelState, Entity } from 'esphome-client';
import { MockClient, mockDeviceInfo, mockEntity, mockStateMessage } from 'esphome-client/testing';

import type { PanelConfig } from './config.ts';
import { PanelConnection } from './panelConnection.ts';
import type { ClientFactory, PanelClient, PanelEvents } from './panelConnection.ts';
import { createFakeLog } from './testing/fakeAccessory.ts';

const ACP = entityId('alarm_control_panel', 'house_alarm');
const ZONE = entityId('binary_sensor', 'zone_1');

function recorder() {
  const calls: { kind: string; args: unknown[] }[] = [];
  const events: PanelEvents = {
    onEntities: (...args) => calls.push({ kind: 'entities', args }),
    onAlarmState: (...args) => calls.push({ kind: 'alarm', args }),
    onZoneState: (...args) => calls.push({ kind: 'zone', args }),
    onConnectionChange: (...args) => calls.push({ kind: 'connection', args }),
  };
  return { calls, events };
}

function setup(cfg: Partial<PanelConfig> = {}) {
  const panel: PanelConfig = { name: 'House', host: '10.0.0.5', port: 6053, encryptionKey: 'S3CRETKEY=', zones: [], ...cfg };
  const mock = new MockClient();
  const client = Object.assign(mock, {
    connect: async () => {
      mock.setEncrypted(panel.encryptionKey !== undefined);
      mock.setConnected(true);
    },
  });
  const seen: Parameters<ClientFactory>[0][] = [];
  const factory: ClientFactory = opts => {
    seen.push(opts);
    return client as unknown as PanelClient;
  };
  const log = createFakeLog();
  const { calls, events } = recorder();
  const conn = new PanelConnection(panel, panel.host ?? '10.0.0.9', events, log, factory);
  return { mock, conn, log, calls, seen };
}

// Real esphome-client state events carry the entity's friendly name in `entity` (MockClient's factory puts the branded id there).
function deviceState<T extends 'alarm_control_panel' | 'binary_sensor'>(id: ReturnType<typeof entityId<T>>, name: string, fields: object) {
  return { ...mockStateMessage(id, fields as never), entity: name };
}

const entities: Entity[] = [
  mockEntity('alarm_control_panel', 'house_alarm', { name: 'House Alarm' }),
  mockEntity('binary_sensor', 'zone_1', { name: 'Zone 1' }),
];

test('client created with host, port and key', async () => {
  const { conn, seen } = setup();
  await conn.start();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].host, '10.0.0.5');
  assert.equal(seen[0].port, 6053);
  assert.equal(seen[0].psk, 'S3CRETKEY=');
  assert.equal(conn.connected, true);
});

test('entities forwarded with device mac', async () => {
  const { mock, conn, calls } = setup();
  await conn.start();
  mock.emit('deviceInfo', mockDeviceInfo({ macAddress: 'AA:BB:CC:DD:EE:FF', name: 'konnected' }));
  mock.emit('entities', entities);
  const e = calls.find(c => c.kind === 'entities')!;
  assert.equal(e.args[0], 'aa:bb:cc:dd:ee:ff');
  assert.deepEqual(e.args[1], entities);
  assert.equal(conn.mac, 'aa:bb:cc:dd:ee:ff');
});

test('alarm and binary sensor telemetry dispatched by entity key, not name', async () => {
  const { mock, conn, calls } = setup();
  await conn.start();
  mock.emit('entities', entities);
  mock.emit('alarm_control_panel', deviceState(ACP, 'House Alarm', { state: S.ARMED_AWAY }));
  mock.emit('binary_sensor', deviceState(ZONE, 'Zone 1', { state: true }));
  mock.emit('binary_sensor', deviceState(ZONE, 'Zone 1', { state: false, missingState: true }));
  assert.deepEqual(calls.filter(c => c.kind === 'alarm').map(c => c.args), [['house_alarm', S.ARMED_AWAY]]);
  assert.deepEqual(calls.filter(c => c.kind === 'zone').map(c => c.args), [['zone_1', true, false], ['zone_1', false, true]]);
});

test('sendAlarmCommand uses commandAndAwait with code and predicate', async () => {
  const { mock, conn } = setup();
  await conn.start();
  mock.populateEntities(entities);
  const confirm = (s: AlarmControlPanelState) => s === S.ARMED_HOME;
  const pending = conn.sendAlarmCommand('house_alarm', AlarmControlPanelCommand.ARM_HOME, '1234', confirm, 1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mock.commands.length, 1);
  assert.deepEqual(mock.commands[0].options, { command: AlarmControlPanelCommand.ARM_HOME, code: '1234' });
  mock.emitState(mockStateMessage(ACP, { state: S.ARMING }));
  mock.emitState(mockStateMessage(ACP, { state: S.ARMED_HOME }));
  assert.equal(await pending, S.ARMED_HOME);
});

test('sendAlarmCommand without a code sends no code field', async () => {
  const { mock, conn } = setup();
  await conn.start();
  mock.populateEntities(entities);
  const pending = conn.sendAlarmCommand('house_alarm', AlarmControlPanelCommand.DISARM, undefined, s => s === S.DISARMED, 1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(mock.commands[0].options, { command: AlarmControlPanelCommand.DISARM });
  mock.emitState(mockStateMessage(ACP, { state: S.DISARMED }));
  await pending;
});

test('sendAlarmCommand rejects after timeout', async () => {
  const { mock, conn } = setup();
  await conn.start();
  mock.populateEntities(entities);
  await assert.rejects(conn.sendAlarmCommand('house_alarm', AlarmControlPanelCommand.ARM_AWAY, undefined, () => false, 20));
});

test('reconnect clears fault and resyncs', async () => {
  const { mock, conn, calls } = setup();
  await conn.start();
  assert.deepEqual(calls.filter(c => c.kind === 'connection').map(c => c.args[0]), [true]);
  mock.setConnected(false, 'socket closed');
  assert.equal(conn.connected, false);
  mock.setConnected(true);
  mock.emit('entities', entities);
  mock.emit('alarm_control_panel', deviceState(ACP, 'House Alarm', { state: S.DISARMED }));
  assert.deepEqual(calls.filter(c => c.kind === 'connection').map(c => c.args[0]), [true, false, true]);
  assert.equal(calls.filter(c => c.kind === 'entities').length, 1);
  assert.equal(calls.filter(c => c.kind === 'alarm').length, 1);
});

test('plaintext fallback with a configured key is refused', async () => {
  const { mock, conn, log, calls } = setup();
  let disconnected = 0;
  Object.assign(mock, {
    connect: async () => {
      mock.setEncrypted(false);
      mock.setConnected(true);
    },
    disconnectAsync: async () => {
      disconnected++;
    },
  });
  await conn.start();
  assert.equal(conn.connected, false);
  assert.equal(disconnected, 1);
  assert.deepEqual(calls.filter(c => c.kind === 'connection').map(c => c.args[0]), []);
  assert.ok(log.lines.some(l => l.level === 'error' && /unencrypted/.test(l.text)));
  await assert.rejects(conn.sendAlarmCommand('house_alarm', AlarmControlPanelCommand.DISARM, '1234', () => true, 50));
  assert.equal(mock.commands.length, 0);
});

test('encrypted connect with a configured key is accepted', async () => {
  const { mock, conn } = setup();
  Object.assign(mock, {
    connect: async () => {
      mock.setEncrypted(true);
      mock.setConnected(true);
    },
  });
  await conn.start();
  assert.equal(conn.connected, true);
});

test('unencrypted panel warns once', async () => {
  const { conn, log, seen } = setup({ encryptionKey: undefined });
  await conn.start();
  assert.equal(seen[0].psk, null);
  const warns = log.lines.filter(l => l.level === 'warn');
  assert.equal(warns.length, 1);
  assert.match(warns[0].text, /anyone on your network can disarm/);
});

test('logger adapter redacts secrets', async () => {
  const { conn, log, seen } = setup({ code: '9876' });
  await conn.start();
  seen[0].logger.error('handshake failed with key S3CRETKEY= and code 9876');
  const line = log.lines.at(-1)!;
  assert.ok(!line.text.includes('S3CRETKEY='), line.text);
  assert.ok(!line.text.includes('9876'), line.text);
  assert.match(line.text, /\*\*\*/);
});

test('first connect failure is logged, not thrown', async () => {
  const { mock, conn, log } = setup();
  Object.assign(mock, { connect: async () => {
    throw new Error('ECONNREFUSED');
  } });
  await conn.start();
  assert.ok(log.lines.some(l => l.level === 'error' && l.text.includes('House')));
});

test('stop disconnects gracefully', async () => {
  const { mock, conn } = setup();
  await conn.start();
  await conn.stop();
  assert.equal(mock.isConnected, false);
});
