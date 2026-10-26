# homebridge-konnected-standalone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public Homebridge dynamic-platform plugin that shows a Konnected panel running ESPHome standalone alarm firmware as one native Security System tile, plus one live sensor per zone.

**Architecture:** Start from a copy of `homebridge-plugin-template`. Pure modules (state mapping, config normalisation, zone selection, mDNS parsing) are unit-tested on their own. A `PanelConnection` wraps one long-lived `esphome-client` connection per panel and exposes a narrow `PanelLink` interface. HAP handlers (`SecuritySystemHandler`, `ZoneSensorHandler`) depend only on `PanelLink` and HAP, so they're tested with fakes. `platform.ts` only wires these together.

**Tech Stack:** TypeScript (ESM, `erasableSyntaxOnly`), Homebridge `^1.8.0 || ^2.0.0`, `esphome-client` 2.0.0, `bonjour-service`, Node's built-in test runner (`node --test` on `.ts` files via type stripping), `@homebridge/hap-nodejs` for tests.

**Spec:** `/Users/peterrakolcza/Downloads/konnected_alarm_plugin/docs/superpowers/specs/2026-10-26-homebridge-konnected-standalone-design.md`. Read it before starting; the State mapping, Codes and Connection sections are normative.

**Repo location:** `/Users/peterrakolcza/Downloads/konnected_alarm_plugin/homebridge-konnected-standalone/` (new git repo). All paths below are relative to it. Reference code: `../reference/homebridge-plugin-template`, `../reference/esphome-client` (API in `README.md` and `src/`), `../reference/homebridge-ratgdo` (a real plugin built on `esphome-client`).

## Global Constraints

- npm `name`: `homebridge-konnected-standalone`; `displayName`: `Konnected Standalone`; `pluginAlias`/`PLATFORM_NAME`: `KonnectedStandalone`; licence Apache-2.0.
- Description (package.json, README first line): "Unofficial Homebridge plugin for Konnected alarm panels running ESPHome standalone alarm mode. Native Apple Home alarm tile plus live zone sensors."
- `engines`: `"node": "^22.20.0 || ^24.0.0"`, `"homebridge": "^1.8.0 || ^2.0.0"`.
- Transport is the ESPHome native API via `esphome-client` only. No `@2colors/esphome-native-api`, no REST/SSE, no MQTT.
- One connection per configured panel. Never connect to unconfigured devices.
- The plugin never decides alarm state. HomeKit values come only from panel-reported state (or reverting to it).
- Never put `code` or `encryptionKey` in any log line at any level.
- No Switch accessory that arms or disarms, and no siren/beeper/LED/diagnostic entities in HomeKit.
- Use named constants for every enum. ESPHome command `ARM_AWAY=1, ARM_HOME=2` vs state `ARMED_HOME=1, ARMED_AWAY=2`; never pass integers between systems.
- Default `commandTimeout` is 10 s; default `discovery` is `true`; default zone type is `motion`.
- Imports use `.ts` extensions (`./mapping.ts`). Use `rewriteRelativeImportExtensions` for emit. No TS `enum`, `namespace` or constructor parameter properties (type-stripping compatibility).

## Review Focus

1. **Armed from elsewhere** (panel keypad, Home Assistant, ESPHome dashboard): ARMING arrives without a HomeKit request. Expect Target=AWAY_ARM while arming, then Current and Target both correct when ARMED_HOME arrives. Test: Task 5 `armed from elsewhere corrects target`.
2. **Rapid re-taps:** the user taps Away, then Home before Away confirms. The older request's timeout must not revert the newer one. Test: Task 5 `newer request supersedes older timeout`.
3. **Wrong or missing code:** the panel ignores the command. Expect a warning and a revert after the timeout, and no log line containing the code. Test: Task 5 `rejected command reverts and never logs code`.
4. **Reconnect after a power cut:** the client cache clears and entities are re-listed. Expect the fault to set on disconnect and clear on reconnect, with alarm and zone values refreshed from the new state events. Test: Task 7 `reconnect clears fault and resyncs`.
5. **Zone with `missingState`** at boot (sensor not yet read): expect MotionDetected/ContactSensorState to stay at "no motion/closed" with StatusFault=1 until a real state arrives. Test: Task 6 `missing state sets fault`.

