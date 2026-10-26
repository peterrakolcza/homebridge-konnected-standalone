import { Bonjour } from 'bonjour-service';
import type { AlarmControlPanelState, Entity } from 'esphome-client';
import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';

import { accessoryUuid, staleAccessories } from './accessoryIds.ts';
import type { AccessoryContext } from './accessoryIds.ts';
import { normalizeConfig, panelLabel } from './config.ts';
import type { PanelConfig, PluginConfig } from './config.ts';
import { isUnconfigured, MDNS_TYPES, movedHost, parseService, resolvePanelHost } from './discovery.ts';
import type { DiscoveredDevice } from './discovery.ts';
import { PanelConnection } from './panelConnection.ts';
import type { PanelLink } from './panelLink.ts';
import { SecuritySystemHandler } from './securitySystem.ts';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.ts';
import { ZoneSensorHandler } from './zoneSensor.ts';
import { findAlarmPanels, selectZones } from './zones.ts';

interface PanelRuntime {
  cfg: PanelConfig;
  label: string;
  conn?: PanelConnection;
  host?: string;
  // Stable link for accessory handlers; follows rt.conn when the connection is replaced (e.g. the panel moved address).
  link: PanelLink;
  security: Map<string, SecuritySystemHandler>;
  zones: Map<string, ZoneSensorHandler>;
}

/**
 * Homebridge platform for Konnected panels running ESPHome standalone alarm mode.
 */
