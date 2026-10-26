# Troubleshooting

## Log messages

| Message | What to do |
|---|---|
| `has no encryption key: anyone on your network can disarm it` | Add `api: encryption: key:` to the panel's ESPHome config and the same key to the plugin. |
| `the encryption key is missing or wrong` | Copy the key exactly from the panel's ESPHome config. |
| `"encryptionKey" must be the 32-byte base64 key` | The key in the plugin settings isn't valid base64 of 32 bytes. |
| `answered unencrypted although an encryption key is configured` | The panel has no encryption, or something else answered at its address. Fix it, then restart Homebridge. |
| `exposes no alarm control panel` | Standalone alarm mode isn't enabled in the panel's firmware. |
| `the panel requires a code but none is configured` | Add the alarm code to the panel's settings in the plugin. |
| `panel did not confirm … reverting` | Wrong or missing code, or that mode isn't allowed right now. |
| `the panel does not support arm home` | The panel has no Home mode. Use Away or Night. |
| `cannot connect … retrying` | Check the IP address, port 6053 and the panel's Wi-Fi. |
| `Found panel … add it to "panels" to use it` | Discovery saw a Konnected panel you haven't configured. |

## Debugging

Start Homebridge in debug mode (`-D`, or *Homebridge Debug Mode* in the Homebridge UI settings) to log every zone change and the ESPHome client's own messages. The alarm code and key are redacted even there.

The ESP8266 panels accept only a few API connections at once. If Home Assistant, the ESPHome dashboard or other tools are also connected, keep the total low.

## Migrating from homebridge-konnected

[homebridge-konnected](https://github.com/konnected-io/homebridge-konnected) talks to the legacy 3.x firmware and runs the alarm inside Homebridge. After you reflash a panel to Konnected's ESPHome firmware with standalone mode:

1. Remove the old `konnected` platform (and its child bridge, if any) from your config.
2. Add this plugin and your panel.
3. Remove any stale accessories from Apple Home, and re-create the automations that used them.

## Reporting a problem

[Open an issue](https://github.com/peterrakolcza/homebridge-konnected-standalone/issues) with:
- your panel model and ESPHome version,
- your Homebridge and Node.js versions,
- the plugin log, captured with `-D`.

Remove anything personal before posting. The plugin already redacts your code and key.