---

### Task 1: Scaffold the repo from the template

**Files:**
- Create: whole repo, copied from `../reference/homebridge-plugin-template` (exclude `.git`, `node_modules`, `package-lock.json`)
- Modify: `package.json`, `tsconfig.json`, `config.schema.json`, `src/settings.ts`, `src/index.ts`, `README.md`, `.github/workflows/build.yml`, `.npmignore`
- Create: `tsconfig.build.json`, `src/settings.test.ts`, `docs/superpowers/specs/2026-10-26-homebridge-konnected-standalone-design.md` (copy of the spec), `docs/superpowers/plans/2026-10-26-homebridge-konnected-standalone.md` (copy of this plan)
- Delete: `src/platformAccessory.ts`, `src/@types/homebridge-lib.d.ts`

**Interfaces:**
- Produces: `PLATFORM_NAME = "KonnectedStandalone"`, `PLUGIN_NAME = "homebridge-konnected-standalone"` from `src/settings.ts`. Scripts `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`.

- [ ] **Step 1: Copy the template and init git**

```bash
cd /Users/peterrakolcza/Downloads/konnected_alarm_plugin
rsync -a --exclude .git --exclude node_modules --exclude package-lock.json reference/homebridge-plugin-template/ homebridge-konnected-standalone/
cd homebridge-konnected-standalone && git init -b main
```

- [ ] **Step 2: Edit `package.json`**

Apply the name, displayName, description and engines from Global Constraints. Set `"version": "0.1.0"`, remove `"private": true`, and set repository/homepage/bugs to `https://github.com/<github-user>/homebridge-konnected-standalone` (take the user from `git config user.name`, or leave `<github-user>` and flag it in the README TODO). Add keywords `konnected`, `esphome`, `alarm`, `security-system`, `standalone`.
- `dependencies`: remove `homebridge-lib`; add `"esphome-client": "2.0.0"` and `"bonjour-service": "^1.3.0"`.
- `devDependencies`: add `"@homebridge/hap-nodejs": "^2.2.0"`.
- Scripts:
  - `"build": "rimraf ./dist && tsc -p tsconfig.build.json"`
  - `"typecheck": "tsc -p tsconfig.json --noEmit"`
  - `"test": "node --test \"src/**/*.test.ts\""`
  - `"prepublishOnly": "npm run lint && npm run typecheck && npm test && npm run build"`
- Add `"files": ["dist", "config.schema.json", "LICENSE", "README.md"]`.

- [ ] **Step 3: Edit the tsconfigs**

`tsconfig.json`: keep the template options and add `"rewriteRelativeImportExtensions": true`, `"erasableSyntaxOnly": true`, `"verbatimModuleSyntax": true`, `"noEmit": true`. `tsconfig.build.json` extends it with `"noEmit": false`, `"include": ["src"]`, `"exclude": ["src/**/*.test.ts", "src/testing/**"]`.

- [ ] **Step 4: Write the failing test `src/settings.test.ts`**

```ts
test("settings match package.json and config.schema.json", () => {
  assert.equal(PLUGIN_NAME, pkg.name);                 // pkg read via fs + JSON.parse
  assert.equal(PLATFORM_NAME, schema.pluginAlias);
  assert.equal(PLATFORM_NAME, "KonnectedStandalone");
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `npm install && npm test`
Expected: FAIL (`ExampleHomebridgePlugin` !== `KonnectedStandalone`)

- [ ] **Step 6: Update the settings, schema, index and README**

- `src/settings.ts`: set the constants above, with `.ts` imports.
- `config.schema.json`: set `"pluginAlias": "KonnectedStandalone"`, keep `singular: true`, and set the `name` default to `"Konnected Standalone"`. The full schema comes in Task 3.
- `src/index.ts`: register a placeholder `KonnectedStandalonePlatform` class in `src/platform.ts` that logs "not implemented yet".
- `README.md`: a stub with the description line and the no-affiliation notice: "This project is not affiliated with, endorsed by, or supported by Konnected Inc. or the Homebridge project."
- `.github/workflows/build.yml`: Node matrix `[22.20.x, 24.x]`, running `npm ci`, lint, typecheck, test and build.

- [ ] **Step 7: Verify**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all pass, and `dist/index.js` exists.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold homebridge-konnected-standalone from homebridge-plugin-template"
```

