import * as hapNodejs from '@homebridge/hap-nodejs';
import type { Service, WithUUID } from '@homebridge/hap-nodejs';
import type { HAP, Logging, PlatformAccessory } from 'homebridge';

export const hap = hapNodejs as unknown as HAP;

type ServiceType = WithUUID<typeof Service>;

/**
 * Minimal stand-in for a Homebridge PlatformAccessory holding real HAP services, for handler tests.
 */
export function createFakeAccessory(name: string, uuid: string): PlatformAccessory {
  const services: Service[] = [new hapNodejs.Service.AccessoryInformation()];
  const matches = (s: Service, type: ServiceType | string) =>
    typeof type === 'string' ? s.displayName === type || s.subtype === type : s.UUID === type.UUID;

  const accessory = {
    displayName: name,
    UUID: uuid,
    context: {} as Record<string, unknown>,
    services,
    getService(type: ServiceType | string): Service | undefined {
      return services.find(s => matches(s, type));
    },
    addService(serviceOrType: Service | ServiceType, ...args: unknown[]): Service {
      const service = serviceOrType instanceof hapNodejs.Service
        ? serviceOrType
        : new (serviceOrType as unknown as new (...a: unknown[]) => Service)(...args);
      services.push(service);
      return service;
    },
    removeService(service: Service): void {
      const i = services.indexOf(service);
      if (i >= 0) {
        services.splice(i, 1);
      }
    },
  };
  return accessory as unknown as PlatformAccessory;
}

export interface FakeLog extends Logging {
  readonly lines: { level: string; text: string }[];
}

export function createFakeLog(): FakeLog {
  const lines: { level: string; text: string }[] = [];
  const at = (level: string) => (...args: unknown[]) => {
    lines.push({ level, text: args.map(String).join(' ') });
  };
  const log = Object.assign(at('log'), {
    lines,
    prefix: 'test',
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    debug: at('debug'),
    success: at('success'),
    log: (level: string, ...args: unknown[]) => at(level)(...args),
  });
  return log as unknown as FakeLog;
}
