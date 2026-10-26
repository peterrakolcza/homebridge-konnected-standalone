import type { Logging } from 'homebridge';

export type ZoneType = 'motion' | 'contact';

export interface ZoneOverride {
  id: string;
  type?: ZoneType;
  hidden?: boolean;
}

export interface PanelConfig {
  name?: string;
  host?: string;
  mac?: string;
  port: number;
  encryptionKey?: string;
  code?: string;
  zones: ZoneOverride[];
}

export interface PluginConfig {
  name: string;
  panels: PanelConfig[];
  commandTimeoutMs: number;
  discovery: boolean;
}

type ConfigLog = Pick<Logging, 'error' | 'warn'>;

const DEFAULT_NAME = 'Konnected Standalone';
const DEFAULT_PORT = 6053;
const DEFAULT_TIMEOUT_S = 10;
const MIN_TIMEOUT_S = 2;

/**
 * Lower-case, colon-separated MAC. Accepts `-`, `:` or no separators. Returns an empty string when the input is not a MAC.
 */
export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[:-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(hex)) {
    return '';
  }
  return hex.match(/../g)!.join(':');
}

/**
 * Human label for a panel in logs. Never includes the encryption key or code.
 */
export function panelLabel(p: PanelConfig): string {
  return p.name ?? p.host ?? p.mac ?? 'unnamed panel';
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeZones(raw: unknown, label: string, log: ConfigLog): ZoneOverride[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const zones: ZoneOverride[] = [];
  for (const item of raw) {
    const z = record(item);
    const id = str(z.id);
    if (id === undefined) {
      log.warn(`Panel "${label}": ignoring a zone override without an "id".`);
      continue;
    }
    let type: ZoneType | undefined;
    if (z.type === 'motion' || z.type === 'contact') {
      type = z.type;
    } else if (z.type !== undefined) {
      log.warn(`Panel "${label}": zone "${id}" has unknown type; use "motion" or "contact".`);
    }
    zones.push({ id, type, hidden: z.hidden === true });
  }
  return zones;
}

function normalizePanel(raw: unknown, index: number, log: ConfigLog): PanelConfig | undefined {
  const p = record(raw);
  const name = str(p.name);
  const host = str(p.host);
  const rawMac = str(p.mac);
  const label = name ?? host ?? rawMac ?? `#${index + 1}`;

  let mac: string | undefined;
  if (rawMac !== undefined) {
    mac = normalizeMac(rawMac) || undefined;
  }
  if (host === undefined && mac === undefined) {
    log.error(`Panel "${label}" has no valid "host" or "mac" and will be ignored.`);
    return undefined;
  }
  if (rawMac !== undefined && mac === undefined) {
    log.warn(`Panel "${label}": "mac" is not a valid MAC address and will be ignored.`);
  }

  // esphome-client silently drops a malformed key and connects in plaintext; refuse the panel instead.
  const encryptionKey = str(p.encryptionKey);
  if (encryptionKey !== undefined && Buffer.from(encryptionKey, 'base64').length !== 32) {
    log.error(`Panel "${label}": "encryptionKey" must be the 32-byte base64 key from the panel's ESPHome config; the panel will be ignored.`);
    return undefined;
  }

  let port = DEFAULT_PORT;
  if (p.port !== undefined) {
    if (Number.isInteger(p.port) && (p.port as number) > 0 && (p.port as number) < 65536) {
      port = p.port as number;
    } else {
      log.warn(`Panel "${label}": invalid "port"; using ${DEFAULT_PORT}.`);
    }
  }

  return {
    name,
    host,
    mac,
    port,
    encryptionKey,
    code: str(p.code),
    zones: normalizeZones(p.zones, label, log),
  };
}

/**
 * Validate the raw platform config and fill in defaults. Invalid panels are dropped with an error; invalid optional values fall back
 * to defaults with a warning. Messages never include the encryption key or code.
 */
export function normalizeConfig(raw: unknown, log: ConfigLog): PluginConfig {
  const c = record(raw);

  let timeoutS = DEFAULT_TIMEOUT_S;
  if (c.commandTimeout !== undefined) {
    if (typeof c.commandTimeout === 'number' && Number.isFinite(c.commandTimeout) && c.commandTimeout >= MIN_TIMEOUT_S) {
      timeoutS = c.commandTimeout;
    } else {
      log.warn(`"commandTimeout" must be a number of seconds, at least ${MIN_TIMEOUT_S}; using ${DEFAULT_TIMEOUT_S}.`);
    }
  }

  const panels: PanelConfig[] = [];
  if (Array.isArray(c.panels)) {
    c.panels.forEach((p, i) => {
      const panel = normalizePanel(p, i, log);
      if (panel) {
        panels.push(panel);
      }
    });
  }

  return {
    name: str(c.name) ?? DEFAULT_NAME,
    panels,
    commandTimeoutMs: timeoutS * 1000,
    discovery: c.discovery !== false,
  };
}
