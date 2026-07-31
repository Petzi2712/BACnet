"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceSegment = deviceSegment;
exports.objectTypeSegment = objectTypeSegment;
exports.objectSegment = objectSegment;
exports.propertySegment = propertySegment;
exports.pointId = pointId;
exports.addressKey = addressKey;
exports.stableStringify = stableStringify;
const client_1 = require("@bacnet-js/client");
const objectNames = new Map();
const propertyNames = new Map();
for (const [key, value] of Object.entries(client_1.ObjectType)) {
    if (typeof value === "number") {
        objectNames.set(value, key.toLowerCase());
    }
}
for (const [key, value] of Object.entries(client_1.PropertyIdentifier)) {
    if (typeof value === "number") {
        propertyNames.set(value, key.toLowerCase());
    }
}
function deviceSegment(deviceInstance) {
    assertNonNegativeInteger(deviceInstance, "device instance");
    return `d_${deviceInstance}`;
}
function objectTypeSegment(objectType) {
    assertNonNegativeInteger(objectType, "object type");
    return objectNames.get(objectType) ?? `type_${objectType}`;
}
function objectSegment(objectInstance) {
    assertNonNegativeInteger(objectInstance, "object instance");
    return `o_${objectInstance}`;
}
function propertySegment(propertyId, arrayIndex) {
    assertNonNegativeInteger(propertyId, "property id");
    const base = propertyNames.get(propertyId) ?? `p_${propertyId}`;
    return arrayIndex == null || arrayIndex === 0xffffffff ? base : `${base}.a_${arrayIndex}`;
}
function pointId(deviceInstance, objectType, objectInstance, propertyId, arrayIndex) {
    return [
        "devices",
        deviceSegment(deviceInstance),
        "types",
        objectTypeSegment(objectType),
        objectSegment(objectInstance),
        propertySegment(propertyId, arrayIndex),
    ].join(".");
}
function addressKey(address) {
    return stableStringify(address);
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function assertNonNegativeInteger(value, label) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid ${label}: ${value}`);
    }
}
//# sourceMappingURL=ids.js.map