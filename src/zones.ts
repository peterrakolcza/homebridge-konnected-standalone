import { EntityCategory } from 'esphome-client';
import type { AlarmControlPanelEntity, BinarySensorEntity, Entity } from 'esphome-client';

import type { ZoneOverride, ZoneType } from './config.ts';

export interface ZoneSpec {
  objectId: string;
  name: string;
  type: ZoneType;
}

function isZoneCandidate(e: Entity): e is BinarySensorEntity {
  if (e.type !== 'binary_sensor') {
    return false;
  }
  const sensor = e as BinarySensorEntity;
  const category = sensor.entityCategory ?? EntityCategory.NONE;
  return category === EntityCategory.NONE && sensor.isStatusBinarySensor !== true && sensor.disabledByDefault !== true;
}

function findOverride(e: BinarySensorEntity, overrides: readonly ZoneOverride[]): ZoneOverride | undefined {
  const objectId = e.objectId.toLowerCase();
  const name = e.name.toLowerCase();
  return overrides.find(o => {
    const id = o.id.toLowerCase();
    return id === objectId || id === name;
  });
}

/**
 * The binary sensors that are user-facing zones, with per-zone overrides applied. Diagnostic/config, status and disabled-by-default
 * sensors are skipped; hidden zones are removed.
 */
export function selectZones(entities: readonly Entity[], overrides: readonly ZoneOverride[]): ZoneSpec[] {
  const zones: ZoneSpec[] = [];
  for (const e of entities) {
    if (!isZoneCandidate(e)) {
      continue;
    }
    const override = findOverride(e, overrides);
    if (override?.hidden) {
      continue;
    }
    zones.push({ objectId: e.objectId, name: e.name, type: override?.type ?? 'motion' });
  }
  return zones;
}

export function findAlarmPanels(entities: readonly Entity[]): AlarmControlPanelEntity[] {
  return entities.filter((e): e is AlarmControlPanelEntity => e.type === 'alarm_control_panel');
}
