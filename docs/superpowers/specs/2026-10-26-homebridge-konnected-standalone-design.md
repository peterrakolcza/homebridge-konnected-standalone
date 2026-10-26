# homebridge-konnected-standalone — design

**Date:** 2026-10-26
**Status:** draft for approval
**Background research:** `reports/Konnected standalone Homebridge support.md` and `research_notes/Konnected standalone Homebridge support/` (same parent folder as this file). Reference code is cloned under `reference/` (`homebridge-plugin-template`, `esphome-client`, `homebridge-ratgdo`) and indexed in `graphify-out/graph.json`.

## 1. Intent

Konnected alarm panels can run Konnected's ESPHome firmware in **standalone alarm mode**. In that mode the panel itself runs the alarm: arming, exit/entry delays, bypass and the siren. The siren therefore still works if Homebridge, the network or the server is down. Konnected's only supported front-end for this mode is Home Assistant. The existing `homebridge-konnected` plugin only supports the legacy 3.x firmware, and runs the alarm logic inside Homebridge.

This plugin gives Apple Home users a native front-end to a standalone-mode panel. It does **not** run alarm logic. It mirrors what the panel reports and forwards arm/disarm requests. The panel stays the source of truth.

It is a **public** project for anyone with a Konnected panel in standalone mode, not just the author's install. The author's own use: one Konnected V1/V2 ESP8266 panel, controlled from an iPhone and a Mac through the Home app, with Homebridge running in Docker (host network).

## 2. Goals

