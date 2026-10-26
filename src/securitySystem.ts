import { AlarmControlPanelState } from 'esphome-client';
import type { AlarmControlPanelEntity } from 'esphome-client';
import type { CharacteristicValue, HAP, Logging, PlatformAccessory, Service } from 'homebridge';

import { commandForTarget, confirmsRequest, HkCurrent, HkTarget, mapPanelState, validTargets } from './mapping.ts';
import type { MappedState } from './mapping.ts';
import type { PanelLink } from './panelLink.ts';

export interface SecuritySystemOptions {
  code?: string;
  commandTimeoutMs: number;
}

// HAPStatus.SERVICE_COMMUNICATION_FAILURE. HAPStatus is a const enum, and reading it through `hap` crashes tsc 6.0.3's checker.
const SERVICE_COMMUNICATION_FAILURE = -70402;

const TARGET_LABEL: Record<HkTarget, string> = {
  [HkTarget.STAY_ARM]: 'arm home',
  [HkTarget.AWAY_ARM]: 'arm away',
  [HkTarget.NIGHT_ARM]: 'arm night',
  [HkTarget.DISARM]: 'disarm',
};

const STATE_LABEL: Record<AlarmControlPanelState, string> = {
  [AlarmControlPanelState.DISARMED]: 'disarmed',
  [AlarmControlPanelState.ARMED_HOME]: 'armed home',
  [AlarmControlPanelState.ARMED_AWAY]: 'armed away',
  [AlarmControlPanelState.ARMED_NIGHT]: 'armed night',
  [AlarmControlPanelState.ARMED_VACATION]: 'armed vacation',
  [AlarmControlPanelState.ARMED_CUSTOM_BYPASS]: 'armed custom bypass',
  [AlarmControlPanelState.PENDING]: 'entry delay',
  [AlarmControlPanelState.ARMING]: 'arming',
  [AlarmControlPanelState.DISARMING]: 'disarming',
  [AlarmControlPanelState.TRIGGERED]: 'TRIGGERED',
};

/**
 * Target that matches what HomeKit currently shows as armed/disarmed; used to revert after a failed request.
 */
function targetForCurrent(mapped: MappedState): HkTarget {
  switch (mapped.current) {
  case HkCurrent.STAY_ARM:
    return HkTarget.STAY_ARM;
  case HkCurrent.AWAY_ARM:
    return HkTarget.AWAY_ARM;
  case HkCurrent.NIGHT_ARM:
    return HkTarget.NIGHT_ARM;
  case HkCurrent.DISARMED:
    return HkTarget.DISARM;
  default:
    return mapped.target;
  }
}

/**
 * Mirrors a panel's alarm_control_panel entity onto a HomeKit SecuritySystem service. HomeKit values only ever come from panel-reported
 * state; a HomeKit request is forwarded and reverted if the panel does not confirm it.
 */
export class SecuritySystemHandler {
  private readonly accessory: PlatformAccessory;
  private readonly hap: HAP;
  private readonly link: PanelLink;
  private readonly log: Logging;
  private readonly opts: SecuritySystemOptions;
  private readonly service: Service;
  private entity: AlarmControlPanelEntity | undefined;
  private mapped: MappedState = { current: HkCurrent.DISARMED, target: HkTarget.DISARM };
  private lastState: AlarmControlPanelState | undefined;
  private requested: HkTarget | null = null;
  private requestSeq = 0;
  private pendingArms = 0;
  private warnedMissingCode = false;
  private connectionFault = false;
  // True until the panel has reported a state since the last (re)connect, so HomeKit never shows an unreported state as healthy.
  private awaitingState = true;

  constructor(accessory: PlatformAccessory, hap: HAP, link: PanelLink, log: Logging, opts: SecuritySystemOptions) {
    this.accessory = accessory;
    this.hap = hap;
    this.link = link;
    this.log = log;
    this.opts = opts;
    const { Service, Characteristic } = hap;
    this.service = accessory.getService(Service.SecuritySystem) ?? accessory.addService(Service.SecuritySystem, accessory.displayName);
    this.service.getCharacteristic(Characteristic.SecuritySystemTargetState).onSet(value => this.handleTargetSet(value));
    this.service.getCharacteristic(Characteristic.StatusFault);
    this.publish();
    this.publishFault();
  }

