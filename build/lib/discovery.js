"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var discovery_exports = {};
__export(discovery_exports, {
  DiscoveryManager: () => DiscoveryManager
});
module.exports = __toCommonJS(discovery_exports);
var import_ids = require("./ids");
class DiscoveryManager {
  constructor(client, timer) {
    this.client = client;
    this.timer = timer;
  }
  active;
  generation = 0;
  start(options) {
    var _a;
    if (((_a = this.active) == null ? void 0 : _a.progress.status) === "running") {
      return this.active;
    }
    const generation = ++this.generation;
    const devices = /* @__PURE__ */ new Map();
    const progress = {
      jobId: `discovery-${this.timer.now()}-${generation}`,
      kind: "discovery",
      status: "running",
      startedAt: this.timer.now(),
      processed: 0,
      errors: []
    };
    let finish;
    const done = new Promise((resolve) => finish = resolve);
    const timeoutRef = {};
    let finished = false;
    const listener = (message) => {
      var _a2, _b;
      if (finished || generation !== this.generation) {
        return;
      }
      const address = (_b = (_a2 = message.header) == null ? void 0 : _a2.sender) != null ? _b : { address: message.payload.address };
      const key = (0, import_ids.addressKey)(address);
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
          conflictingAddresses: []
        });
      } else if (existing.addressKey === key) {
        existing.lastSeen = this.timer.now();
        existing.maxApdu = message.payload.maxApdu;
        existing.segmentation = message.payload.segmentation;
        existing.vendorId = message.payload.vendorId;
      } else {
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
        this.timer.clearTimeout(timeoutRef.value);
      }
      progress.status = status;
      progress.finishedAt = this.timer.now();
      finish([...devices.values()]);
    };
    timeoutRef.value = this.timer.setTimeout(() => complete("completed"), options.durationMs);
    const job = {
      progress,
      devices,
      done,
      cancel: () => complete("cancelled")
    };
    this.active = job;
    this.client.on("iAm", listener);
    const whoIsOptions = {
      ...options.lowLimit == null ? {} : { lowLimit: options.lowLimit },
      ...options.highLimit == null ? {} : { highLimit: options.highLimit }
    };
    if (options.targets.length === 0) {
      this.client.whoIs(void 0, whoIsOptions);
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
    var _a;
    return (_a = this.active) == null ? void 0 : _a.progress;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DiscoveryManager
});
//# sourceMappingURL=discovery.js.map
