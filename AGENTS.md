# Repository guide

## Structure

- `src/main.ts`: ioBroker lifecycle and orchestration
- `src/lib/`: BACnet transport, discovery, inventory, mapping, queue, scheduler, COV, reconciliation, persistence and safe writing
- `admin/`: JSON Config UI and translations
- `test/`: package, integration, architecture and scaling tests
- `docs/`: architecture and German documentation

## Commands

```sh
npm ci
npm run build
npm run check
npm run lint
npm test
npm run test:integration
npm pack --dry-run
```

Run the smallest relevant command after each change. Use Node.js 20 or newer. Do not add unbounded `Promise.all` calls over device data.

## Done

- stable IDs never depend on mutable BACnet names
- unknown values retain their numeric identity and a lossless JSON fallback
- remote values are acknowledged; writes require the explicit allowlist and readback
- scans, timers, listeners, COV and sockets are cleaned up
- no recursive device-tree deletion
- build, typecheck, lint, unit, integration, architecture, scaling and package checks pass
