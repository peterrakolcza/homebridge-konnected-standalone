# Configuration

The easiest way to configure the plugin is in the Homebridge UI: **Plugins → Konnected Standalone → Settings**.

## Plugin settings

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Panel</b><br/>
      Address, encryption key and optional alarm code. The key and code are masked.<br/><br/>
      <img src="https://raw.githubusercontent.com/peterrakolcza/homebridge-konnected-standalone/latest/docs/images/config-panel.png" alt="Panel settings: name, host, MAC address, port, API encryption key and alarm code" />
    </td>
    <td width="50%" valign="top">
      <b>Zone overrides</b><br/>
      Optional. Show a zone as a contact sensor, or hide it.<br/><br/>
      <img src="https://raw.githubusercontent.com/peterrakolcza/homebridge-konnected-standalone/latest/docs/images/config-zones.png" alt="Zone overrides: zone name, show as motion or contact sensor, hide this zone" />
      <br/><br/>
      <b>Advanced</b><br/>
      Command timeout and network discovery.<br/><br/>
      <img src="https://raw.githubusercontent.com/peterrakolcza/homebridge-konnected-standalone/latest/docs/images/config-advanced.png" alt="Advanced settings: command timeout in seconds and mDNS discovery" />
    </td>
  </tr>
</table>

## Options

| Option | Default | Description |
|---|---|---|
| `panels[].name` | alarm entity name | Name of the Security System tile in Apple Home. |
| `panels[].host` | — | Panel IP address or hostname. Either `host` or `mac` is required. |
| `panels[].mac` | — | Panel MAC address. Without `host`, the panel is found by mDNS and followed if its IP changes. |
| `panels[].port` | `6053` | ESPHome native API port. |
| `panels[].encryptionKey` | — | The panel's `api: encryption: key`, a 32-byte base64 value. Required unless the panel has no encryption. |
| `panels[].code` | — | Alarm code. Sent only when the panel requires one, and never logged. |
| `panels[].zones[]` | — | Per-zone overrides, matched by zone name or object ID: `type` (`motion` or `contact`) and `hidden`. |
| `commandTimeout` | `10` | Seconds to wait for the panel to confirm an arm or disarm before Home reverts. Minimum 2. |
| `discovery` | `true` | Use mDNS to locate configured panels. It never adds panels you haven't listed. |

Zones are discovered from the panel automatically, so you only need overrides to change how a zone is shown.

## `config.json` example

```json
{
  "platform": "KonnectedStandalone",
  "name": "Konnected Standalone",
  "panels": [
    {
      "name": "House alarm",
      "host": "192.168.1.50",
      "encryptionKey": "<32-byte base64 key from the panel's ESPHome config>",
      "code": "1234",
      "zones": [
        { "id": "Front Door", "type": "contact" },
        { "id": "zone_6", "hidden": true }
      ]
    }
  ]
}
```

## Setting an encryption key on the panel

Add a key to the panel's ESPHome configuration and reflash it, then use the same key in the plugin:

```yaml
api:
  encryption:
    key: "<32-byte base64 key>"   # generate one at https://esphome.io/components/api/
```

Without a key, the plugin works but warns at every startup, because anyone on your network can disarm the panel. With a key set, the plugin **refuses** any unencrypted answer, which protects you against misconfiguration and impersonation.

## Discovery and Docker

mDNS discovery needs Homebridge to see your LAN's multicast traffic. In Docker, run the Homebridge container with **host networking**. If discovery can't work in your setup, give each panel a `host` and set `discovery` to `false`.

## Multiple panels

Add one entry per panel. Each panel gets its own Security System tile and its own zone sensors. Konnected's standalone mode doesn't combine zones across panels, so each panel is a separate alarm.

<details>
<summary>Full settings dialog</summary>

<img src="https://raw.githubusercontent.com/peterrakolcza/homebridge-konnected-standalone/latest/docs/images/config-full.png" alt="Complete Konnected Standalone settings dialog in the Homebridge UI" width="600" />

</details>
