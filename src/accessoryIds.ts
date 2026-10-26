import type { HAP, PlatformAccessory } from 'homebridge';

import { PLUGIN_NAME } from './settings.ts';

export type AccessoryKind = 'security' | 'zone';

export interface AccessoryContext {
  mac: string;
  objectId: string;
  kind: AccessoryKind;
}

/**
 * Stable accessory UUID per panel entity, so HomeKit names and rooms survive restarts and re-discovery.
 */
export function accessoryUuid(hap: HAP, mac: string, objectId: string): string {
  return hap.uuid.generate(`${PLUGIN_NAME}:${mac}:${objectId}`);
}

/**
 * Cached accessories belonging to the panel `mac` whose entity the panel no longer exposes. Never matches anything when the MAC is
 * unknown, so a panel that has not reported its identity cannot wipe accessories.
 */
export function staleAccessories(cached: readonly PlatformAccessory[], mac: string, liveUuids: ReadonlySet<string>): PlatformAccessory[] {
  if (!mac) {
    return [];
  }
  return cached.filter(a => (a.context as Partial<AccessoryContext>).mac === mac && !liveUuids.has(a.UUID));
}