---

### Task 2: State and command mapping (`src/mapping.ts`)

**Files:**
- Create: `src/mapping.ts`, `src/mapping.test.ts`

**Interfaces:**
- Consumes: `AlarmControlPanelState`, `AlarmControlPanelCommand` from `esphome-client`.
- Produces:
  - `HkCurrent = { STAY_ARM: 0, AWAY_ARM: 1, NIGHT_ARM: 2, DISARMED: 3, ALARM_TRIGGERED: 4 } as const` and type `HkCurrent`
  - `HkTarget = { STAY_ARM: 0, AWAY_ARM: 1, NIGHT_ARM: 2, DISARM: 3 } as const` and type `HkTarget`
  - `AcpFeature = { ARM_HOME: 1, ARM_AWAY: 2, ARM_NIGHT: 4 } as const`. Re-export the library's constant if it exports one.
  - `interface MappedState { current: HkCurrent; target: HkTarget }`
  - `mapPanelState(state: AlarmControlPanelState, prev: MappedState, requested: HkTarget | null): MappedState`
  - `commandForTarget(target: HkTarget): AlarmControlPanelCommand`
  - `validTargets(supportedFeatures: number): HkTarget[]`, always including DISARM, in ascending order
  - `confirmsRequest(target: HkTarget, state: AlarmControlPanelState): boolean`

- [ ] **Step 1: Write the failing tests**

One table-driven test per row of the spec's State mapping table, using `prev = { current: DISARMED, target: DISARM }` unless the row says otherwise:

```ts
test("HK constants equal HAP values", () => {
  assert.equal(HkCurrent.ALARM_TRIGGERED, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
  assert.equal(HkTarget.DISARM, Characteristic.SecuritySystemTargetState.DISARM); // ...all 9 values
});
test("armed states", () => {
  assert.deepEqual(mapPanelState(S.ARMED_HOME, prev, null), { current: HkCurrent.STAY_ARM, target: HkTarget.STAY_ARM });
  // ARMED_AWAY→AWAY/AWAY, ARMED_NIGHT→NIGHT/NIGHT, ARMED_VACATION→AWAY/AWAY, ARMED_CUSTOM_BYPASS→STAY/STAY, DISARMED→DISARMED/DISARM
});
test("ARMING keeps current and targets the requested mode", () => {
  assert.deepEqual(mapPanelState(S.ARMING, prev, HkTarget.NIGHT_ARM), { current: HkCurrent.DISARMED, target: HkTarget.NIGHT_ARM });
  assert.deepEqual(mapPanelState(S.ARMING, prev, null), { current: HkCurrent.DISARMED, target: HkTarget.AWAY_ARM });
});
test("PENDING keeps armed state", () => {
  const armed = { current: HkCurrent.AWAY_ARM, target: HkTarget.AWAY_ARM };
  assert.deepEqual(mapPanelState(S.PENDING, armed, null), armed);
});
test("DISARMING targets DISARM", () => { /* current unchanged, target DISARM */ });
test("TRIGGERED sets current only", () => {
  const armed = { current: HkCurrent.AWAY_ARM, target: HkTarget.AWAY_ARM };
  assert.deepEqual(mapPanelState(S.TRIGGERED, armed, null), { current: HkCurrent.ALARM_TRIGGERED, target: HkTarget.AWAY_ARM });
});
test("commands never swap home and away", () => {
  assert.equal(commandForTarget(HkTarget.STAY_ARM), AlarmControlPanelCommand.ARM_HOME);
  assert.equal(commandForTarget(HkTarget.AWAY_ARM), AlarmControlPanelCommand.ARM_AWAY);
  assert.equal(commandForTarget(HkTarget.NIGHT_ARM), AlarmControlPanelCommand.ARM_NIGHT);
  assert.equal(commandForTarget(HkTarget.DISARM), AlarmControlPanelCommand.DISARM);
});
test("validTargets follows supported_features", () => {
  assert.deepEqual(validTargets(AcpFeature.ARM_HOME | AcpFeature.ARM_AWAY), [HkTarget.STAY_ARM, HkTarget.AWAY_ARM, HkTarget.DISARM]);
  assert.deepEqual(validTargets(0), [HkTarget.DISARM]);
});
test("confirmsRequest", () => {
  assert.equal(confirmsRequest(HkTarget.STAY_ARM, S.ARMED_HOME), true);
  assert.equal(confirmsRequest(HkTarget.STAY_ARM, S.ARMING), true);
  assert.equal(confirmsRequest(HkTarget.STAY_ARM, S.ARMED_AWAY), false);
  assert.equal(confirmsRequest(HkTarget.DISARM, S.DISARMED), true);
  assert.equal(confirmsRequest(HkTarget.DISARM, S.ARMING), false);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/mapping.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/mapping.ts`**

