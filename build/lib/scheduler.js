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
var scheduler_exports = {};
__export(scheduler_exports, {
  NonOverlappingScheduler: () => NonOverlappingScheduler
});
module.exports = __toCommonJS(scheduler_exports);
var import_domain = require("./domain");
class NonOverlappingScheduler {
  constructor(task, intervalMs, onError, timerApi = import_domain.systemTimer) {
    this.task = task;
    this.intervalMs = intervalMs;
    this.onError = onError;
    this.timerApi = timerApi;
  }
  timer;
  running = false;
  stopped = true;
  start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.schedule(0);
  }
  stop() {
    this.stopped = true;
    if (this.timer) {
      this.timerApi.cancel(this.timer);
    }
    this.timer = void 0;
  }
  async runNow() {
    if (this.running || this.stopped) {
      return false;
    }
    this.running = true;
    try {
      await this.task();
    } catch (error) {
      this.onError(error);
    } finally {
      this.running = false;
    }
    return true;
  }
  schedule(delay) {
    this.timer = this.timerApi.schedule(async () => {
      await this.runNow();
      if (!this.stopped) {
        this.schedule(this.intervalMs);
      }
    }, delay);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NonOverlappingScheduler
});
//# sourceMappingURL=scheduler.js.map
