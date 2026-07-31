"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryManager = void 0;
const ids_1 = require("./ids");
class DiscoveryManager {
    client;
    timer;
    active;
    generation = 0;
    constructor(client, timer) {
        this.client = client;
        this.timer = timer;
    }
    start(options) {
        if (this.active?.progress.status === "running") {
            return this.active;
        }
        const generation = ++this.generation;
        const devices = new Map();
        const progress = {
            jobId: `discovery-${this.timer.now()}-${generation}`,
            kind: "discovery",
            status: "running",
            startedAt: this.timer.now(),
            processed: 0,
            errors: [],
        };
        let finish;
        const done = new Promise(resolve => (finish = resolve));
        const timeoutRef = {};
        let finished = false;
        const listener = (message) => {
            if (finished || generation !== this.generation) {
                return;
            }
            const address = message.header?.sender ?? { address: message.payload.address };
            const key = (0, ids_1.addressKey)(address);
            const existing = devices.get(message.payload.deviceId);
            if (!existing) {
                devices.set(message.payload.deviceId, {
                    deviceInstance: message.payload.deviceId,
                    address,
                    addressKey: key,
                    maxApdu: message.payload.maxApdu,
                    segmentation: message.payload.segmentation,
                    vendorId: message.payload.vendorId,
                    lastSeen: this.timer.now(),
                    conflict: false,
                    conflictingAddresses: [],
                });
            }
            else if (existing.addressKey === key) {
                existing.lastSeen = this.timer.now();
                existing.maxApdu = message.payload.maxApdu;
                existing.segmentation = message.payload.segmentation;
                existing.vendorId = message.payload.vendorId;
            }
            else {
                existing.conflict = true;
                if (!existing.conflictingAddresses.includes(key)) {
                    existing.conflictingAddresses.push(key);
                }
            }
            progress.processed = devices.size;
        };
        const complete = (status) => {
            if (finished) {
                return;
            }
            finished = true;
            this.client.off("iAm", listener);
            if (timeoutRef.value) {
                this.timer.cancel(timeoutRef.value);
            }
            progress.status = status;
            progress.finishedAt = this.timer.now();
            finish([...devices.values()]);
        };
        timeoutRef.value = this.timer.schedule(() => complete("completed"), options.durationMs);
        const job = {
            progress,
            devices,
            done,
            cancel: () => complete("cancelled"),
        };
        this.active = job;
        this.client.on("iAm", listener);
        const whoIsOptions = {
            ...(options.lowLimit == null ? {} : { lowLimit: options.lowLimit }),
            ...(options.highLimit == null ? {} : { highLimit: options.highLimit }),
        };
        if (options.targets.length === 0) {
            this.client.whoIs(undefined, whoIsOptions);
        }
        for (const target of options.targets) {
            this.client.whoIs(target, whoIsOptions);
        }
        return job;
    }
    cancel() {
        if (!this.active || this.active.progress.status !== "running") {
            return false;
        }
        this.active.cancel();
        return true;
    }
    get status() {
        return this.active?.progress;
    }
}
exports.DiscoveryManager = DiscoveryManager;
//# sourceMappingURL=discovery.js.map