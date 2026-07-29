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
var reconcile_exports = {};
__export(reconcile_exports, {
  planReconciliation: () => planReconciliation
});
module.exports = __toCommonJS(reconcile_exports);
function planReconciliation(existing, seenKeys, staleScansBeforeDelete, allowCleanup) {
  const current = [];
  const stale = [];
  const remove = [];
  const threshold = Math.max(1, staleScansBeforeDelete);
  for (const entry of existing) {
    if (seenKeys.has(entry.key)) {
      current.push({ key: entry.key, staleScans: 0 });
      continue;
    }
    const staleScans = entry.staleScans + 1;
    if (allowCleanup && staleScans >= threshold) {
      remove.push(entry.key);
    } else {
      current.push({ key: entry.key, staleScans });
      stale.push(entry.key);
    }
  }
  for (const key of seenKeys) {
    if (!existing.some((entry) => entry.key === key)) {
      current.push({ key, staleScans: 0 });
    }
  }
  return { current, stale, remove };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  planReconciliation
});
//# sourceMappingURL=reconcile.js.map
