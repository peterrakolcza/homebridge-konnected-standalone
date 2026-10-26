# Konnected Standalone for Homebridge

Unofficial Homebridge plugin for Konnected alarm panels running ESPHome standalone alarm mode. Native Apple Home alarm tile plus live zone sensors.

> This project is not affiliated with, endorsed by, or supported by Konnected Inc. or the Homebridge project. "Konnected" is used only to describe the hardware this plugin works with.

## What it does

For each configured panel you get:

- **One Security System tile** in Apple Home: Home, Away, Night and Off. It shows "Arming…" during the exit delay and **Triggered** when the alarm goes off, which sends the standard Home alarm notification. It shows a fault when the panel can't be reached.
- **One sensor per zone**, updated live as the panel reports changes. Zones are motion sensors by default; any zone can be shown as a contact sensor instead.

The plugin runs **no alarm logic**. Arming, entry/exit delays, bypass and the siren all run on the panel. The plugin shows what the panel reports and passes your arm/disarm requests on. If Homebridge is down, the alarm still works and the siren still sounds; you only lose Apple Home control and notifications until it's back.

## What standalone mode is

Konnected's ESPHome-based firmware can run a complete alarm system on the panel itself ([Konnected: Standalone Alarm System](https://support.konnected.io/standalone-alarm-system-on-the-konnected-alarm-panel)). This plugin connects to that alarm over the ESPHome native API (TCP 6053, Noise encryption) using [`esphome-client`](https://github.com/hjdhjd/esphome-client).

## Supported firmware

- Konnected ESPHome firmware with the standalone alarm (an ESPHome `alarm_control_panel` entity) enabled.
- Original ESP8266 panels (V1/V2) and the Pro / ESP32 panels.
- **Not supported:** legacy Konnected 3.x firmware. Use [`homebridge-konnected`](https://github.com/konnected-io/homebridge-konnected) for that.

## Requirements

- Node.js 22.20 or newer (22.x or 24.x)
- Homebridge 1.8+ or 2.x
- The panel reachable from Homebridge on TCP 6053. For mDNS discovery, Homebridge's Docker container needs host networking.

## Set an API encryption key on the panel

Without a key, **anyone on your network can disarm the alarm**. Add one to the panel's ESPHome config and reflash it:

```yaml
api:
  encryption:
    key: "<32-byte base64 key>"   # generate one at https://esphome.io/components/api/
```

Use the same key in the plugin's settings. The plugin refuses a malformed key rather than falling back to an unencrypted connection.

## Configuration

Use the plugin settings in the Homebridge UI, or add this to `config.json`:

```jsonc
{
  "platform": "KonnectedStandalone",
  "name": "Konnected Standalone",
  "panels": [
    {
      "name": "House alarm",            // optional; defaults to the panel's alarm entity name
      "host": "192.168.1.44",           // either host or mac is required
      "mac": "f4:cf:a2:6f:67:c3",       // used to find the panel via mDNS when host is omitted
      "port": 6053,                      // optional
      "encryptionKey": "base64…",        // required unless the panel has no encryption
      "code": "1234",                    // optional; sent when the panel requires a code
      "zones": [                         // optional per-zone overrides, by zone name or object ID
        { "id": "Zone 2", "type": "contact" },
        { "id": "zone_6", "hidden": true }
      ]
    }
  ],
  "commandTimeout": 10,                  // optional, seconds to wait for the panel to confirm
  "discovery": true                      // optional, find panels on the network via mDNS
}
```

The plugin only connects to panels you list. If discovery finds a Konnected panel that isn't configured, it logs `Found panel … add it to "panels" to use it.`, along with its MAC and address.

## How states map

| Panel state | Apple Home |
|---|---|
| Disarmed | Off |
| Armed home / custom bypass | Home |
| Armed away / vacation | Away |
| Armed night | Night |
| Arming (exit delay) | "Arming…" towards the requested mode |
| Pending (entry delay) | Stays armed until triggered |
| Triggered | Triggered (alarm notification) |

If the panel doesn't confirm a request within `commandTimeout` (wrong code, mode not allowed), Home goes back to the panel's actual state and the log shows a warning. If the panel is offline, Home shows "No Response" immediately.

## Codes

HomeKit has no way to type a PIN. If the panel requires a code, put it in `code`. The plugin sends it with commands only when the panel asks for one, and never writes it to the log.

## Troubleshooting

- Run Homebridge in debug mode (`-D`) to log every zone change.
- `encryption key is missing or wrong`: copy the key from the panel's `api: encryption: key:` setting.
- `exposes no alarm control panel`: standalone alarm mode isn't enabled in the panel's firmware.
- The panel's ESPHome API accepts only a few connections at once. If Home Assistant or the ESPHome dashboard are also connected, keep the total low.

## Migrating from homebridge-konnected

`homebridge-konnected` talks to the legacy 3.x firmware and runs the alarm inside Homebridge. Once you reflash to Konnected's ESPHome firmware with standalone mode, remove that plugin's platform from your config and configure this one instead. HomeKit sees new accessories, so re-add any automations that used the old ones.

## Licence

Apache-2.0
