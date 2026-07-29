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
var queue_exports = {};
__export(queue_exports, {
  BoundedQueue: () => BoundedQueue,
  chunks: () => chunks,
  withRetry: () => withRetry
});
module.exports = __toCommonJS(queue_exports);
class BoundedQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Concurrency must be a positive integer");
    }
  }
  active = 0;
  waiting = [];
  maxObserved = 0;
  get pending() {
    return this.waiting.length;
  }
  async run(task) {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
  async map(values, task) {
    return Promise.all(values.map((value, index) => this.run(() => task(value, index))));
  }
  async acquire() {
    if (this.active >= this.concurrency) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    this.maxObserved = Math.max(this.maxObserved, this.active);
  }
  release() {
    var _a;
    this.active--;
    (_a = this.waiting.shift()) == null ? void 0 : _a();
  }
}
async function withRetry(operation, options) {
  var _a;
  const random = (_a = options.random) != null ? _a : Math.random;
  let lastError;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) {
        break;
      }
      const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);
      const jittered = Math.max(0, Math.round(exponential * (0.8 + random() * 0.4)));
      await options.delay(jittered);
    }
  }
  throw lastError;
}
function chunks(values, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("Chunk size must be positive");
  }
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BoundedQueue,
  chunks,
  withRetry
});
//# sourceMappingURL=queue.js.map