export class KonnectedStandalonePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;
  private readonly api: API;
  private readonly config: PluginConfig;
  private readonly cached = new Map<string, PlatformAccessory>();
  private readonly panels: PanelRuntime[];
  private readonly discovered = new Map<string, DiscoveredDevice>();
  private readonly reported = new Set<string>();
  private mdns?: Bonjour;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.config = normalizeConfig(config, log);
    this.panels = this.config.panels.map(cfg => {
      const rt: PanelRuntime = {
        cfg,
        label: panelLabel(cfg),
        security: new Map(),
        zones: new Map(),
        link: {
          get connected() {
            return rt.conn?.connected ?? false;
          },
          sendAlarmCommand: (...args) => rt.conn
            ? rt.conn.sendAlarmCommand(...args)
            : Promise.reject(new Error(`Panel "${rt.label}" is not connected.`)),
        },
      };
      return rt;
    });
    if (this.panels.length === 0) {
      this.log.warn('No panels configured. Add your Konnected panel under "panels" in the plugin settings.');
    }
    api.on('didFinishLaunching', () => this.launch());
    api.on('shutdown', () => {
      void this.shutdown();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cached.set(accessory.UUID, accessory);
  }

  private launch(): void {
    for (const rt of this.panels) {
      const host = resolvePanelHost(rt.cfg, []);
      if (host) {
        this.startPanel(rt, host);
      } else if (!this.config.discovery) {
        this.log.error(`Panel "${rt.label}" has no "host" and discovery is off; it cannot be reached.`);
      } else {
        this.log.info(`Panel "${rt.label}": waiting to find ${rt.cfg.mac} on the network.`);
      }
    }
    if (this.config.discovery) {
      this.mdns = new Bonjour();
      for (const type of MDNS_TYPES) {
        this.mdns.find({ type }, svc => this.onService(parseService(svc)));
      }
    }
  }

  private onService(dev: DiscoveredDevice | null): void {
    if (!dev) {
      return;
    }
    this.discovered.set(dev.mac, dev);
    for (const rt of this.panels) {
      if (!rt.conn && rt.cfg.mac === dev.mac) {
        this.startPanel(rt, dev.host);
        continue;
      }
      const newHost = rt.conn && rt.host ? movedHost(rt.cfg, rt.host, dev) : undefined;
      if (rt.conn && newHost) {
        this.log.info(`Panel "${rt.label}" moved from ${rt.host} to ${newHost}; reconnecting.`);
        const old = rt.conn;
        rt.conn = undefined;
        void old.stop().then(() => this.startPanel(rt, newHost));
      }
    }
    if (isUnconfigured(dev, this.config.panels) && !this.reported.has(dev.mac)) {
      this.reported.add(dev.mac);
      const message = `Found panel ${dev.name} (${dev.mac}) at ${dev.host}; add it to "panels" to use it.`;
      if (dev.konnected) {
        this.log.info(message);
      } else {
        this.log.debug(`Ignoring ESPHome device: ${message}`);
      }
    }
  }

  private startPanel(rt: PanelRuntime, host: string): void {
    rt.host = host;
    rt.conn = new PanelConnection(rt.cfg, host, {
      onEntities: (mac, entities) => this.onEntities(rt, mac, entities),
      onAlarmState: (objectId, state) => this.onAlarmState(rt, objectId, state),
      onZoneState: (objectId, active, missing) => this.onZoneState(rt, objectId, active, missing),
      onConnectionChange: connected => this.onConnectionChange(rt, connected),
    }, this.log);
    void rt.conn.start();
  }

  private accessoryFor(mac: string, objectId: string, name: string, kind: AccessoryContext['kind'], fresh: PlatformAccessory[]): PlatformAccessory {
    const uuid = accessoryUuid(this.api.hap, mac, objectId);
    let accessory = this.cached.get(uuid);
    if (!accessory) {
      accessory = new this.api.platformAccessory(name, uuid);
      this.cached.set(uuid, accessory);
      fresh.push(accessory);
    }
    const context: AccessoryContext = { mac, objectId, kind };
    accessory.context = context;
    const { Characteristic, Service } = this.api.hap;
    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Konnected (via ESPHome)')
      .setCharacteristic(Characteristic.Model, kind === 'security' ? 'Standalone alarm' : 'Zone')
      .setCharacteristic(Characteristic.SerialNumber, `${mac}-${objectId}`);
    return accessory;
  }

  private onEntities(rt: PanelRuntime, mac: string, entities: Entity[]): void {
    if (!mac) {
      this.log.error(`Panel "${rt.label}" did not report a MAC address; cannot create accessories.`);
      return;
    }
    const fresh: PlatformAccessory[] = [];
    const live = new Set<string>();

    const alarms = findAlarmPanels(entities);
    if (alarms.length === 0) {
      this.log.warn(`Panel "${rt.label}" exposes no alarm control panel. Is standalone alarm mode enabled in its firmware?`);
    }
    for (const entity of alarms) {
      const name = rt.cfg.name ?? entity.name;
      const accessory = this.accessoryFor(mac, entity.objectId, name, 'security', fresh);
      live.add(accessory.UUID);
      let handler = rt.security.get(entity.objectId);
      if (!handler) {
        handler = new SecuritySystemHandler(accessory, this.api.hap, rt.link, this.log,
          { code: rt.cfg.code, commandTimeoutMs: this.config.commandTimeoutMs });
        rt.security.set(entity.objectId, handler);
      }
      handler.configure(entity);
      handler.setFault(false);
    }

    for (const zone of selectZones(entities, rt.cfg.zones)) {
      const accessory = this.accessoryFor(mac, zone.objectId, zone.name, 'zone', fresh);
      live.add(accessory.UUID);
      const existing = rt.zones.get(zone.objectId);
      if (!existing || existing.zone.type !== zone.type) {
        rt.zones.set(zone.objectId, new ZoneSensorHandler(accessory, this.api.hap, zone));
      }
      rt.zones.get(zone.objectId)!.setFault(false);
    }

    if (fresh.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, fresh);
    }
    const stale = staleAccessories([...this.cached.values()], mac, live);
    if (stale.length > 0) {
      this.log.info(`Panel "${rt.label}": removing ${stale.length} accessor${stale.length === 1 ? 'y' : 'ies'} the panel no longer exposes.`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      for (const accessory of stale) {
        this.cached.delete(accessory.UUID);
        const { objectId } = accessory.context as AccessoryContext;
        rt.security.delete(objectId);
        rt.zones.delete(objectId);
      }
    }
    this.log.info(`Panel "${rt.label}": ${alarms.length} alarm panel(s), ${rt.zones.size} zone(s).`);
  }

  private onAlarmState(rt: PanelRuntime, objectId: string, state: AlarmControlPanelState): void {
    rt.security.get(objectId)?.applyState(state);
  }

  private onZoneState(rt: PanelRuntime, objectId: string, active: boolean, missing: boolean): void {
    const handler = rt.zones.get(objectId);
    if (!handler) {
      return;
    }
    handler.applyState(active, missing);
    this.log.debug(`Panel "${rt.label}": ${handler.zone.name} ${missing ? 'unknown' : active ? 'active' : 'clear'}.`);
  }

  private onConnectionChange(rt: PanelRuntime, connected: boolean): void {
    for (const handler of [...rt.security.values(), ...rt.zones.values()]) {
      handler.setFault(!connected);
    }
  }

  private async shutdown(): Promise<void> {
    this.mdns?.destroy();
    await Promise.all(this.panels.map(rt => rt.conn?.stop()));
  }
}
