# Changelog

## 0.1.3 (2026-10-26)

- Fix: on Node.js 22, arming/disarming and auto-reconnect failed because esphome-client uses `Promise.try`, which Node 22 lacks. The plugin now installs a spec-equivalent `Promise.try` when it is missing. Node 24 was not affected.
- Docs: neutral example IP/MAC values in the settings placeholders and screenshots.
- CI: the build workflow can also be run manually.

## 0.1.2 (2026-10-26)

First public release on npm. Fixes found by an end-to-end test against a real panel:

- Fix: when the panel goes straight to the entry delay (armed with no exit delay and a zone already tripped), Home showed Off. It now shows the armed mode.
- Fix: an arm request is confirmed by the entry delay as well as by arming or armed.
- Fix: a mode the panel does not support (e.g. Home on a panel without it) is refused instead of being sent to the panel.

## 0.1.1 (2026-10-26)

- Fix: a disarmed panel sends no alarm `state` field (protobuf omits zero values), so DISARMED was never applied and disarm requests never confirmed. Found on a real Konnected ESP8266 panel running ESPHome 2026.9.1.

## 0.1.0 (2026-10-26)

- Initial version (GitHub only).
- One Security System accessory per Konnected panel running ESPHome standalone alarm mode, over the encrypted ESPHome native API.
- One live sensor per zone (motion by default, contact per zone).
- Confirm-or-revert for arm/disarm requests, "No Response" when the panel is offline, fault indication on disconnect.
- Optional mDNS discovery that only locates configured panels.
