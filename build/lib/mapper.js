"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapApplicationData = mapApplicationData;
exports.isBinaryObject = isBinaryObject;
const client_1 = require("@bacnet-js/client");
const unitNames = new Map();
for (const [key, value] of Object.entries(client_1.EngineeringUnits)) {
    if (typeof value === "number") {
        unitNames.set(value, key.toLowerCase().replaceAll("_", " "));
    }
}
function mapApplicationData(values, objectType, propertyId) {
    if (values.length !== 1) {
        return jsonFallback(values, values[0]?.type ?? -1);
    }
    const entry = values[0];
    switch (entry.type) {
        case client_1.ApplicationTag.BOOLEAN:
            return mappedBoolean(Boolean(entry.value), entry.type);
        case client_1.ApplicationTag.REAL:
        case client_1.ApplicationTag.DOUBLE:
        case client_1.ApplicationTag.SIGNED_INTEGER:
        case client_1.ApplicationTag.UNSIGNED_INTEGER:
            return mappedNumber(Number(entry.value), entry.type, propertyId);
        case client_1.ApplicationTag.ENUMERATED:
            if (isBinaryObject(objectType) && propertyId === client_1.PropertyIdentifier.PRESENT_VALUE) {
                return {
                    value: Number(entry.value) === client_1.BinaryPV.ACTIVE,
                    commonType: "boolean",
                    role: "value",
                    states: { false: "Inactive", true: "Active" },
                    applicationTag: entry.type,
                    rawFallback: false,
                };
            }
            return mappedNumber(Number(entry.value), entry.type, propertyId);
        case client_1.ApplicationTag.CHARACTER_STRING:
            return {
                value: String(entry.value),
                commonType: "string",
                role: "text",
                applicationTag: entry.type,
                rawFallback: false,
            };
        case client_1.ApplicationTag.DATE:
        case client_1.ApplicationTag.TIME:
        case client_1.ApplicationTag.DATETIME: {
            const timestamp = entry.value instanceof Date ? entry.value.getTime() : NaN;
            if (Number.isFinite(timestamp)) {
                return {
                    value: timestamp,
                    commonType: "number",
                    role: "date",
                    applicationTag: entry.type,
                    rawFallback: false,
                };
            }
            return jsonFallback(values, entry.type);
        }
        default:
            return jsonFallback(values, entry.type);
    }
}
function mappedBoolean(value, tag) {
    return { value, commonType: "boolean", role: "value", applicationTag: tag, rawFallback: false };
}
function mappedNumber(value, tag, propertyId) {
    if (!Number.isFinite(value)) {
        return jsonFallback([{ type: tag, value }], tag);
    }
    const unit = propertyId === client_1.PropertyIdentifier.UNITS && Number.isInteger(value) ? unitNames.get(value) : undefined;
    return {
        value,
        commonType: "number",
        role: propertyId === client_1.PropertyIdentifier.PRESENT_VALUE ? "value" : "value",
        unit,
        applicationTag: tag,
        rawFallback: false,
    };
}
function jsonFallback(value, tag) {
    return {
        value: JSON.stringify(value, jsonReplacer),
        commonType: "string",
        role: "json",
        applicationTag: tag,
        rawFallback: true,
    };
}
function jsonReplacer(_key, value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return value.toString("base64");
    }
    return value;
}
function isBinaryObject(objectType) {
    return [client_1.ObjectType.BINARY_INPUT, client_1.ObjectType.BINARY_OUTPUT, client_1.ObjectType.BINARY_VALUE].includes(objectType);
}
//# sourceMappingURL=mapper.js.map