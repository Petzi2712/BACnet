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
var cov_exports = {};
__export(cov_exports, {
  CovManager: () => CovManager
});
module.exports = __toCommonJS(cov_exports);
var import_queue = require("./queue");
class CovManager {
  constructor(client, timer, onNotification, onFallback) {
    this.client = client;
    this.timer = timer;
    this.onNotification = onNotification;
    this.onFallback = onFallback;
    this.client.onCov(this.listener);
  }
  active = /* @__PURE__ */ new Map();
  stopped = false;
  listener = (message) => {
    const subscription = this.active.get(message.payload.subscriberProcessId);
    if (subscription) {
      this.onNotification(subscription.target, message);
    }
  };
  async start(target, lifetimeSeconds) {
    if (this.stopped) {
      return false;
    }
    const subscription = { target, lifetimeSeconds };
    this.active.set(target.subscriberId, subscription);
    try {
      await this.subscribe(subscription);
      return true;
    } catch (error) {
      this.active.delete(target.subscriberId);
      this.onFallback(target, error);
      return false;
    }
  }
  async stopAll() {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.client.offCov(this.listener);
    const subscriptions = [...this.active.values()];
    this.active.clear();
    await new import_queue.BoundedQueue(4).map(subscriptions, async (subscription) => {
      if (subscription.timer) {
        this.timer.clearTimeout(subscription.timer);
      }
      try {
        await this.client.subscribeCov(
          subscription.target.address,
          subscription.target.objectId,
          subscription.target.subscriberId,
          true,
          false,
          0
        );
      } catch {
      }
    });
  }
  async subscribe(subscription) {
    await this.client.subscribeCov(
      subscription.target.address,
      subscription.target.objectId,
      subscription.target.subscriberId,
      false,
      false,
      subscription.lifetimeSeconds
    );
    subscription.timer = this.timer.setTimeout(
      () => {
        void this.renew(subscription);
      },
      Math.max(1e3, subscription.lifetimeSeconds * 800)
    );
  }
  async renew(subscription) {
    if (this.stopped || !this.active.has(subscription.target.subscriberId)) {
      return;
    }
    try {
      await this.subscribe(subscription);
    } catch (error) {
      this.active.delete(subscription.target.subscriberId);
      this.onFallback(subscription.target, error);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CovManager
});
//# sourceMappingURL=cov.js.map
