"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemTimer = void 0;
exports.systemTimer = {
    now: Date.now,
    schedule: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    cancel: timer => globalThis.clearTimeout(timer),
};
//# sourceMappingURL=domain.js.map