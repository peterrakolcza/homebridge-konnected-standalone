import type { AlarmControlPanelCommand, AlarmControlPanelState } from 'esphome-client';

/**
 * What accessory handlers need from a panel connection.
 */
export interface PanelLink {
  readonly connected: boolean;

  /**
   * Send an alarm command. Resolves with the first panel state for which `confirm(state)` is true; rejects on timeout or failure.
   */
  sendAlarmCommand(objectId: string, command: AlarmControlPanelCommand, code: string | undefined,
    confirm: (s: AlarmControlPanelState) => boolean, timeoutMs: number): Promise<AlarmControlPanelState>;
}
