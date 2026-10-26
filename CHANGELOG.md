# Changelog

## 0.1.2

Found by an end-to-end test against a real panel:

- Fix: when the panel goes straight to the entry delay (armed with no exit delay and a zone already tripped), Home showed Off. It now shows the armed mode.
- Fix: an arm request is confirmed by the entry delay as well as by arming or armed.
- Fix: a mode the panel does not support (e.g. Home on a panel without it) is refused instead of being sent to the panel.

## 0.1.1

- Fix: a disarmed panel sends no alarm `state` field (protobuf omits zero values), so DISARMED was never applied and disarm requests never confirmed. Found on a real Konnected ESP8266 panel running ESPHome 2026.9.1.

## 0.1.0

- First release.
- One Security System accessory per Konnected panel running ESPHome standalone alarm mode, over the encrypted ESPHome native API.
- One live sensor per zone (motion by default, contact per zone).
- Confirm-or-revert for arm/disarm requests, "No Response" when the panel is offline, fault indication on disconnect.
- Optional mDNS discovery that only locates configured panels.
