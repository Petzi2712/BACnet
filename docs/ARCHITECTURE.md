# Architecture

The adapter is a single native ioBroker process. BACnet transport, discovery, inventory, mapping, scheduling, reconciliation, persistence, COV and writing are separate modules under `src/lib`.

```text
Admin/message commands
        │
        ▼
  Job coordinator ──────► DiscoveryManager
        │                       │
        ▼                       ▼
 InventoryReader ───────► BacnetJsPort ─────► BACnet/IP UDP
        │
        ├──► mapper ───► ioBroker objects/states
        ├──► InventoryStore (technical metadata only)
        └──► scheduler / COV / SafeWriter
```

## Design decisions

- `BacnetPort` and `TimerApi` are injected so core behavior is testable without a network.
- Device Instance and Object Type/Object Instance are the primary identities. The complete library address/route is retained.
- `BoundedQueue` is used in discovery enrichment, indexed array reads, imports and polling. Hot-path lookups use maps.
- `Object_List` and `Property_List` are read by array index. RPM batches fall back to single reads.
- Reconciliation updates stable IDs and preserves unrelated object metadata through ioBroker `extendObject`. Stale planning never recursively deletes the device tree.
- The inventory file has schema version 1 and uses temporary-file-plus-rename atomic replacement. A corrupt or unknown schema recovers to an empty technical cache.
- Remote values and confirmed readbacks use `ack: true`. Commands arrive with `ack: false`.
- `SafeWriter` requires a global switch, stable-ID allowlist, supported Present_Value target and valid priority.
- Unload stops jobs and the scheduler, cancels COV, removes listeners, closes the BACnet socket and guards the callback against duplicate invocation.

## Independence boundary

No visualization, GLT or foreign adapter is a runtime, development, peer or optional dependency. All managed objects are below `bacnet-client.<instance>`. Optional consumers use only normal ioBroker object/state APIs. `test/architecture.test.ts` scans package metadata, source, Admin, CI and build configuration for prohibited technical coupling.
