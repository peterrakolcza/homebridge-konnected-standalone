# Changelog

## 0.1.1

- Fix: a disarmed panel sends no alarm `state` field (protobuf omits zero values), so DISARMED was never applied and disarm requests never confirmed. Found on a real Konnected ESP8266 panel running ESPHome 2026.9.1.

## 0.1.0

- First release.
- One Security System accessory per Konnected panel running ESPHome standalone alarm mode, over the encrypted ESPHome native API.
- One live sensor per zone (motion by default, contact per zone).
- Confirm-or-revert for arm/disarm requests, "No Response" when the panel is offline, fault indication on disconnect.
- Optional mDNS discovery that only locates configured panels.