1. **One native Security System tile per panel** in Apple Home, with Home (Stay), Away, Night and Off, the normal "Arming…" transition, a "Triggered" state that produces the standard HomeKit alarm notification, and a visible fault when the panel is unreachable.
2. **Live zones.** Every zone the panel exposes appears as its own sensor that updates the moment the panel reports a change. The default is a **Motion Sensor** for every zone (the author's explicit preference), with a per-zone setting to show it as a **Contact Sensor** instead.
3. **Zero manual mapping.** Zones and the alarm panel are discovered from the device's ESPHome entity list. Users do not list pins or zones by hand.
4. **Works for other people's panels.** Any Konnected board running Konnected's ESPHome firmware with standalone alarm enabled: original ESP8266 V1/V2 boards and the Pro / ESP32 boards, since they all expose the same ESPHome `alarm_control_panel` entity.
5. **Verified-plugin quality**, so it can be submitted to the Homebridge verified list: dynamic platform, `config.schema.json` settings UI, GitHub releases, clean logs, Homebridge 1.8+ and 2.x support.

## 3. Non-goals

- Building or flashing panel firmware, or shipping ESPHome YAML. Users handle their firmware (the author will write their own).
- Supporting legacy Konnected 3.x firmware. `homebridge-konnected` covers that.
- Home Assistant, MQTT, Matter or Konnected Cloud integration.
- Implementing any alarm logic in the plugin: delays, trigger decisions, siren control.
- Exposing panel internals in HomeKit: siren switch, warning beeper, status LED, Wi-Fi signal, firmware update entities.
- Zone bypass from HomeKit (HomeKit has no concept for it), and vacation / custom-bypass arming from HomeKit.
- A custom Homebridge UI (the `homebridge-ui` folder ratgdo ships). The standard schema form is enough for v1.

## 4. Anti-goals (failure even if it "works")

- **The plugin decides the alarm state.** HomeKit must only show what the panel says. Never show "armed" because a command was sent; only because the panel reported it.
- **A silent wrong mode.** Sending the wrong ESPHome command (the state and command enums order Home and Away differently) and arming Away when Home was requested.
- **HomeKit stuck on "Arming…" / "Disarming…"** after the panel rejects or ignores a command.
- **A switch-style disarm.** No plain Switch accessory that disarms, because that bypasses Apple's confirmation prompt for security systems.
- **Leaking secrets.** The disarm code or encryption key showing up in logs, including debug logs.
- **Implying it is official.** It must not suggest affiliation with Konnected or Homebridge.

## 5. Constraints

- **Base:** start from `homebridge/homebridge-plugin-template` (cloned at `reference/homebridge-plugin-template`) and build on it. Keep its TypeScript, ESM, lint, `config.schema.json`, dynamic platform structure and GitHub workflow.
- **Transport:** the ESPHome **native API** (TCP 6053, Noise encryption) through the **`esphome-client`** library (v2, zero dependencies, typed alarm commands, `commandAndAwait`). The same library powers the verified `homebridge-ratgdo`, which is the reference for how a real plugin uses it. Do not use `@2colors/esphome-native-api`: it cannot decode alarm messages (IDs 94–96). Do not use the REST/SSE web_server API: its URL and ID formats broke several times in 2026.
- **Node:** `esphome-client` requires Node ≥ 22.20, so `engines.node` is `^22.20.0 || ^24.0.0` (tighter than the template's `^22.10.0`). `engines.homebridge`: `^1.8.0 || ^2.0.0`, as in the template.
- **ESP8266 limits:** the API allows about 4 clients and has very little free memory. Use one long-lived connection per panel, reconnect with backoff plus jitter, and never open extra connections for polling.
- **Licence:** Apache-2.0, inherited from the template.
- **No affiliation:** the README and package description say "unofficial, not affiliated with Konnected Inc. or Homebridge". "Konnected" is used descriptively only.

## 6. Decisions already made

### Naming

| | |
|---|---|
| npm package | `homebridge-konnected-standalone` (checked: free on npm, 2026-10-26) |
| GitHub repo | `homebridge-konnected-standalone` |
| Platform alias (`pluginAlias`, `PLATFORM_NAME`) | `KonnectedStandalone` |
| `displayName` | `Konnected Standalone` *(author picked the plain package name; "Konnected Standalone Sentry" was offered and is the alternative)* |
| Description | "Unofficial Homebridge plugin for Konnected alarm panels running ESPHome standalone alarm mode. Native Apple Home alarm tile plus live zone sensors." |

### Accessories per panel

- **Security System** (one per `alarm_control_panel` entity, normally one per panel). Name: the panel's ESPHome friendly name.
- **One sensor per zone.** A zone is a `binary_sensor` entity on the panel. Default service is **MotionSensor**, with a per-zone override to **ContactSensor**. Name: the entity's name from the panel (e.g. "Zone 2" or whatever the user named it in YAML).
- **StatusFault** on the Security System, and on each zone sensor, is set while the panel is disconnected. Values are not reset to defaults on disconnect; the fault flag is what signals staleness.
- Accessory identity (UUID) is derived from the panel's MAC address plus the entity's ESPHome object ID, so renaming in Home survives restarts and re-discovery.

### State mapping (ESPHome → HomeKit)

Use named constants everywhere and never pass enum integers between the two systems.

| ESPHome state | HomeKit CurrentState | HomeKit TargetState | Note |
|---|---|---|---|
| DISARMED | DISARMED | DISARM | |
| ARMED_HOME | STAY_ARM | STAY_ARM | |
| ARMED_AWAY | AWAY_ARM | AWAY_ARM | |
| ARMED_NIGHT | NIGHT_ARM | NIGHT_ARM | |
| ARMED_VACATION | AWAY_ARM | AWAY_ARM | not selectable from HomeKit |
| ARMED_CUSTOM_BYPASS | STAY_ARM | STAY_ARM | not selectable from HomeKit |
| ARMING (exit delay) | keep previous (normally DISARMED) | the mode being armed | Home shows "Arming…". If the plugin requested the mode, use that; if armed from elsewhere and the target mode is unknown, use AWAY_ARM. |
| PENDING (entry delay) | keep the armed mode | unchanged | HomeKit has no "entry delay" state; stay armed until TRIGGERED |
| DISARMING | keep current | DISARM | |
| TRIGGERED | ALARM_TRIGGERED | unchanged | produces the HomeKit alarm notification |

**HomeKit → ESPHome commands:** STAY_ARM → `arm_home`, AWAY_ARM → `arm_away`, NIGHT_ARM → `arm_night`, DISARM → `disarm`, via `esphome-client`'s typed `AlarmControlPanelCommand` constants.

**Valid target values** shown in Home are limited by the entity's `supported_features` bits: Night only if ARM_NIGHT is supported, and so on. DISARM is always allowed.

**Command confirmation:** send with `commandAndAwait` (or equivalent) and wait for the panel to report the requested state, or ARMING towards it. If it doesn't arrive within about 10 s (configurable), log a warning and revert TargetState to match CurrentState, so Home does not stay stuck.

**Panel offline when a command is sent:** reject the TargetState set immediately with a HAP communication-failure error, so Home shows "No Response" at once instead of a fake "Arming…". *(Design call.)*

**After a trigger clears:** the panel may return to its previous armed state rather than to disarmed. Mirror whatever it reports.

### Codes

HomeKit has no way to enter a PIN. Each panel's config has an optional `code`. The plugin sends it with every arm/disarm command when the entity reports `requires_code` (and with arm commands when it reports `requires_code_to_arm`). If a code is required and none is configured, log one clear warning at startup and let commands fail through the revert path. The code is never logged.

### Connection and discovery

- **Discovery:** mDNS (`_esphomelib._tcp`, Konnected boards also advertise `_konnected._tcp`) finds candidate panels, but discovery **only locates panels the user configured**. It never connects to or creates accessories for an unconfigured device, even an unencrypted one: that could put someone else's panel in Home and would use one of the ESP8266's few API connections. For an unconfigured Konnected/ESPHome device, log once at info level: "Found panel <name> (<mac>) at <host>; add it to `panels` to use it." *(Design call: safer default; it avoids touching devices owned by Home Assistant or a neighbour.)* A configured entry without `host` is matched to a discovered device by its `mac` field. Each configured entry makes one connection; keys are never tried against every discovered panel. A panel is used only once it connects and exposes an `alarm_control_panel` entity.
- **Manual config:** `host` (+ optional `port`, default 6053) and `encryptionKey` per panel, for networks where mDNS doesn't work (Docker, VLANs).
- Panels with no encryption (`api:` without a key) are supported but trigger a startup warning that anyone on the LAN can disarm them.
- **One persistent connection per panel**, with `esphome-client`'s reconnect and heartbeat. On reconnect, re-list entities and re-sync all states.
- **Cached accessories** whose entities disappear from the panel are removed after the panel has connected and finished listing entities, never on a mere disconnect.

### Config shape (user-facing)

```jsonc
{
  "platform": "KonnectedStandalone",
  "name": "Konnected Standalone",
  "panels": [
    {
      "name": "House alarm",            // optional; defaults to the panel's friendly name
      "host": "192.168.1.44",           // either host or mac is required
      "mac": "f4:cf:a2:6f:67:c3",       // used to match an mDNS-discovered panel when host is omitted
      "port": 6053,                      // optional
      "encryptionKey": "base64…",        // required unless the panel has no encryption
      "code": "1234",                    // optional
      "zones": [                         // optional per-zone overrides, matched by entity name or object ID
        { "id": "zone_2", "type": "contact" },
        { "id": "zone_6", "hidden": true }
      ]
    }
  ],
  "commandTimeout": 10,                  // optional, seconds
  "discovery": true                      // optional, default true
}
```

The exact JSON key names and the `config.schema.json` layout are the builder's call, as long as the meaning above is kept.

### Logging

- **Info:** connect, disconnect and reconnect events; alarm state changes ("Armed away", "TRIGGERED"); command sent and confirmed or timed out.
- **Debug (`-D`):** every zone change and raw state.
- **Never:** code or key.

This directly fixes the author's main complaint about the legacy plugin: incidents couldn't be investigated because nothing was logged.

## 7. Left to the builder

- Module/file layout on top of the template (e.g. `platform.ts`, `panel.ts`, `securitySystem.ts`, `zoneSensor.ts`, `mapping.ts`). Use `homebridge-ratgdo` as the pattern for wiring `esphome-client` into a Homebridge platform.
- Whether to keep or drop the template's `homebridge-lib` dependency (drop it if unused).
- Which `binary_sensor` entities count as zones when a firmware exposes extra binary sensors (e.g. connectivity or diagnostic ones). A sensible rule: skip entities in ESPHome's diagnostic/config entity category, and let the per-zone `hidden` override handle the rest.
- mDNS library choice (ratgdo uses `bonjour-service`).
- Test framework and coverage. Must cover at minimum: the full state mapping table, the command enum mapping (Home vs Away), the timeout/revert path, code handling, and fault-on-disconnect, using `esphome-client`'s `MockClient`/test helpers.
- README structure (must include: what standalone mode is, a supported-firmware statement, the encryption-key how-to, the config example, the no-affiliation notice, and a migration note from `homebridge-konnected`).
- Release automation details beyond the template's build workflow.

## 8. Open risks (from research, not resolved by design)

- No primary Apple documentation on exactly how the Triggered notification is presented (Critical vs Time-Sensitive); verify on a real iPhone.
- Konnected's app-generated firmware may differ from the public YAML (encryption-key default, code settings). The plugin must cope with both encrypted and unencrypted panels.
- Free heap on ESP8266 with this firmware is unmeasured. Keep to a single connection.
- No real panel is available during initial development. Behaviour is verified with mocks first, then on the author's panel after they flash it.
