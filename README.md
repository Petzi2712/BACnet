# BACnet Client adapter for ioBroker

`bacnet-client` is an independent ioBroker BACnet/IP client and data collector. It discovers devices with Who-Is/I-Am, imports their Device `Object_List`, reads available properties, polls process values, maintains optional COV subscriptions, and exposes the result as a stable ioBroker object tree.

Version 0.1.0 is a production-oriented MVP. BACnet MS/TP devices may appear through a BACnet router; direct serial MS/TP and BACnet/SC are outside this release.

## Highlights

- BACnet/IP over UDP with configurable interface, port, broadcast and directed targets
- one cancellable discovery generation per adapter instance
- identity based on Device Instance plus Object Type/Object Instance, never mutable names
- indexed `Object_List` and `Property_List` reads
- bounded queues, retry/backoff and ReadPropertyMultiple-to-ReadProperty fallback
- lossless JSON fallback for complex and proprietary values
- idempotent ioBroker reconciliation without deleting the device tree on startup
- polling without overlapping cycles and optional COV renewal/fallback
- writes disabled by default and restricted by global switch, stable-ID allowlist, supported object types and BACnet priority
- versioned, atomically written inventory metadata cache; live values remain ioBroker states
- no telemetry and no mandatory external service

## Configuration

### Network

Select the local IPv4 bind address. Set the BACnet port (default `47808`), the subnet broadcast address, APDU timeout and discovery window. Additional targets accept `IPv4` or `IPv4:port` and may be directed broadcasts or unicasts.

Broadcast traffic normally does not cross routers. For another subnet, configure a directed target or use an existing BACnet router. This MVP does not claim BBMD/Foreign Device Registration coverage. Docker host networking, VLAN ACLs, host firewalls and another process already using UDP 47808 are common causes of missing I-Am replies or bind errors.

### Discovery and import

The Discovery tab offers Start, Cancel, Job Status, Device List and Import All actions. Commands return immediately with a job identifier; long work continues in the adapter and exposes counters and errors. Duplicate Device Instance IDs are marked as conflicts and are not imported automatically.

Import reads every identity from `Object_List`. It first tries `Property_List`; unsupported devices use a conservative standard-property fallback and are marked `partial`. ReadPropertyMultiple is attempted in small batches and falls back to single reads after reject, abort, segmentation errors or timeouts.

The same commands are available through the ioBroker message box:

- `startDiscovery`
- `cancelDiscovery`
- `getDiscoveryStatus`
- `listDevices`
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

Names, descriptions, location, vendor, model and aliases are display metadata only.

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

Communication stays on the configured BACnet/IP network and the local ioBroker installation. There is no telemetry or Sentry. Current process values are ioBroker states; no private long-term historian is included. The local inventory cache contains technical metadata only and is atomically updated in the official instance data directory.

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

## License and trademark

MIT License. This is not an official product of the BACnet Advocacy Group. BACnet® is a registered trademark of the American Society of Heating, Refrigerating and Air-Conditioning Engineers (ASHRAE).
