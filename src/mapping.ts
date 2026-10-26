import { AlarmControlPanelCommand, AlarmControlPanelState } from 'esphome-client';

/**
 * HomeKit SecuritySystemCurrentState values. Mirrors HAP so pure code does not need a HAP instance.
 */
export const HkCurrent = {
  STAY_ARM: 0,
  AWAY_ARM: 1,
  NIGHT_ARM: 2,
  DISARMED: 3,
  ALARM_TRIGGERED: 4,
} as const;

export type HkCurrent = typeof HkCurrent[keyof typeof HkCurrent];

/**
 * HomeKit SecuritySystemTargetState values.
 */
export const HkTarget = {
  STAY_ARM: 0,
  AWAY_ARM: 1,
  NIGHT_ARM: 2,
  DISARM: 3,
} as const;

export type HkTarget = typeof HkTarget[keyof typeof HkTarget];

/**
 * ESPHome AlarmControlPanelFeature bits (`supported_features`). esphome-client does not export these.
 */
export const AcpFeature = {
  ARM_HOME: 1,
  ARM_AWAY: 2,
  ARM_NIGHT: 4,
} as const;

export interface MappedState {
  current: HkCurrent;
  target: HkTarget;
}

/**
 * Map a panel-reported state onto HomeKit current/target values. `prev` is what HomeKit shows now; `requested` is the target the
 * user asked for through HomeKit and is still waiting on, if any.
 */
export function mapPanelState(state: AlarmControlPanelState, prev: MappedState, requested: HkTarget | null): MappedState {
  switch (state) {
  case AlarmControlPanelState.DISARMED:
    return { current: HkCurrent.DISARMED, target: HkTarget.DISARM };
  case AlarmControlPanelState.ARMED_HOME:
  case AlarmControlPanelState.ARMED_CUSTOM_BYPASS:
    return { current: HkCurrent.STAY_ARM, target: HkTarget.STAY_ARM };
  case AlarmControlPanelState.ARMED_AWAY:
  case AlarmControlPanelState.ARMED_VACATION:
    return { current: HkCurrent.AWAY_ARM, target: HkTarget.AWAY_ARM };
  case AlarmControlPanelState.ARMED_NIGHT:
    return { current: HkCurrent.NIGHT_ARM, target: HkTarget.NIGHT_ARM };
  case AlarmControlPanelState.ARMING:
    // The panel does not say which mode it is arming towards; fall back to Away when armed from outside HomeKit.
    return { current: prev.current, target: requested !== null && requested !== HkTarget.DISARM ? requested : HkTarget.AWAY_ARM };
  case AlarmControlPanelState.PENDING: {
    // The entry delay only runs while armed. If HomeKit still shows disarmed (the panel armed with no exit delay and a zone tripped
    // at once), show the requested mode, or Away when unknown; never Off.
    if (prev.current !== HkCurrent.DISARMED) {
      return { ...prev };
    }
    const mode = requested !== null && requested !== HkTarget.DISARM ? requested : HkTarget.AWAY_ARM;
    return { current: mode, target: mode };
  }
  case AlarmControlPanelState.DISARMING:
    return { current: prev.current, target: HkTarget.DISARM };
  case AlarmControlPanelState.TRIGGERED:
    return { current: HkCurrent.ALARM_TRIGGERED, target: prev.target };
  default: {
    const unreachable: never = state;
    return unreachable;
  }
  }
}

export function commandForTarget(target: HkTarget): AlarmControlPanelCommand {
  switch (target) {
  case HkTarget.STAY_ARM:
    return AlarmControlPanelCommand.ARM_HOME;
  case HkTarget.AWAY_ARM:
    return AlarmControlPanelCommand.ARM_AWAY;
  case HkTarget.NIGHT_ARM:
    return AlarmControlPanelCommand.ARM_NIGHT;
  case HkTarget.DISARM:
    return AlarmControlPanelCommand.DISARM;
  default: {
    const unreachable: never = target;
    return unreachable;
  }
  }
}

/**
 * Target values HomeKit may offer, limited by the entity's supported features. DISARM is always allowed.
 */
export function validTargets(supportedFeatures: number): HkTarget[] {
  const targets: HkTarget[] = [];
  if (supportedFeatures & AcpFeature.ARM_HOME) {
    targets.push(HkTarget.STAY_ARM);
  }
  if (supportedFeatures & AcpFeature.ARM_AWAY) {
    targets.push(HkTarget.AWAY_ARM);
  }
  if (supportedFeatures & AcpFeature.ARM_NIGHT) {
    targets.push(HkTarget.NIGHT_ARM);
  }
  targets.push(HkTarget.DISARM);
  return targets;
}

/**
 * Whether a reported panel state settles a HomeKit request for `target`: the requested state itself, or for arm requests ARMING
 * (exit delay) or PENDING (armed with no exit delay and a zone already tripped).
 */
export function confirmsRequest(target: HkTarget, state: AlarmControlPanelState): boolean {
  switch (target) {
  case HkTarget.DISARM:
    return state === AlarmControlPanelState.DISARMED;
  case HkTarget.STAY_ARM:
    return state === AlarmControlPanelState.ARMED_HOME || state === AlarmControlPanelState.ARMING || state === AlarmControlPanelState.PENDING;
  case HkTarget.AWAY_ARM:
    return state === AlarmControlPanelState.ARMED_AWAY || state === AlarmControlPanelState.ARMING || state === AlarmControlPanelState.PENDING;
  case HkTarget.NIGHT_ARM:
    return state === AlarmControlPanelState.ARMED_NIGHT || state === AlarmControlPanelState.ARMING || state === AlarmControlPanelState.PENDING;
  default: {
    const unreachable: never = target;
    return unreachable;
  }
  }
}
