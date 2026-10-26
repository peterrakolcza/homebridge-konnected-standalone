import {
  AlarmControlPanelState, EncryptionKeyInvalidError, EncryptionKeyMissingError, EncryptionRequiredError, entityId, EspHomeClient, PermanentError,
} from 'esphome-client';
import type { AlarmControlPanelCommand, Entity, EspHomeLogging } from 'esphome-client';
import type { Logging } from 'homebridge';

import { normalizeMac, panelLabel } from './config.ts';
import type { PanelConfig } from './config.ts';
import type { PanelLink } from './panelLink.ts';

/**
 * The part of EspHomeClient this plugin uses, so tests can substitute esphome-client's MockClient.
 */
export type PanelClient = Pick<EspHomeClient, 'on' | 'commandAndAwait' | 'connect' | 'disconnectAsync'>;

export type ClientFactory = (opts: { host: string; port: number; psk: string | null; logger: EspHomeLogging }) => PanelClient;

export interface PanelEvents {
  onEntities(mac: string, entities: Entity[]): void;
  onAlarmState(objectId: string, state: AlarmControlPanelState): void;
  onZoneState(objectId: string, active: boolean, missing: boolean): void;
  onConnectionChange(connected: boolean): void;
}

const defaultFactory: ClientFactory = opts => new EspHomeClient(opts);

const RETRY_INITIAL_MS = 5_000;

/**
 * Protobuf omits zero-valued fields, and DISARMED is 0, so a disarmed panel sends no `state` at all.
 */
function alarmStateOf(event: { state?: AlarmControlPanelState }): AlarmControlPanelState {
  return event.state ?? AlarmControlPanelState.DISARMED;
}
const RETRY_MAX_MS = 60_000;

/**
 * One long-lived ESPHome native API connection to a panel. Auto-reconnect after a drop is esphome-client's job; this class only
 * retries the very first connect, which the library does not supervise.
 */
export class PanelConnection implements PanelLink {
  private readonly cfg: PanelConfig;
  private readonly host: string;
  private readonly events: PanelEvents;
  private readonly log: Logging;
  private readonly client: PanelClient;
  private readonly label: string;
  private isConnected = false;
  private deviceMac: string | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelayMs = RETRY_INITIAL_MS;
  private stopped = false;
  private refused = false;
  // State events identify the entity by numeric key (their `entity` field is the friendly name); rebuilt on every entity listing.
  private objectIdByKey = new Map<number, string>();

  constructor(cfg: PanelConfig, host: string, events: PanelEvents, log: Logging, factory: ClientFactory = defaultFactory) {
    this.cfg = cfg;
    this.host = host;
    this.events = events;
    this.log = log;
    this.label = panelLabel(cfg);
    this.client = factory({ host, port: cfg.port, psk: cfg.encryptionKey ?? null, logger: this.makeLogger() });
    this.subscribe();
  }

  get connected(): boolean {
    return this.isConnected && !this.refused;
  }

  get mac(): string | undefined {
    return this.deviceMac;
  }

  async start(): Promise<void> {
    if (!this.cfg.encryptionKey) {
      this.log.warn(`Panel "${this.label}" has no encryption key: anyone on your network can disarm it. Set an API encryption key in its ESPHome config.`);
    }
    await this.tryConnect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    try {
      await this.client.disconnectAsync();
    } catch {
      // Already gone.
    }
  }

  sendAlarmCommand(objectId: string, command: AlarmControlPanelCommand, code: string | undefined,
    confirm: (s: AlarmControlPanelState) => boolean, timeoutMs: number): Promise<AlarmControlPanelState> {
    if (!this.connected) {
      return Promise.reject(new Error(`Panel "${this.label}" is not connected.`));
    }
    const options = code === undefined ? { command } : { command, code };
    return this.client.commandAndAwait(entityId('alarm_control_panel', objectId), options, {
      predicate: event => confirm(alarmStateOf(event)),
      timeoutMs,
    }).then(alarmStateOf);
  }

