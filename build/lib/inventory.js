"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryReader = void 0;
const client_1 = require("@bacnet-js/client");
const queue_1 = require("./queue");
const FALLBACK_PROPERTIES = [
    client_1.PropertyIdentifier.OBJECT_IDENTIFIER,
    client_1.PropertyIdentifier.OBJECT_NAME,
    client_1.PropertyIdentifier.OBJECT_TYPE,
    client_1.PropertyIdentifier.DESCRIPTION,
    client_1.PropertyIdentifier.PRESENT_VALUE,
    client_1.PropertyIdentifier.STATUS_FLAGS,
    client_1.PropertyIdentifier.RELIABILITY,
    client_1.PropertyIdentifier.OUT_OF_SERVICE,
    client_1.PropertyIdentifier.UNITS,
    client_1.PropertyIdentifier.ACTIVE_TEXT,
    client_1.PropertyIdentifier.INACTIVE_TEXT,
    client_1.PropertyIdentifier.STATE_TEXT,
    client_1.PropertyIdentifier.NUMBER_OF_STATES,
];
class InventoryReader {
    client;
    options;
    objectQueue;
    requestQueue;
    constructor(client, options) {
        this.client = client;
        this.options = options;
        this.objectQueue = new queue_1.BoundedQueue(options.concurrency);
        this.requestQueue = new queue_1.BoundedQueue(options.concurrency);
    }
    async importDevice(device) {
        if (device.conflict) {
            throw new Error(`Device ${device.deviceInstance} has duplicate instance addresses`);
        }
        const errors = [];
        const objectIds = await this.readObjectList(device);
        const objects = await this.objectQueue.map(objectIds, async (objectId) => {
            try {
                return await this.readObject(device.address, objectId);
            }
            catch (error) {
                errors.push(`${objectId.type}:${objectId.instance}: ${errorMessage(error)}`);
                return {
                    objectId,
                    properties: new Map(),
                    propertySource: "fallback",
                    partial: true,
                };
            }
        });
        return {
            schemaVersion: 1,
            device,
            objects,
            importedAt: Date.now(),
            completeness: objects.some(object => object.partial) ? "partial" : "complete",
            errors,
        };
    }
    async readObjectList(device) {
        const deviceObject = { type: client_1.ObjectType.DEVICE, instance: device.deviceInstance };
        const countResult = await this.read(device.address, deviceObject, client_1.PropertyIdentifier.OBJECT_LIST, 0);
        const count = Number(countResult[0]?.value);
        if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) {
            throw new Error(`Invalid Object_List count for device ${device.deviceInstance}: ${count}`);
        }
        const indexes = Array.from({ length: count }, (_, index) => index + 1);
        return this.requestQueue.map(indexes, async (index) => {
            const result = await this.read(device.address, deviceObject, client_1.PropertyIdentifier.OBJECT_LIST, index);
            const objectId = result[0]?.value;
            if (!objectId || !Number.isInteger(objectId.type) || !Number.isInteger(objectId.instance)) {
                throw new Error(`Invalid Object_List entry ${index}`);
            }
            return objectId;
        });
    }
    readValue(address, objectId, propertyId, arrayIndex = 0xffffffff) {
        return this.read(address, objectId, propertyId, arrayIndex);
    }
    async readObject(address, objectId) {
        let propertyIds;
        let partial = false;
        try {
            propertyIds = await this.readPropertyList(address, objectId);
        }
        catch {
            propertyIds = FALLBACK_PROPERTIES;
            partial = true;
        }
        const uniqueIds = [...new Set(propertyIds)];
        const properties = new Map();
        for (const batch of (0, queue_1.chunks)(uniqueIds, this.options.rpmBatchSize)) {
            try {
                const result = await this.client.readPropertyMultiple(address, [
                    { objectId, properties: batch.map(id => ({ id, index: 0xffffffff })) },
                ]);
                for (const objectResult of result.values) {
                    for (const property of objectResult.values) {
                        properties.set(property.id, property.value);
                    }
                }
            }
            catch {
                await this.requestQueue.map(batch, async (propertyId) => {
                    try {
                        properties.set(propertyId, await this.read(address, objectId, propertyId));
                    }
                    catch {
                        partial = true;
                    }
                });
            }
        }
        return { objectId, properties, propertySource: partial ? "fallback" : "property-list", partial };
    }
    async readPropertyList(address, objectId) {
        const countValues = await this.read(address, objectId, client_1.PropertyIdentifier.PROPERTY_LIST, 0);
        const count = Number(countValues[0]?.value);
        if (!Number.isSafeInteger(count) || count < 0 || count > 10000) {
            throw new Error("Invalid Property_List count");
        }
        const indexes = Array.from({ length: count }, (_, index) => index + 1);
        return this.requestQueue.map(indexes, async (index) => {
            const value = await this.read(address, objectId, client_1.PropertyIdentifier.PROPERTY_LIST, index);
            const propertyId = Number(value[0]?.value);
            if (!Number.isInteger(propertyId) || propertyId < 0) {
                throw new Error(`Invalid property id at index ${index}`);
            }
            return propertyId;
        });
    }
    async read(address, objectId, propertyId, arrayIndex = 0xffffffff) {
        return (0, queue_1.withRetry)(async () => (await this.client.readProperty(address, objectId, propertyId, { arrayIndex })).values, { retries: this.options.retries, baseDelayMs: 100, maxDelayMs: 2000, delay: this.options.delay });
    }
}
exports.InventoryReader = InventoryReader;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=inventory.js.map