Write `mapPanelState` as an exhaustive `switch` over `AlarmControlPanelState`, with a `never` check in `default`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git commit -am "feat: ESPHome alarm to HomeKit state mapping"` (after `git add src/mapping*`)

---

### Task 3: Config schema and normalisation (`src/config.ts`)

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`
- Modify: `config.schema.json`

**Interfaces:**
- Produces:
  - `type ZoneType = "motion" | "contact"`
  - `interface ZoneOverride { id: string; type?: ZoneType; hidden?: boolean }`
  - `interface PanelConfig { name?: string; host?: string; mac?: string; port: number; encryptionKey?: string; code?: string; zones: ZoneOverride[] }`
  - `interface PluginConfig { name: string; panels: PanelConfig[]; commandTimeoutMs: number; discovery: boolean }`
  - `normalizeConfig(raw: unknown, log: Pick<Logging, "error" | "warn">): PluginConfig`
  - `normalizeMac(mac: string): string` (lower-case, colon-separated; accepts `-`, `:` or no separators)
  - `panelLabel(p: PanelConfig): string`, which returns name, else host, else mac, and never includes the key or code

- [ ] **Step 1: Write the failing tests**

```ts
test("defaults", () => {
  const c = normalizeConfig({ platform: "KonnectedStandalone", panels: [{ host: "10.0.0.5" }] }, log);
  assert.equal(c.commandTimeoutMs, 10_000); assert.equal(c.discovery, true);
  assert.equal(c.panels[0].port, 6053); assert.deepEqual(c.panels[0].zones, []);
});
test("panel without host or mac is dropped with an error", () => { /* panels.length === 0; log.error called once */ });
test("mac normalised", () => assert.equal(normalizeMac("F4-CF-A2-6F-67-C3"), "f4:cf:a2:6f:67:c3"));
test("commandTimeout in seconds", () => { /* {commandTimeout: 15} → 15_000; values < 2 or non-numbers → 10_000 + warn */ });
test("invalid zone override type ignored", () => { /* {id:"z",type:"door"} → type undefined + warn */ });
test("errors never contain secrets", () => {
  normalizeConfig({ panels: [{ encryptionKey: "SECRETKEY", code: "9876" }] }, log);
  for (const msg of log.messages) { assert.ok(!msg.includes("SECRETKEY")); assert.ok(!msg.includes("9876")); }
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/config.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/config.ts` and the full `config.schema.json`**