  private subscribe(): void {
    this.client.on('connect', encrypted => this.onConnect(encrypted));
    this.client.on('disconnect', () => this.setConnected(false));
    this.client.on('deviceInfo', info => {
      if (info.macAddress) {
        this.deviceMac = normalizeMac(info.macAddress) || undefined;
      }
    });
    this.client.on('entities', entities => {
      this.objectIdByKey = new Map(entities.map(e => [e.key, e.objectId]));
      this.events.onEntities(this.deviceMac ?? this.cfg.mac ?? '', entities);
    });
    this.client.on('alarm_control_panel', event => {
      const objectId = this.objectIdByKey.get(event.key);
      if (objectId !== undefined) {
        this.events.onAlarmState(objectId, alarmStateOf(event));
      }
    });
    this.client.on('binary_sensor', event => {
      const objectId = this.objectIdByKey.get(event.key);
      if (objectId !== undefined) {
        this.events.onZoneState(objectId, event.state === true, event.missingState === true);
      }
    });
  }

  private onConnect(encrypted: boolean): void {
    // esphome-client falls back to plaintext when the peer does not speak Noise. With a key configured that is either a misconfigured
    // panel or someone impersonating it, so never accept it.
    if (this.cfg.encryptionKey && !encrypted) {
      this.refused = true;
      this.log.error(`Panel "${this.label}" answered unencrypted although an encryption key is configured. Refusing the connection; `
        + 'check the panel\'s api: encryption: setting. Restart Homebridge after fixing it.');
      void this.client.disconnectAsync().catch(() => undefined);
      return;
    }
    this.setConnected(true);
  }

  private setConnected(connected: boolean): void {
    if (this.refused || connected === this.isConnected) {
      return;
    }
    this.isConnected = connected;
    if (connected) {
      this.retryDelayMs = RETRY_INITIAL_MS;
      this.log.info(`Panel "${this.label}" connected (${this.host}).`);
    } else {
      this.log.warn(`Panel "${this.label}" disconnected; reconnecting.`);
    }
    this.events.onConnectionChange(connected);
  }

  private async tryConnect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      if (this.stopped) {
        return;
      }
      if (error instanceof EncryptionKeyInvalidError || error instanceof EncryptionKeyMissingError || error instanceof EncryptionRequiredError) {
        this.log.error(`Panel "${this.label}": the encryption key is missing or wrong. Copy the key from the panel's ESPHome api: encryption: key setting.`);
        return;
      }
      if (error instanceof PermanentError) {
        this.log.error(`Panel "${this.label}": cannot connect (${this.redact(String(error))}). Not retrying.`);
        return;
      }
      const reason = this.redact(String(error));
      this.log.error(`Panel "${this.label}": cannot connect to ${this.host}:${this.cfg.port} (${reason}); retrying in ${this.retryDelayMs / 1000} s.`);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    const jitter = 0.8 + Math.random() * 0.4;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.tryConnect();
    }, this.retryDelayMs * jitter);
    this.retryTimer.unref?.();
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, RETRY_MAX_MS);
  }

  private redact(text: string): string {
    let out = text;
    for (const secret of [this.cfg.encryptionKey, this.cfg.code]) {
      if (secret) {
        out = out.split(secret).join('***');
      }
    }
    return out;
  }

  private makeLogger(): EspHomeLogging {
    const prefix = `[${this.label}] `;
    const format = (message: string, parameters: unknown[]) =>
      this.redact(prefix + [message, ...parameters.map(p => (typeof p === 'string' ? p : JSON.stringify(p)))].join(' '));
    return {
      debug: (message, ...parameters) => this.log.debug(format(message, parameters)),
      info: (message, ...parameters) => this.log.debug(format(message, parameters)),
      warn: (message, ...parameters) => this.log.warn(format(message, parameters)),
      error: (message, ...parameters) => this.log.error(format(message, parameters)),
    };
  }
}
