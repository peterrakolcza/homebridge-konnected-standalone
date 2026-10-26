import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';

/**
 * Homebridge platform for Konnected panels running ESPHome standalone alarm mode.
 */
export class KonnectedStandalonePlatform implements DynamicPlatformPlugin {
  private readonly log: Logging;

  constructor(log: Logging, _config: PlatformConfig, _api: API) {
    this.log = log;
    this.log.warn('Konnected Standalone is not implemented yet.');
  }

  configureAccessory(_accessory: PlatformAccessory): void {
    // Not implemented yet.
  }
}
