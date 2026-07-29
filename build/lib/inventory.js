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
var inventory_exports = {};
__export(inventory_exports, {
  InventoryReader: () => InventoryReader
});
module.exports = __toCommonJS(inventory_exports);
var import_client = require("@bacnet-js/client");
var import_queue = require("./queue");
const FALLBACK_PROPERTIES = [
  import_client.PropertyIdentifier.OBJECT_IDENTIFIER,
  import_client.PropertyIdentifier.OBJECT_NAME,
  import_client.PropertyIdentifier.OBJECT_TYPE,
  import_client.PropertyIdentifier.DESCRIPTION,
  import_client.PropertyIdentifier.PRESENT_VALUE,
  import_client.PropertyIdentifier.STATUS_FLAGS,
  import_client.PropertyIdentifier.RELIABILITY,
  import_client.PropertyIdentifier.OUT_OF_SERVICE,
  import_client.PropertyIdentifier.UNITS,
  import_client.PropertyIdentifier.ACTIVE_TEXT,
  import_client.PropertyIdentifier.INACTIVE_TEXT,
  import_client.PropertyIdentifier.STATE_TEXT,
  import_client.PropertyIdentifier.NUMBER_OF_STATES
];
class InventoryReader {
  constructor(client, options) {
    this.client = client;
    this.options = options;
    this.objectQueue = new import_queue.BoundedQueue(options.concurrency);
    this.requestQueue = new import_queue.BoundedQueue(options.concurrency);
  }
  objectQueue;
  requestQueue;
  async importDevice(device) {
    if (device.conflict) {
      throw new Error(`Device ${device.deviceInstance} has duplicate instance addresses`);
    }
    const errors = [];
    const objectIds = await this.readObjectList(device);
    const objects = await this.objectQueue.map(objectIds, async (objectId) => {
      try {
        return await this.readObject(device.address, objectId);
      } catch (error) {
        errors.push(`${objectId.type}:${objectId.instance}: ${errorMessage(error)}`);
        return {
          objectId,
          properties: /* @__PURE__ */ new Map(),
          propertySource: "fallback",
          partial: true
        };
      }
    });
    return {
      schemaVersion: 1,
      device,
      objects,
      importedAt: Date.now(),
      completeness: objects.some((object) => object.partial) ? "partial" : "complete",
      errors
    };
  }
  async readObjectList(device) {
    var _a;
    const deviceObject = { type: import_client.ObjectType.DEVICE, instance: device.deviceInstance };
    const countResult = await this.read(device.address, deviceObject, import_client.PropertyIdentifier.OBJECT_LIST, 0);
    const count = Number((_a = countResult[0]) == null ? void 0 : _a.value);
    if (!Number.isSafeInteger(count) || count < 0 || count > 1e6) {
      throw new Error(`Invalid Object_List count for device ${device.deviceInstance}: ${count}`);
    }
    const indexes = Array.from({ length: count }, (_, index) => index + 1);
    return this.requestQueue.map(indexes, async (index) => {
      var _a2;
      const result = await this.read(device.address, deviceObject, import_client.PropertyIdentifier.OBJECT_LIST, index);
      const objectId = (_a2 = result[0]) == null ? void 0 : _a2.value;
      if (!objectId || !Number.isInteger(objectId.type) || !Number.isInteger(objectId.instance)) {
        throw new Error(`Invalid Object_List entry ${index}`);
      }
      return objectId;
    });
  }
  readValue(address, objectId, propertyId, arrayIndex = 4294967295) {
    return this.read(address, objectId, propertyId, arrayIndex);
  }
  async readObject(address, objectId) {
    let propertyIds;
    let partial = false;
    try {
      propertyIds = await this.readPropertyList(address, objectId);
    } catch {
      propertyIds = FALLBACK_PROPERTIES;
      partial = true;
    }
    const uniqueIds = [...new Set(propertyIds)];
    const properties = /* @__PURE__ */ new Map();
    for (const batch of (0, import_queue.chunks)(uniqueIds, this.options.rpmBatchSize)) {
      try {
        const result = await this.client.readPropertyMultiple(address, [
          { objectId, properties: batch.map((id) => ({ id, index: 4294967295 })) }
        ]);
        for (const objectResult of result.values) {
          for (const property of objectResult.values) {
            properties.set(property.id, property.value);
          }
        }
      } catch {
        await this.requestQueue.map(batch, async (propertyId) => {
          try {
            properties.set(propertyId, await this.read(address, objectId, propertyId));
          } catch {
            partial = true;
          }
        });
      }
    }
    return { objectId, properties, propertySource: partial ? "fallback" : "property-list", partial };
  }
  async readPropertyList(address, objectId) {
    var _a;
    const countValues = await this.read(address, objectId, import_client.PropertyIdentifier.PROPERTY_LIST, 0);
    const count = Number((_a = countValues[0]) == null ? void 0 : _a.value);
    if (!Number.isSafeInteger(count) || count < 0 || count > 1e4) {
      throw new Error("Invalid Property_List count");
    }
    const indexes = Array.from({ length: count }, (_, index) => index + 1);
    return this.requestQueue.map(indexes, async (index) => {
      var _a2;
      const value = await this.read(address, objectId, import_client.PropertyIdentifier.PROPERTY_LIST, index);
      const propertyId = Number((_a2 = value[0]) == null ? void 0 : _a2.value);
      if (!Number.isInteger(propertyId) || propertyId < 0) {
        throw new Error(`Invalid property id at index ${index}`);
      }
      return propertyId;
    });
  }
  async read(address, objectId, propertyId, arrayIndex = 4294967295) {
    return (0, import_queue.withRetry)(
      async () => (await this.client.readProperty(address, objectId, propertyId, { arrayIndex })).values,
      { retries: this.options.retries, baseDelayMs: 100, maxDelayMs: 2e3 }
    );
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  InventoryReader
});
//# sourceMappingURL=inventory.js.map
