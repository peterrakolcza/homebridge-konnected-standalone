import { isIPv4 } from 'node:net';

import type { Service } from 'bonjour-service';

import { normalizeMac } from './config.ts';
import type { PanelConfig } from './config.ts';

export interface DiscoveredDevice {
  name: string;
  mac: string;
  host: string;
  port: number;
  konnected: boolean;
}

/**
 * mDNS service types browsed for panels: `_esphomelib._tcp` (every ESPHome device) and `_konnected._tcp` (Konnected firmware).
 */
export const MDNS_TYPES = ['esphomelib', 'konnected'] as const;

/**
 * Parse an mDNS service into a device identity. Returns null when the service has no usable MAC address in its TXT record.
 */
export function parseService(svc: Service): DiscoveredDevice | null {
  const txt = (svc.txt ?? {}) as Record<string, unknown>;
  const mac = typeof txt.mac === 'string' ? normalizeMac(txt.mac) : '';
  if (!mac) {
    return null;
  }
  const ipv4 = (svc.addresses ?? []).find(a => isIPv4(a));
  const projectName = typeof txt.project_name === 'string' ? txt.project_name.toLowerCase() : '';
  const friendlyName = typeof txt.friendly_name === 'string' && txt.friendly_name !== '' ? txt.friendly_name : undefined;
  return {
    name: friendlyName ?? svc.name,
    mac,
    host: ipv4 ?? svc.host,
    port: svc.port,
    konnected: svc.type === 'konnected' || projectName.includes('konnected'),
  };
}

/**
 * The host to connect to for a configured panel: its configured host, else the address of the discovered device with the same MAC.
 */
export function resolvePanelHost(cfg: PanelConfig, found: readonly DiscoveredDevice[]): string | undefined {
  if (cfg.host) {
    return cfg.host;
  }
  return cfg.mac ? found.find(d => d.mac === cfg.mac)?.host : undefined;
}

export function isUnconfigured(dev: DiscoveredDevice, panels: readonly PanelConfig[]): boolean {
  return !panels.some(p => p.mac === dev.mac || p.host === dev.host);
}

/**
 * The new address of a panel configured by MAC only, when discovery reports it somewhere other than `currentHost`.
 */
export function movedHost(cfg: PanelConfig, currentHost: string, dev: DiscoveredDevice): string | undefined {
  if (cfg.host || !cfg.mac || cfg.mac !== dev.mac || dev.host === currentHost) {
    return undefined;
  }
  return dev.host;
}
