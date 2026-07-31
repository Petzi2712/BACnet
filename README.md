# BACnet Client adapter for ioBroker

`bacnet-client` is an independent ioBroker BACnet/IP client and data collector. It discovers devices with Who-Is/I-Am, imports their Device `Object_List`, reads available properties, polls process values, maintains optional COV subscriptions, and exposes the result as a stable ioBroker object tree.

Version 0.3.1 adds a fixed action bar, reliable descriptions and configurable units for individual data points, and a consistently German administration view. BACnet MS/TP devices may appear through a BACnet router; direct serial MS/TP and BACnet/SC are outside this release.

## Highlights

- BACnet/IP over UDP with configurable interface, port, broadcast and directed targets
- one cancellable discovery generation per adapter instance
- identity based on Device Instance plus Object Type/Object Instance, never mutable names
- indexed `Object_List` and `Property_List` reads
- available-device list with green/red live status, persistent manual descriptions and full-text search
- checkbox selection per data point so only required states exist in the ioBroker object tree
- deselection cleanup that removes obsolete states and empty object/type/device paths on save
- bounded queues, retry/backoff and ReadPropertyMultiple-to-ReadProperty fallback
- lossless JSON fallback for complex and proprietary values
- idempotent ioBroker reconciliation without deleting the device tree on startup
- polling without overlapping cycles and optional COV renewal/fallback
- writes disabled by default and restricted by global switch, stable-ID allowlist, supported object types and BACnet priority
- versioned, atomically written inventory metadata cache; live values remain ioBroker states
- no telemetry and no mandatory external service

## Configuration

### Quick start: read a new BACnet device into ioBroker

1. Open the adapter instance and select **Network**. Enter the local IPv4 bind address, BACnet UDP port (`47808` by default) and the correct broadcast address. Save once if these values changed.
2. Make sure the adapter instance is running. Open **Devices & data points** and click **Start discovery**.
3. A green dot marks a device seen by the latest discovery. A red dot marks a previously known device that did not answer the latest scan.
4. Expand the device and click **Read device**. The adapter reads its `Object_List` and available properties without adding all of them to the ioBroker object tree.
5. Optionally enter a meaningful description such as “Ventilation building A”.
6. Use the full-text search to find an object, property, name, vendor or stable ID. Select only the required data points with their checkboxes.
7. Save the adapter settings. Newly selected points are read and created below `bacnet-client.<instance>.devices`; deselected points and now-empty paths are removed.