The schema follows the spec's config shape:
- `panels` is an array of objects with `name`, `host`, `mac`, `port` (default 6053), `encryptionKey` (`"x-schema-form": {"type":"password"}`) and `code` (also password).
- `zones` is an array of `{id, type: enum ["motion","contact"], hidden}`.
- Top level has `commandTimeout` (integer, seconds, default 10, minimum 2) and `discovery` (boolean, default true).
- Add a `layout` so each panel renders as an expandable section.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git add src/config* config.schema.json && git commit -m "feat: config schema and normalisation"`

---

### Task 4: Zone and panel entity selection (`src/zones.ts`)

**Files:**
- Create: `src/zones.ts`, `src/zones.test.ts`

**Interfaces:**
- Consumes: `Entity`, `AlarmControlPanelEntity`, `BinarySensorEntity`, `EntityCategory` from `esphome-client`; `ZoneOverride`, `ZoneType` from Task 3.
- Produces:
  - `interface ZoneSpec { objectId: string; name: string; type: ZoneType }`
  - `selectZones(entities: readonly Entity[], overrides: readonly ZoneOverride[]): ZoneSpec[]`
  - `findAlarmPanels(entities: readonly Entity[]): AlarmControlPanelEntity[]`

- [ ] **Step 1: Write the failing tests**

Use `mockEntity` from `esphome-client/testing` to build entities.

```ts
test("binary sensors become motion zones by default", () => { /* 2 binary_sensors → 2 ZoneSpec type "motion", in entity order */ });
test("diagnostic, config, status and disabled-by-default sensors skipped", () => { /* entityCategory DIAGNOSTIC/CONFIG, isStatusBinarySensor true, disabledByDefault true → excluded */ });
test("override matches objectId or name case-insensitively", () => { /* {id:"Zone 2",type:"contact"} matches name "zone 2" */ });
test("hidden override removes zone", () => {});
test("non-binary entities ignored; alarm panels found", () => { /* switch, sensor ignored; findAlarmPanels returns the ACP */ });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/zones.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/zones.ts`**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git add src/zones* && git commit -m "feat: zone and alarm panel entity selection"`

---

### Task 5: Security System handler (`src/securitySystem.ts`)

**Files:**
- Create: `src/panelLink.ts`, `src/securitySystem.ts`, `src/securitySystem.test.ts`, `src/testing/fakeAccessory.ts`

**Interfaces:**
- Consumes: Task 2 mapping; `AlarmControlPanelEntity`.
- Produces:
  - `src/panelLink.ts`:
    ```ts
    export interface PanelLink {
      readonly connected: boolean;
      /** Resolves with the first panel state for which `confirm(state)` is true; rejects on timeout. */
      sendAlarmCommand(objectId: string, command: AlarmControlPanelCommand, code: string | undefined,
                       confirm: (s: AlarmControlPanelState) => boolean, timeoutMs: number): Promise<AlarmControlPanelState>;
    }
    ```
  - `class SecuritySystemHandler` with:
    - `constructor(accessory: PlatformAccessory, hap: HAP, link: PanelLink, log: Logging, opts: { code?: string; commandTimeoutMs: number })`
    - `configure(entity: AlarmControlPanelEntity): void`, which sets the Name, validTargets and the code warnings
    - `applyState(state: AlarmControlPanelState): void`
    - `setFault(fault: boolean): void`
  - `src/testing/fakeAccessory.ts`: `createFakeAccessory(name: string, uuid: string): PlatformAccessory`. It holds real `hap.Service` instances, implements `getService`/`addService`/`removeService`/`services`/`context`, and is cast to `PlatformAccessory`.

- [ ] **Step 1: Write the failing tests**

Use a `FakeLink` whose `sendAlarmCommand` records its calls and returns a promise the test resolves or rejects. Drive HomeKit sets through `characteristic.handleSetRequest(value)` (HAP-NodeJS).

