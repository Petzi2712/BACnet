"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryStore = exports.EMPTY_INVENTORY = void 0;
exports.migrateInventory = migrateInventory;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
exports.EMPTY_INVENTORY = { schemaVersion: 1, updatedAt: 0, devices: [] };
class InventoryStore {
    filename;
    constructor(filename) {
        this.filename = filename;
    }
    async load() {
        try {
            const parsed = JSON.parse(await (0, promises_1.readFile)(this.filename, "utf8"));
            return migrateInventory(parsed);
        }
        catch {
            return structuredClone(exports.EMPTY_INVENTORY);
        }
    }
    async save(inventory) {
        await (0, promises_1.mkdir)((0, node_path_1.dirname)(this.filename), { recursive: true });
        const temporary = `${this.filename}.${process.pid}.tmp`;
        await (0, promises_1.writeFile)(temporary, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
        await (0, promises_1.rename)(temporary, this.filename);
    }
}
exports.InventoryStore = InventoryStore;
function migrateInventory(value) {
    if (!value || typeof value !== "object") {
        return structuredClone(exports.EMPTY_INVENTORY);
    }
    const candidate = value;
    if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.devices)) {
        return structuredClone(exports.EMPTY_INVENTORY);
    }
    return {
        schemaVersion: 1,
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
        devices: candidate.devices,
    };
}
//# sourceMappingURL=persistence.js.map