German short guide: [Neues Gerät einlesen](docs/de/README.md#neues-gerät-einlesen).

### Network

Select the local IPv4 bind address. Set the BACnet port (default `47808`), the subnet broadcast address, APDU timeout and discovery window. Additional targets accept `IPv4` or `IPv4:port` and may be directed broadcasts or unicasts.

Broadcast traffic normally does not cross routers. For another subnet, configure a directed target or use an existing BACnet router. This MVP does not claim BBMD/Foreign Device Registration coverage. Docker host networking, VLAN ACLs, host firewalls and another process already using UDP 47808 are common causes of missing I-Am replies or bind errors.

### Discovery, inventory and point selection

The **Devices & data points** tab offers aligned actions for discovery, cancellation, refresh and inventory import. Commands return immediately with a job identifier; long work continues in the adapter and exposes counters and errors. Duplicate Device Instance IDs are marked as conflicts and are not imported automatically.

Import reads every identity from `Object_List`, but no process state is exposed unless its checkbox is selected. It first tries `Property_List`; unsupported devices use a conservative standard-property fallback and are marked `partial`. ReadPropertyMultiple is attempted in small batches and falls back to single reads after reject, abort, segmentation errors or timeouts.

The device list remains available from the versioned inventory cache after an adapter restart. Until the next discovery, remembered devices are shown as inactive. Manual descriptions and selected stable point IDs are stored in the ioBroker instance configuration. The full-text search covers device metadata, manual descriptions, object names, object/property coordinates and stable IDs.

The same commands are available through the ioBroker message box:

- `startDiscovery`
- `cancelDiscovery`
- `getDiscoveryStatus`
- `listDevices`
- `getDeviceCatalog`
- `importDevices` with `{ "deviceInstances": [1234, 5678] }`; an empty array imports all conflict-free devices
- `cancelImport`
- `getImportStatus`
- `getDiagnostics`

### Polling and COV

The central scheduler prevents overlapping poll cycles and limits global and per-device request concurrency. Suitable analog, binary and multi-state objects may use COV. Subscriptions are renewed before expiry, both confirmed and unconfirmed notifications are accepted by the BACnet client, failures fall back to polling, and shutdown cancels subscriptions before closing the socket.

### Safe writing

Writing is disabled by default. A state becomes writable only when all conditions hold:

1. global BACnet writing is enabled;
2. its full stable ID is in `writeAllowlist`;
3. the property is `Present_Value`;
4. the object is a supported Analog/Binary/Multi-State Output or Value;
5. the configured priority is between 1 and 16.

`null` relinquishes the selected priority. The adapter validates type and range, writes, reads the value back, and only then acknowledges it. On failure it restores the last confirmed value. Reinitialize Device, DeviceCommunicationControl, Create Object and Delete Object are not implemented.

## Stable object model

Names, descriptions, location, vendor, model and aliases are display metadata only. The tree contains only the points selected in the adapter settings.

```text
bacnet-client.0
├── info
│   ├── connection
│   ├── socketReady
│   ├── discoveryRunning
│   ├── discoveryProgress
│   └── lastError
└── devices
    └── d_1234
        ├── info
        └── types
            └── analog_input
                └── o_7
                    └── present_value
```

Example: `bacnet-client.0.devices.d_1234.types.analog_input.o_7.present_value`.
Proprietary object type 128 becomes `type_128`; property 512 becomes `p_512`. Every state stores the complete BACnet address/route, Device Instance, Object Type, Object Instance, Property ID, array index and application tag in `native`.

## Diagnostics

- **UDP port cannot bind:** stop the competing process or configure another port; verify Docker/host-network settings.
- **No I-Am reply:** verify interface, subnet mask/broadcast, firewall and VLAN policy; test a directed unicast target.
- **Duplicate Device Instance:** correct the BACnet network configuration. The adapter will not silently pick one address.
- **Partial property import:** the device rejected `Property_List`; fallback properties were imported and completeness remains `partial`.
- **APDU/segmentation failures:** reduce concurrency, increase APDU timeout, and inspect Max APDU/segmentation metadata.
- **Intermittent timeouts:** check routers and broadcast storms; retries are intentionally bounded to avoid request amplification.

`getDiagnostics` returns socket selection, active jobs, counters and errors without process values. Logs identify the Device Instance and object coordinates while successful value reads are not logged at info level.

## Data and privacy

Communication stays on the configured BACnet/IP network and the local ioBroker installation. There is no telemetry or Sentry. Current process values are ioBroker states; no private long-term historian is included. The local inventory cache contains technical metadata used to display known devices and available points and is atomically updated in the official instance data directory.

## Development

Node.js 20 or newer is required. CI covers Node.js 20, 22 and 24.

```sh
npm ci
npm run build
npm run check
npm run lint
npm test
npm run test:integration
npm pack --dry-run
```

See [Architecture](docs/ARCHITECTURE.md) and [German documentation](docs/de/README.md).

## Known limits and roadmap

- BACnet/IP only; no direct serial MS/TP and no BACnet/SC
- local/directed discovery; BBMD and Foreign Device Registration require additional interoperability work
- complex Schedule, Calendar, Trend Log and proprietary structures use JSON fallback when no safe semantic decoder exists
- device-specific writeability cannot be inferred perfectly; the explicit allowlist remains mandatory
- no built-in history database; use ioBroker history/database adapters

## Changelog

### 0.3.1 (2026-07-31)

- Fixed the save/close action bar at the bottom of the administration view
- Made point descriptions reliably editable and persistent
- Added configurable units per selected data point
- Replaced remaining user-facing English terms in the German administration view

### 0.3.0 (2026-07-31)

- German administration UI and standard ioBroker action buttons
- Per-point descriptions used as visible names in the object tree
- Device object names are shown while technical IDs stay stable
- Manual object metadata such as unit, role, min, max and step survives adapter updates

### 0.2.0 (2026-07-31)

- Added available-device cards with green/red status indicators and persistent manual descriptions.
- Added full-text search and checkbox selection for individual BACnet data points.
- Added controlled cleanup of deselected states and empty object-tree paths.
- Restored cached device inventories after restart and limited polling/COV to selected points.
- Replaced the adapter settings with a structured responsive layout and aligned action buttons.
- Replaced the adapter logo with a white-background image.

### 0.1.0 (2026-07-29)

- Initial independent BACnet/IP client adapter with discovery, inventory, polling, COV, safe writes, Admin JSON Config, tests and CI.

## License

Copyright (c) 2026 EnergieFuchs

MIT License. This is not an official product of the BACnet Advocacy Group. BACnet® is a registered trademark of the American Society of Heating, Refrigerating and Air-Conditioning Engineers (ASHRAE).