```ts
test("configure sets valid target values from features", () => { /* features ARM_HOME|ARM_AWAY → props.validValues [0,1,3] */ });
test("set target sends mapped command and keeps target until confirmed", () => {
  // set STAY_ARM → link call command ARM_HOME, code from opts; Target=STAY_ARM, Current unchanged
});
test("offline set throws communication failure", () => {
  // link.connected=false → handleSetRequest rejects with HapStatusError status HAPStatus.SERVICE_COMMUNICATION_FAILURE; no link call
});
test("rejected command reverts and never logs code", () => {
  // opts.code "4321"; link rejects with DOMException TimeoutError → Target reverted to mapped current; log.warn called; no log arg contains "4321"
});
test("newer request supersedes older timeout", () => {
  // set AWAY (pending), set STAY (pending), reject first → Target stays STAY_ARM
});
test("armed from elsewhere corrects target", () => {
  // applyState(ARMING) with no request → Target AWAY_ARM; applyState(ARMED_HOME) → Current STAY_ARM, Target STAY_ARM
});
test("triggered updates current only", () => {});
test("requires code with none configured warns once at configure", () => {});
test("setFault toggles StatusFault", () => {});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/securitySystem.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

- Keep `requested: HkTarget | null` and a monotonically increasing `requestSeq`. A rejection only reverts when its seq equals the latest one.
- Pass `code` only when `entity.requiresCode` (for disarm), or when `entity.requiresCodeToArm` (for arm commands), and a code is configured.
- The `confirm` predicate is `(s) => confirmsRequest(target, s)`.
- Info-log "Arm away requested" / "Panel confirmed armed away" / "Panel did not confirm arm away within 10 s; reverting".
- Clear `requested` when the confirmed state arrives or on revert.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git add src/panelLink.ts src/securitySystem* src/testing && git commit -m "feat: SecuritySystem accessory handler"`

---

### Task 6: Zone sensor handler (`src/zoneSensor.ts`)

**Files:**
- Create: `src/zoneSensor.ts`, `src/zoneSensor.test.ts`

**Interfaces:**
- Consumes: `ZoneSpec` (Task 4), `createFakeAccessory` (Task 5).
- Produces: `class ZoneSensorHandler` with:
  - `constructor(accessory: PlatformAccessory, hap: HAP, zone: ZoneSpec)`
  - `applyState(active: boolean, missingState?: boolean): void`
  - `setFault(fault: boolean): void`
  - `readonly zone: ZoneSpec`

- [ ] **Step 1: Write the failing tests**

```ts
test("motion zone exposes MotionSensor", () => { /* applyState(true) → MotionDetected true */ });
test("contact zone exposes ContactSensor", () => { /* applyState(true) → ContactSensorState CONTACT_NOT_DETECTED (1); false → DETECTED (0) */ });
test("type change replaces the old service", () => { /* cached accessory with MotionSensor + zone type contact → only ContactSensor remains */ });
test("missing state sets fault", () => { /* applyState(false, true) → value inactive, StatusFault 1; then applyState(true) → StatusFault 0 */ });
test("setFault", () => {});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/zoneSensor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Keep the fault from `setFault` and the missing-state fault as separate flags. StatusFault = OR of both.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git add src/zoneSensor* && git commit -m "feat: zone sensor accessory handler"`

---

### Task 7: Panel connection (`src/panelConnection.ts`)

**Files:**
- Create: `src/panelConnection.ts`, `src/panelConnection.test.ts`

