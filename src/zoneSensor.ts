import type { HAP, PlatformAccessory, Service } from 'homebridge';

import type { ZoneSpec } from './zones.ts';

/**
 * Mirrors one panel zone (binary_sensor) onto a HomeKit MotionSensor or ContactSensor.
 */
export class ZoneSensorHandler {
  readonly zone: ZoneSpec;
  private readonly hap: HAP;
  private readonly service: Service;
  private connectionFault = false;
  private missingState = false;

  constructor(accessory: PlatformAccessory, hap: HAP, zone: ZoneSpec) {
    this.zone = zone;
    this.hap = hap;
    const { Service } = hap;
    const [wanted, other] = zone.type === 'contact'
      ? [Service.ContactSensor, Service.MotionSensor]
      : [Service.MotionSensor, Service.ContactSensor];

    const stale = accessory.getService(other);
    if (stale) {
      accessory.removeService(stale);
    }
    this.service = accessory.getService(wanted) ?? accessory.addService(wanted, zone.name);
    this.service.getCharacteristic(hap.Characteristic.StatusFault);
  }

  applyState(active: boolean, missingState = false): void {
    const { Characteristic } = this.hap;
    this.missingState = missingState;
    const value = active && !missingState;
    if (this.zone.type === 'contact') {
      this.service.updateCharacteristic(Characteristic.ContactSensorState,
        value ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
    } else {
      this.service.updateCharacteristic(Characteristic.MotionDetected, value);
    }
    this.publishFault();
  }

  setFault(fault: boolean): void {
    this.connectionFault = fault;
    this.publishFault();
  }

  private publishFault(): void {
    const { StatusFault } = this.hap.Characteristic;
    this.service.updateCharacteristic(StatusFault, this.connectionFault || this.missingState ? StatusFault.GENERAL_FAULT : StatusFault.NO_FAULT);
  }
}
