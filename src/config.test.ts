import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeConfig, normalizeMac, panelLabel } from './config.ts';

function fakeLog() {
  const messages: string[] = [];
  const record = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  };
  return { messages, error: record, warn: record };
}

test('defaults', () => {
  const log = fakeLog();
  const c = normalizeConfig({ platform: 'KonnectedStandalone', panels: [{ host: '10.0.0.5' }] }, log);
  assert.equal(c.name, 'Konnected Standalone');
  assert.equal(c.commandTimeoutMs, 10_000);
  assert.equal(c.discovery, true);
  assert.equal(c.panels.length, 1);
  assert.equal(c.panels[0].host, '10.0.0.5');
  assert.equal(c.panels[0].port, 6053);
  assert.deepEqual(c.panels[0].zones, []);
  assert.equal(log.messages.length, 0);
});

test('missing or malformed panels yields an empty list', () => {
  assert.deepEqual(normalizeConfig({}, fakeLog()).panels, []);
  assert.deepEqual(normalizeConfig(undefined, fakeLog()).panels, []);
  assert.deepEqual(normalizeConfig({ panels: 'nope' }, fakeLog()).panels, []);
});

test('panel without host or mac is dropped with an error', () => {
  const log = fakeLog();
  const c = normalizeConfig({ panels: [{ name: 'Garage' }] }, log);
  assert.equal(c.panels.length, 0);
  assert.equal(log.messages.length, 1);
  assert.match(log.messages[0], /Garage/);
});

test('mac normalised', () => {
  assert.equal(normalizeMac('A4-CF-12-34-56-78'), 'a4:cf:12:34:56:78');
  assert.equal(normalizeMac('a4cf12345678'), 'a4:cf:12:34:56:78');
  assert.equal(normalizeMac('A4:CF:12:34:56:78'), 'a4:cf:12:34:56:78');
  const c = normalizeConfig({ panels: [{ mac: 'A4CF12345678' }] }, fakeLog());
  assert.equal(c.panels[0].mac, 'a4:cf:12:34:56:78');
});

test('invalid mac drops the panel when there is no host', () => {
  const log = fakeLog();
  const c = normalizeConfig({ panels: [{ mac: 'not-a-mac' }] }, log);
  assert.equal(c.panels.length, 0);
  assert.equal(log.messages.length, 1);
});

test('commandTimeout in seconds', () => {
  assert.equal(normalizeConfig({ commandTimeout: 15 }, fakeLog()).commandTimeoutMs, 15_000);
  const log = fakeLog();
  assert.equal(normalizeConfig({ commandTimeout: 1 }, log).commandTimeoutMs, 10_000);
  assert.equal(normalizeConfig({ commandTimeout: 'soon' }, log).commandTimeoutMs, 10_000);
  assert.equal(log.messages.length, 2);
});

test('discovery can be turned off', () => {
  assert.equal(normalizeConfig({ discovery: false }, fakeLog()).discovery, false);
});

test('zone overrides', () => {
  const log = fakeLog();
  const zones = [{ id: 'zone_2', type: 'contact' }, { id: 'zone_6', hidden: true }, { id: 'z', type: 'door' }, { type: 'contact' }];
  const c = normalizeConfig({ panels: [{ host: 'h', zones }] }, log);
  assert.deepEqual(c.panels[0].zones, [
    { id: 'zone_2', type: 'contact', hidden: false },
    { id: 'zone_6', type: undefined, hidden: true },
    { id: 'z', type: undefined, hidden: false },
  ]);
  assert.equal(log.messages.length, 2);
});

test('panel fields carried through', () => {
  const key = Buffer.alloc(32, 1).toString('base64');
  const c = normalizeConfig({ panels: [{ name: 'House', host: 'h', port: 6054, encryptionKey: key, code: '1234' }] }, fakeLog());
  assert.deepEqual(c.panels[0], { name: 'House', host: 'h', mac: undefined, port: 6054, encryptionKey: key, code: '1234', zones: [] });
});

test('panel with an invalid encryption key is dropped, never downgraded to plaintext', () => {
  const log = fakeLog();
  const c = normalizeConfig({ panels: [{ name: 'Bad', host: 'h', encryptionKey: 'dG9vc2hvcnQ=' }] }, log);
  assert.equal(c.panels.length, 0);
  assert.equal(log.messages.length, 1);
  assert.match(log.messages[0], /Bad/);
  assert.ok(!log.messages[0].includes('dG9vc2hvcnQ='));
  const ok = normalizeConfig({ panels: [{ host: 'h', encryptionKey: Buffer.alloc(32, 7).toString('base64') }] }, fakeLog());
  assert.equal(ok.panels.length, 1);
});

test('panelLabel prefers name, then host, then mac', () => {
  assert.equal(panelLabel({ name: 'House', host: 'h', port: 6053, zones: [] }), 'House');
  assert.equal(panelLabel({ host: 'h', port: 6053, zones: [] }), 'h');
  assert.equal(panelLabel({ mac: 'aa:bb:cc:dd:ee:ff', port: 6053, zones: [] }), 'aa:bb:cc:dd:ee:ff');
});

test('errors never contain secrets', () => {
  const log = fakeLog();
  normalizeConfig({ panels: [{ encryptionKey: 'SECRETKEY', code: '9876' }, { host: 'h', encryptionKey: 'SECRETKEY', code: '9876', port: 'x' }] }, log);
  assert.ok(log.messages.length > 0);
  for (const msg of log.messages) {
    assert.ok(!msg.includes('SECRETKEY'), msg);
    assert.ok(!msg.includes('9876'), msg);
  }
});