**Interfaces:**
- Consumes: `PanelLink` (Task 5), `PanelConfig` (Task 3); `EspHomeClient`, `entityId` from `esphome-client`; `MockClient`, `mockEntity`, `mockDeviceInfo` from `esphome-client/testing`.
- Produces:
  - `type ClientFactory = (opts: { host: string; port: number; psk: string | null; logger: EspHomeLogging }) => EspHomeClient` (the default creates `new EspHomeClient(opts)` with the library's default reconnect and keep-alive)
  - `interface PanelEvents { onEntities(mac: string, entities: Entity[]): void; onAlarmState(objectId: string, state: AlarmControlPanelState): void; onZoneState(objectId: string, active: boolean, missing: boolean): void; onConnectionChange(connected: boolean): void }`
  - `class PanelConnection implements PanelLink` with:
    - `constructor(cfg: PanelConfig, host: string, events: PanelEvents, log: Logging, factory?: ClientFactory)`
    - `start(): Promise<void>`
    - `stop(): Promise<void>`
    - `readonly connected: boolean`
    - `readonly mac: string | undefined`
    - `sendAlarmCommand(...)` (as in `PanelLink`)

- [ ] **Step 1: Write the failing tests**

Inject a factory that returns a `MockClient`.

```ts
test("entities forwarded with device mac", () => { /* setDeviceInfo mac "AA:BB:..", populateEntities → onEntities("aa:bb:..", list) */ });
test("alarm and binary sensor telemetry dispatched", () => { /* emitState alarm_control_panel ARMED_AWAY → onAlarmState; binary_sensor state true → onZoneState(id,true,false) */ });
test("sendAlarmCommand uses commandAndAwait with code and predicate", () => { /* mock.commands[0] has command ARM_HOME and code; emitState ARMED_HOME resolves */ });
test("sendAlarmCommand rejects after timeout", () => { /* use mock.timers or small timeout; no matching state → rejects TimeoutError */ });
test("reconnect clears fault and resyncs", () => {
  // setConnected(false) → onConnectionChange(false); setConnected(true) + populateEntities + emitState → onConnectionChange(true), onEntities and states again
});
test("unencrypted panel warns once", () => { /* no encryptionKey → log.warn mentions "anyone on your network can disarm" */ });
test("logger adapter redacts secrets", () => { /* client logger call containing the psk string → logged text has it replaced with "***" */ });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/panelConnection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

- Subscribe via `client.on("deviceInfo" | "entities" | "connect" | "disconnect" | "alarm_control_panel" | "binary_sensor", ...)` before `connect()`.
- `sendAlarmCommand` calls `client.commandAndAwait(entityId("alarm_control_panel", objectId), { command, code: code ?? "" }, { predicate: e => confirm(e.state), timeoutMs })`. If `timeoutMs` isn't the option name, use the `AbortSignal.timeout(timeoutMs)` signal.
- `start()` logs and swallows the first-connect failure. Reconnect is the library's job.
- Map `EncryptionKeyInvalidError`/`EncryptionRequiredError` to one clear error log that names the panel label.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git add src/panelConnection* && git commit -m "feat: ESPHome panel connection"`

---

### Task 8: mDNS discovery parsing (`src/discovery.ts`)

**Files:**
- Create: `src/discovery.ts`, `src/discovery.test.ts`

**Interfaces:**
- Consumes: `Service` type from `bonjour-service`; `PanelConfig`, `normalizeMac` (Task 3).
- Produces:
  - `interface DiscoveredDevice { name: string; mac: string; host: string; port: number; konnected: boolean }`
  - `parseService(svc: Service): DiscoveredDevice | null` (MAC from TXT `mac`, normalised; host is the first IPv4 in `addresses`, else `svc.host`)
  - `resolvePanelHost(cfg: PanelConfig, found: readonly DiscoveredDevice[]): string | undefined` (returns `cfg.host`, else the host of the device with an equal MAC)
  - `isUnconfigured(dev: DiscoveredDevice, panels: readonly PanelConfig[]): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
test("parses esphomelib service with mac txt", () => { /* txt {mac:"f4cfa26f67c3"} → mac "f4:cf:a2:6f:67:c3", ipv4 preferred */ });
test("service without mac returns null", () => {});
test("konnected flag from _konnected._tcp type or txt project_name containing konnected", () => {});
test("resolvePanelHost prefers configured host, else mac match", () => {});
test("isUnconfigured by mac or host", () => {});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/discovery.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement** (compare `../reference/homebridge-ratgdo/src/discovery.ts` for the TXT parsing pattern)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

`git add src/discovery* && git commit -m "feat: mDNS discovery parsing"`

---

### Task 9: Platform wiring (`src/platform.ts`)

**Files:**
- Modify: `src/platform.ts`, `src/index.ts`
- Create: `src/accessoryIds.ts`, `src/accessoryIds.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `accessoryUuid(hap: HAP, mac: string, objectId: string): string`, which is `hap.uuid.generate(`${PLUGIN_NAME}:${mac}:${objectId}`)`
  - `staleAccessories(cached: readonly PlatformAccessory[], mac: string, liveUuids: ReadonlySet<string>): PlatformAccessory[]`, which returns the cached accessories with `context.mac === mac` whose UUID isn't live
  - `class KonnectedStandalonePlatform implements DynamicPlatformPlugin`

- [ ] **Step 1: Write the failing tests `src/accessoryIds.test.ts`**

```ts
test("uuid stable and distinct per entity", () => { /* same inputs equal; different objectId differ */ });
test("staleAccessories only touches this panel", () => { /* accessory of another mac never returned; live ones kept */ });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test src/accessoryIds.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/accessoryIds.ts`, then `src/platform.ts`**

The platform does this, in order:
1. The constructor calls `normalizeConfig`, and `configureAccessory` caches restored accessories.
2. On `didFinishLaunching`:
   - If `discovery` is on, start Bonjour browsing `esphomelib` and `konnected`. Log each unconfigured device once at info: `Found panel <name> (<mac>) at <host>; add it to "panels" to use it.`
   - For each panel, start a `PanelConnection` once a host is known: immediately for `host`, or when discovery resolves its `mac`.
3. On `onEntities`:
   - Build or restore the Security System accessory per `findAlarmPanels` and a zone accessory per `selectZones`, setting `context = { mac, objectId, kind }`. The Security System display name is `cfg.name`, else deviceInfo `friendlyName`, else the entity name. Zone accessories use the entity name.
   - Register new accessories, then unregister `staleAccessories`. This happens only here, never on disconnect.
   - Set the AccessoryInformation manufacturer to "Konnected (via ESPHome)" and the model and firmware from deviceInfo.
4. Route `onAlarmState`, `onZoneState` and `onConnectionChange` to the handlers. Debug-log every zone change.
5. On `shutdown`, call `stop()` on every connection and destroy Bonjour.

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 5: Smoke-run Homebridge locally**

Put a panel entry with an unreachable host (`192.0.2.1`) in `test/hbConfig/config.json`, then run:

```bash
npx homebridge -I -D -U ./test/hbConfig -P .
```

Expected: the plugin loads, logs a connection failure for the panel label with no key or code shown, keeps retrying, and does not crash. Stop with Ctrl-C.

- [ ] **Step 6: Commit**

`git add -A && git commit -m "feat: platform wiring, accessory lifecycle and discovery"`

---

### Task 10: Release readiness

**Files:**
- Modify: `README.md`, `package.json` (if needed), `.npmignore`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write the README**

It needs these sections:
- What it does
- What standalone mode is (link Konnected's support article)
- Supported firmware: Konnected ESPHome firmware with standalone alarm mode, on ESP8266 V1/V2 and Pro/ESP32. Legacy 3.x is not supported; use `homebridge-konnected` for it.
- Requirements: Node ≥ 22.20 and Homebridge 1.8+/2.x
- Setting an API encryption key in ESPHome, with a YAML snippet for `api: encryption: key:`
- The config example from the spec
- How HomeKit states map, as a short table
- Codes
- Troubleshooting: logs, `-D`, and the "Found panel … add it to config" message
- Migrating from `homebridge-konnected`
- The no-affiliation notice
- Licence

- [ ] **Step 2: Write `CHANGELOG.md`**

Add a `0.1.0` entry.

- [ ] **Step 3: Verify the package contents**

Run: `npm pack --dry-run`
Expected: it lists only `dist/**`, `config.schema.json`, `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`, with no test files and no `src/testing`.

- [ ] **Step 4: Run the full gate**

Run: `npm run prepublishOnly`
Expected: PASS

- [ ] **Step 5: Commit**

`git add -A && git commit -m "docs: README, changelog and package contents for 0.1.0"`

Publishing to npm and creating the GitHub repo are **not** part of this plan. They need the user's accounts and explicit go-ahead.