  configure(entity: AlarmControlPanelEntity): void {
    this.entity = entity;
    this.service.getCharacteristic(this.hap.Characteristic.SecuritySystemTargetState)
      .setProps({ validValues: validTargets(entity.supportedFeatures ?? 0) });
    if ((entity.requiresCode || entity.requiresCodeToArm) && !this.opts.code && !this.warnedMissingCode) {
      this.warnedMissingCode = true;
      this.log.warn(`${this.name}: the panel requires a code but none is configured; arm/disarm from Home will fail.`);
    }
  }

  applyState(state: AlarmControlPanelState): void {
    this.mapped = mapPanelState(state, this.mapped, this.requested);
    if (state !== AlarmControlPanelState.ARMING && state !== AlarmControlPanelState.DISARMING) {
      this.requested = null;
    }
    if (state !== this.lastState) {
      this.lastState = state;
      this.log.info(`${this.name}: ${STATE_LABEL[state]}`);
    }
    this.awaitingState = false;
    this.publish();
    this.publishFault();
  }

  setFault(fault: boolean): void {
    this.connectionFault = fault;
    if (fault) {
      this.awaitingState = true;
    }
    this.publishFault();
  }

  private publishFault(): void {
    const { StatusFault } = this.hap.Characteristic;
    this.service.updateCharacteristic(StatusFault, this.connectionFault || this.awaitingState ? StatusFault.GENERAL_FAULT : StatusFault.NO_FAULT);
  }

  private get name(): string {
    return this.accessory.displayName;
  }

  private publish(): void {
    const { SecuritySystemCurrentState, SecuritySystemTargetState } = this.hap.Characteristic;
    this.service.updateCharacteristic(SecuritySystemTargetState, this.mapped.target);
    this.service.updateCharacteristic(SecuritySystemCurrentState, this.mapped.current);
  }

  private codeFor(target: HkTarget): string | undefined {
    const needsCode = target === HkTarget.DISARM ? this.entity?.requiresCode : this.entity?.requiresCodeToArm;
    return needsCode ? this.opts.code : undefined;
  }

  private handleTargetSet(value: CharacteristicValue): void {
    if (!this.link.connected || !this.entity) {
      throw new this.hap.HapStatusError(SERVICE_COMMUNICATION_FAILURE);
    }
    const target = value as HkTarget;
    const seq = ++this.requestSeq;
    this.requested = target;
    const label = TARGET_LABEL[target];
    this.log.info(`${this.name}: ${label} requested from Home.`);

    // While an earlier arm request is still in flight, ARMING may belong to it, so it cannot confirm this one.
    const supersedesArm = this.pendingArms > 0;
    const isArm = target !== HkTarget.DISARM;
    if (isArm) {
      this.pendingArms++;
    }
    const confirm = (s: AlarmControlPanelState) =>
      supersedesArm && s === AlarmControlPanelState.ARMING ? false : confirmsRequest(target, s);

    this.link.sendAlarmCommand(this.entity.objectId, commandForTarget(target), this.codeFor(target), confirm, this.opts.commandTimeoutMs)
      .finally(() => {
        if (isArm) {
          this.pendingArms--;
        }
      })
      .then(() => {
        if (seq === this.requestSeq) {
          this.log.info(`${this.name}: panel confirmed ${label}.`);
        }
      })
      .catch(() => {
        if (seq !== this.requestSeq) {
          return;
        }
        this.requested = null;
        // Re-derive from what the panel last reported, so a revert during an exit delay keeps the arming target.
        this.mapped = this.lastState !== undefined
          ? mapPanelState(this.lastState, this.mapped, null)
          : { ...this.mapped, target: targetForCurrent(this.mapped) };
        this.log.warn(`${this.name}: panel did not confirm ${label} within ${this.opts.commandTimeoutMs / 1000} s; reverting.`);
        this.publish();
      });
  }
}
