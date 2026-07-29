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
var ids_exports = {};
__export(ids_exports, {
  addressKey: () => addressKey,
  deviceSegment: () => deviceSegment,
  objectSegment: () => objectSegment,
  objectTypeSegment: () => objectTypeSegment,
  pointId: () => pointId,
  propertySegment: () => propertySegment,
  stableStringify: () => stableStringify
});
module.exports = __toCommonJS(ids_exports);
var import_client = require("@bacnet-js/client");
const objectNames = /* @__PURE__ */ new Map();
const propertyNames = /* @__PURE__ */ new Map();
for (const [key, value] of Object.entries(import_client.ObjectType)) {
  if (typeof value === "number") {
    objectNames.set(value, key.toLowerCase());
  }
}
for (const [key, value] of Object.entries(import_client.PropertyIdentifier)) {
  if (typeof value === "number") {
    propertyNames.set(value, key.toLowerCase());
  }
}
function deviceSegment(deviceInstance) {
  assertNonNegativeInteger(deviceInstance, "device instance");
  return `d_${deviceInstance}`;
}
function objectTypeSegment(objectType) {
  var _a;
  assertNonNegativeInteger(objectType, "object type");
  return (_a = objectNames.get(objectType)) != null ? _a : `type_${objectType}`;
}
function objectSegment(objectInstance) {
  assertNonNegativeInteger(objectInstance, "object instance");
  return `o_${objectInstance}`;
}
function propertySegment(propertyId, arrayIndex) {
  var _a;
  assertNonNegativeInteger(propertyId, "property id");
  const base = (_a = propertyNames.get(propertyId)) != null ? _a : `p_${propertyId}`;
  return arrayIndex == null || arrayIndex === 4294967295 ? base : `${base}.a_${arrayIndex}`;
}
function pointId(deviceInstance, objectType, objectInstance, propertyId, arrayIndex) {
  return [
    "devices",
    deviceSegment(deviceInstance),
    "types",
    objectTypeSegment(objectType),
    objectSegment(objectInstance),
    propertySegment(propertyId, arrayIndex)
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
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addressKey,
  deviceSegment,
  objectSegment,
  objectTypeSegment,
  pointId,
  propertySegment,
  stableStringify
});
//# sourceMappingURL=ids.js.map
