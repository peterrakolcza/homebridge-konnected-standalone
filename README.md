<div align="center">

[![Konnected Standalone for Homebridge](https://raw.githubusercontent.com/peterrakolcza/homebridge-konnected-standalone/latest/docs/images/banner.svg)](https://github.com/peterrakolcza/homebridge-konnected-standalone)

# Homebridge Konnected Standalone

[![Version](https://img.shields.io/npm/v/homebridge-konnected-standalone?color=%235B2C83&label=version&logo=npm&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-konnected-standalone)
[![Downloads](https://img.shields.io/npm/dt/homebridge-konnected-standalone?color=%235B2C83&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-konnected-standalone)
[![Homebridge](https://img.shields.io/badge/homebridge-1.8%20%7C%202.x-%235B2C83?logo=homebridge&logoColor=%23FFFFFF&style=for-the-badge)](https://homebridge.io)

## Native Apple Home support for Konnected alarm panels running ESPHome standalone alarm mode.

</div>

<sub>Unofficial community plugin. Not affiliated with, endorsed by, or supported by Konnected Inc. or the Homebridge project.</sub>

## Why use this plugin?

Konnected's ESPHome firmware can run a **complete alarm system on the panel itself**: arming, entry and exit delays, bypass and the siren. Konnected supports that mode through Home Assistant. This plugin brings it to **Apple Home** through Homebridge, and keeps every bit of alarm logic on the panel.

That split matters for an alarm: **if Homebridge, the server or the network goes down, the panel keeps protecting the house and the siren still sounds.** Homebridge only mirrors what the panel reports and passes your commands on.

### Features

- 🛡️ **Native Security System tile** for each panel: Home, Away, Night and Off, "Arming…" during the exit delay, and **Triggered** with Apple's standard alarm notification.
- 🚪 **Live zone sensors**, discovered automatically from the panel. Motion by default; any zone can be shown as a contact sensor or hidden.
- ✅ **Honest state:**
  - Home only shows what the panel reports.
  - Unconfirmed requests revert.
  - An offline panel shows *No Response* instead of a fake "Arming…".
  - The entry delay never shows as Off.
- 🔐 **Secure by default:**
  - Uses the encrypted ESPHome native API (Noise).
  - Refuses plaintext fallbacks and malformed keys.
  - Never logs your alarm code or key.
- 🧭 **Survives your network:** auto-reconnects, and can find a panel by MAC and follow it to a new IP address.
- ⚙️ **Point-and-click setup** in the Homebridge UI, with no YAML or JSON required.

### What's not in this plugin

- **Legacy Konnected 3.x firmware.** Use [homebridge-konnected](https://github.com/konnected-io/homebridge-konnected) for that.
- **Running the alarm in Homebridge.** By design, the panel does that.
- **Zone bypass, vacation or custom-bypass arming from Home.** HomeKit has no way to express them; they still work on the panel.
- **Siren, beeper or diagnostic switches.** These are deliberately not exposed, so nothing in Home can silence the alarm behind your back.

## Installation

You need a Konnected panel (ESP8266 V1/V2 or Pro/ESP32) flashed with Konnected's ESPHome firmware with **standalone alarm mode** enabled. You also need Homebridge 1.8+ or 2.x on Node.js 22.20+ or 24.

1. **Install** *Konnected Standalone* from the Homebridge UI's Plugins tab, or run:
   ```bash
   npm install -g homebridge-konnected-standalone
   ```
2. **Secure the panel.** Add an API encryption key to its ESPHome config (`api: encryption: key:`). Without one, anyone on your network can disarm it.
3. **Configure** the plugin: add your panel's IP address (or MAC), the encryption key and, if your panel uses one, the alarm code.
4. **Restart Homebridge.** The alarm tile and zone sensors appear in Apple Home.

<div align="center">
<img src="https://raw.githubusercontent.com/peterrakolcza/homebridge-konnected-standalone/latest/docs/images/config-panel.png" alt="Plugin settings in the Homebridge UI" width="560" />
</div>

## Documentation

| | |
|---|---|
| [Configuration](https://github.com/peterrakolcza/homebridge-konnected-standalone/blob/latest/docs/Configuration.md) | Every setting, zone overrides, screenshots and a `config.json` example |
| [How it works](https://github.com/peterrakolcza/homebridge-konnected-standalone/blob/latest/docs/HowItWorks.md) | Architecture, how alarm states map to Apple Home, security model |
| [Troubleshooting](https://github.com/peterrakolcza/homebridge-konnected-standalone/blob/latest/docs/Troubleshooting.md) | Log messages explained, debugging, migrating from homebridge-konnected |
| [Changelog](https://github.com/peterrakolcza/homebridge-konnected-standalone/blob/latest/CHANGELOG.md) | What changed in each release |

## Tested with

| Hardware | Firmware | Homebridge |
|---|---|---|
| Konnected Alarm Panel (ESP8266, `nodemcuv2`) | ESPHome 2026.9.1, Konnected standalone alarm | 2.4.0 on Node.js 24 (Docker) |

Tested on a Pro / ESP32 panel? Please [open an issue](https://github.com/peterrakolcza/homebridge-konnected-standalone/issues) and say how it went.

## Plugin development dashboard

[![License](https://img.shields.io/npm/l/homebridge-konnected-standalone?color=%23000000&logo=open%20source%20initiative&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/peterrakolcza/homebridge-konnected-standalone/blob/latest/LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/peterrakolcza/homebridge-konnected-standalone/build.yml?branch=latest&color=%23000000&logo=github-actions&logoColor=%23FFFFFF&style=for-the-badge)](https://github.com/peterrakolcza/homebridge-konnected-standalone/actions/workflows/build.yml)
[![Node](https://img.shields.io/node/v/homebridge-konnected-standalone?color=%23000000&logo=node.js&logoColor=%23FFFFFF&style=for-the-badge)](https://nodejs.org)

Built with TypeScript on [esphome-client](https://github.com/hjdhjd/esphome-client), starting from the [Homebridge plugin template](https://github.com/homebridge/homebridge-plugin-template).

```bash
npm install && npm test && npm run lint && npm run typecheck && npm run build
```

Issues and pull requests are welcome.

---

<sub>Licensed under [Apache-2.0](https://github.com/peterrakolcza/homebridge-konnected-standalone/blob/latest/LICENSE). "Konnected" is a trademark of Konnected Inc. and is used only to describe compatible hardware.</sub>
