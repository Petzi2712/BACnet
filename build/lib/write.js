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
var write_exports = {};
__export(write_exports, {
  SafeWriter: () => SafeWriter
});
module.exports = __toCommonJS(write_exports);
var import_client = require("@bacnet-js/client");
const WRITABLE_TYPES = /* @__PURE__ */ new Set([
  import_client.ObjectType.ANALOG_OUTPUT,
  import_client.ObjectType.ANALOG_VALUE,
  import_client.ObjectType.BINARY_OUTPUT,
  import_client.ObjectType.BINARY_VALUE,
  import_client.ObjectType.MULTI_STATE_OUTPUT,
  import_client.ObjectType.MULTI_STATE_VALUE
]);
class SafeWriter {
  constructor(client, policy) {
    this.client = client;
    this.policy = policy;
  }
  async write(target, value, relinquish = false) {
    this.validateTarget(target);
    const encoded = relinquish ? [{ type: import_client.ApplicationTag.NULL, value: null }] : [encodeValue(target, value)];
    await this.client.writeProperty(
      target.address,
      { type: target.objectType, instance: target.objectInstance },
      target.propertyId,
      encoded,
      { priority: this.policy.priority }
    );
  }
  validateTarget(target) {
    if (!this.policy.enabled) {
      throw new Error("BACnet writing is globally disabled");
    }
    if (!this.policy.allowlist.has(target.stableId)) {
      throw new Error(`Point is not allowlisted: ${target.stableId}`);
    }
    if (!WRITABLE_TYPES.has(target.objectType)) {
      throw new Error(`Object type ${target.objectType} is not writable`);
    }
    if (target.propertyId !== import_client.PropertyIdentifier.PRESENT_VALUE) {
      throw new Error("Only Present_Value is writable");
    }
    if (!Number.isInteger(this.policy.priority) || this.policy.priority < 1 || this.policy.priority > 16) {
      throw new Error(`Invalid BACnet priority: ${this.policy.priority}`);
    }
  }
}
function encodeValue(target, value) {
  const numeric = target.commonType === "boolean" ? value === true ? 1 : value === false ? 0 : NaN : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${target.commonType} write value`);
  }
  if (target.min != null && numeric < target.min) {
    throw new Error(`Value is below minimum ${target.min}`);
  }
  if (target.max != null && numeric > target.max) {
    throw new Error(`Value is above maximum ${target.max}`);
  }
  const type = target.objectType === import_client.ObjectType.BINARY_OUTPUT || target.objectType === import_client.ObjectType.BINARY_VALUE ? import_client.ApplicationTag.ENUMERATED : import_client.ApplicationTag.REAL;
  return { type, value: numeric };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SafeWriter
});
//# sourceMappingURL=write.js.map
