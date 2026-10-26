import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Service } from 'bonjour-service';

import type { PanelConfig } from './config.ts';
import { isUnconfigured, movedHost, parseService, resolvePanelHost } from './discovery.ts';
import type { DiscoveredDevice } from './discovery.ts';

function svc(fields: Partial<Service>): Service {
  return { name: 'konnected-345678', type: 'esphomelib', port: 6053, host: 'konnected-345678.local', ...fields } as Service;
}

const panel = (p: Partial<PanelConfig>): PanelConfig => ({ port: 6053, zones: [], ...p });

test('parses esphomelib service with mac txt, preferring IPv4', () => {
  const dev = parseService(svc({ txt: { mac: 'a4cf12345678', friendly_name: 'House Alarm' }, addresses: ['fe80::1', '192.168.1.50'] }));
  assert.deepEqual(dev, { name: 'House Alarm', mac: 'a4:cf:12:34:56:78', host: '192.168.1.50', port: 6053, konnected: false });
});

test('falls back to the mDNS host and service name', () => {
  const dev = parseService(svc({ txt: { mac: 'a4cf12345678' }, addresses: [] }));
  assert.equal(dev?.host, 'konnected-345678.local');
  assert.equal(dev?.name, 'konnected-345678');
});

test('service without mac returns null', () => {
  assert.equal(parseService(svc({ txt: {} })), null);
  assert.equal(parseService(svc({ txt: { mac: 'zz' } })), null);
});

test('konnected flag from _konnected._tcp type or project_name', () => {
  assert.equal(parseService(svc({ type: 'konnected', txt: { mac: 'a4cf12345678' } }))?.konnected, true);
  assert.equal(parseService(svc({ txt: { mac: 'a4cf12345678', project_name: 'konnected.alarm-panel' } }))?.konnected, true);
  assert.equal(parseService(svc({ txt: { mac: 'a4cf12345678', project_name: 'acme.light' } }))?.konnected, false);
});

const found: DiscoveredDevice[] = [{ name: 'House Alarm', mac: 'a4:cf:12:34:56:78', host: '192.168.1.50', port: 6053, konnected: true }];

test('resolvePanelHost prefers configured host, else mac match', () => {
  assert.equal(resolvePanelHost(panel({ host: '10.0.0.5', mac: 'a4:cf:12:34:56:78' }), found), '10.0.0.5');
  assert.equal(resolvePanelHost(panel({ mac: 'a4:cf:12:34:56:78' }), found), '192.168.1.50');
  assert.equal(resolvePanelHost(panel({ mac: 'aa:bb:cc:dd:ee:ff' }), found), undefined);
});

test('isUnconfigured by mac or host', () => {
  assert.equal(isUnconfigured(found[0], [panel({ mac: 'a4:cf:12:34:56:78' })]), false);
  assert.equal(isUnconfigured(found[0], [panel({ host: '192.168.1.50' })]), false);
  assert.equal(isUnconfigured(found[0], [panel({ host: 'konnected-345678.local' })]), true);
  assert.equal(isUnconfigured(found[0], []), true);
});

test('movedHost follows a mac-only panel to its new address', () => {
  const moved = { ...found[0], host: '192.168.1.51' };
  assert.equal(movedHost(panel({ mac: 'a4:cf:12:34:56:78' }), '192.168.1.50', moved), '192.168.1.51');
  assert.equal(movedHost(panel({ mac: 'a4:cf:12:34:56:78' }), '192.168.1.50', found[0]), undefined);
  assert.equal(movedHost(panel({ host: '192.168.1.50', mac: 'a4:cf:12:34:56:78' }), '192.168.1.50', moved), undefined);
  assert.equal(movedHost(panel({ mac: 'aa:bb:cc:dd:ee:ff' }), '192.168.1.50', moved), undefined);
});
