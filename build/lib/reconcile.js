"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planReconciliation = planReconciliation;
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
        }
        else {
            current.push({ key: entry.key, staleScans });
            stale.push(entry.key);
        }
    }
    for (const key of seenKeys) {
        if (!existing.some(entry => entry.key === key)) {
            current.push({ key, staleScans: 0 });
        }
    }
    return { current, stale, remove };
}
//# sourceMappingURL=reconcile.js.map