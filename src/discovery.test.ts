import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Service } from 'bonjour-service';

import type { PanelConfig } from './config.ts';
import { isUnconfigured, parseService, resolvePanelHost } from './discovery.ts';
import type { DiscoveredDevice } from './discovery.ts';

function svc(fields: Partial<Service>): Service {
  return { name: 'konnected-6f67c3', type: 'esphomelib', port: 6053, host: 'konnected-6f67c3.local', ...fields } as Service;
}

const panel = (p: Partial<PanelConfig>): PanelConfig => ({ port: 6053, zones: [], ...p });

test('parses esphomelib service with mac txt, preferring IPv4', () => {
  const dev = parseService(svc({ txt: { mac: 'f4cfa26f67c3', friendly_name: 'House Alarm' }, addresses: ['fe80::1', '192.168.1.44'] }));
  assert.deepEqual(dev, { name: 'House Alarm', mac: 'f4:cf:a2:6f:67:c3', host: '192.168.1.44', port: 6053, konnected: false });
});

test('falls back to the mDNS host and service name', () => {
  const dev = parseService(svc({ txt: { mac: 'f4cfa26f67c3' }, addresses: [] }));
  assert.equal(dev?.host, 'konnected-6f67c3.local');
  assert.equal(dev?.name, 'konnected-6f67c3');
});

test('service without mac returns null', () => {
  assert.equal(parseService(svc({ txt: {} })), null);
  assert.equal(parseService(svc({ txt: { mac: 'zz' } })), null);
});

test('konnected flag from _konnected._tcp type or project_name', () => {
  assert.equal(parseService(svc({ type: 'konnected', txt: { mac: 'f4cfa26f67c3' } }))?.konnected, true);
  assert.equal(parseService(svc({ txt: { mac: 'f4cfa26f67c3', project_name: 'konnected.alarm-panel' } }))?.konnected, true);
  assert.equal(parseService(svc({ txt: { mac: 'f4cfa26f67c3', project_name: 'acme.light' } }))?.konnected, false);
});

const found: DiscoveredDevice[] = [{ name: 'House Alarm', mac: 'f4:cf:a2:6f:67:c3', host: '192.168.1.44', port: 6053, konnected: true }];

test('resolvePanelHost prefers configured host, else mac match', () => {
  assert.equal(resolvePanelHost(panel({ host: '10.0.0.5', mac: 'f4:cf:a2:6f:67:c3' }), found), '10.0.0.5');
  assert.equal(resolvePanelHost(panel({ mac: 'f4:cf:a2:6f:67:c3' }), found), '192.168.1.44');
  assert.equal(resolvePanelHost(panel({ mac: 'aa:bb:cc:dd:ee:ff' }), found), undefined);
});

test('isUnconfigured by mac or host', () => {
  assert.equal(isUnconfigured(found[0], [panel({ mac: 'f4:cf:a2:6f:67:c3' })]), false);
  assert.equal(isUnconfigured(found[0], [panel({ host: '192.168.1.44' })]), false);
  assert.equal(isUnconfigured(found[0], [panel({ host: 'konnected-6f67c3.local' })]), true);
  assert.equal(isUnconfigured(found[0], []), true);
});
