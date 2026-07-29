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
var persistence_exports = {};
__export(persistence_exports, {
  EMPTY_INVENTORY: () => EMPTY_INVENTORY,
  InventoryStore: () => InventoryStore,
  migrateInventory: () => migrateInventory
});
module.exports = __toCommonJS(persistence_exports);
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
const EMPTY_INVENTORY = { schemaVersion: 1, updatedAt: 0, devices: [] };
class InventoryStore {
  constructor(filename) {
    this.filename = filename;
  }
  async load() {
    try {
      const parsed = JSON.parse(await (0, import_promises.readFile)(this.filename, "utf8"));
      return migrateInventory(parsed);
    } catch {
      return structuredClone(EMPTY_INVENTORY);
    }
  }
  async save(inventory) {
    await (0, import_promises.mkdir)((0, import_node_path.dirname)(this.filename), { recursive: true });
    const temporary = `${this.filename}.${process.pid}.tmp`;
    await (0, import_promises.writeFile)(temporary, `${JSON.stringify(inventory, null, 2)}
`, "utf8");
    await (0, import_promises.rename)(temporary, this.filename);
  }
}
function migrateInventory(value) {
  if (!value || typeof value !== "object") {
    return structuredClone(EMPTY_INVENTORY);
  }
  const candidate = value;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.devices)) {
    return structuredClone(EMPTY_INVENTORY);
  }
  return {
    schemaVersion: 1,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
    devices: candidate.devices
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EMPTY_INVENTORY,
  InventoryStore,
  migrateInventory
});
//# sourceMappingURL=persistence.js.map
