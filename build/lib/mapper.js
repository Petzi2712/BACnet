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
var mapper_exports = {};
__export(mapper_exports, {
  isBinaryObject: () => isBinaryObject,
  mapApplicationData: () => mapApplicationData
});
module.exports = __toCommonJS(mapper_exports);
var import_client = require("@bacnet-js/client");
const unitNames = /* @__PURE__ */ new Map();
for (const [key, value] of Object.entries(import_client.EngineeringUnits)) {
  if (typeof value === "number") {
    unitNames.set(value, key.toLowerCase().replaceAll("_", " "));
  }
}
function mapApplicationData(values, objectType, propertyId) {
  var _a, _b;
  if (values.length !== 1) {
    return jsonFallback(values, (_b = (_a = values[0]) == null ? void 0 : _a.type) != null ? _b : -1);
  }
  const entry = values[0];
  switch (entry.type) {
    case import_client.ApplicationTag.BOOLEAN:
      return mappedBoolean(Boolean(entry.value), entry.type);
    case import_client.ApplicationTag.REAL:
    case import_client.ApplicationTag.DOUBLE:
    case import_client.ApplicationTag.SIGNED_INTEGER:
    case import_client.ApplicationTag.UNSIGNED_INTEGER:
      return mappedNumber(Number(entry.value), entry.type, propertyId);
    case import_client.ApplicationTag.ENUMERATED:
      if (isBinaryObject(objectType) && propertyId === import_client.PropertyIdentifier.PRESENT_VALUE) {
        return {
          value: Number(entry.value) === import_client.BinaryPV.ACTIVE,
          commonType: "boolean",
          role: "value",
          states: { false: "Inactive", true: "Active" },
          applicationTag: entry.type,
          rawFallback: false
        };
      }
      return mappedNumber(Number(entry.value), entry.type, propertyId);
    case import_client.ApplicationTag.CHARACTER_STRING:
      return {
        value: String(entry.value),
        commonType: "string",
        role: "text",
        applicationTag: entry.type,
        rawFallback: false
      };
    case import_client.ApplicationTag.DATE:
    case import_client.ApplicationTag.TIME:
    case import_client.ApplicationTag.DATETIME: {
      const timestamp = entry.value instanceof Date ? entry.value.getTime() : NaN;
      if (Number.isFinite(timestamp)) {
        return {
          value: timestamp,
          commonType: "number",
          role: "date",
          applicationTag: entry.type,
          rawFallback: false
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
  const unit = propertyId === import_client.PropertyIdentifier.UNITS && Number.isInteger(value) ? unitNames.get(value) : void 0;
  return {
    value,
    commonType: "number",
    role: propertyId === import_client.PropertyIdentifier.PRESENT_VALUE ? "value" : "value",
    unit,
    applicationTag: tag,
    rawFallback: false
  };
}
function jsonFallback(value, tag) {
  return {
    value: JSON.stringify(value, jsonReplacer),
    commonType: "string",
    role: "json",
    applicationTag: tag,
    rawFallback: true
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
  return [import_client.ObjectType.BINARY_INPUT, import_client.ObjectType.BINARY_OUTPUT, import_client.ObjectType.BINARY_VALUE].includes(objectType);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isBinaryObject,
  mapApplicationData
});
//# sourceMappingURL=mapper.js.map
