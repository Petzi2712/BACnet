"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeWriter = void 0;
const client_1 = require("@bacnet-js/client");
const WRITABLE_TYPES = new Set([
    client_1.ObjectType.ANALOG_OUTPUT,
    client_1.ObjectType.ANALOG_VALUE,
    client_1.ObjectType.BINARY_OUTPUT,
    client_1.ObjectType.BINARY_VALUE,
    client_1.ObjectType.MULTI_STATE_OUTPUT,
    client_1.ObjectType.MULTI_STATE_VALUE,
]);
class SafeWriter {
    client;
    policy;
    constructor(client, policy) {
        this.client = client;
        this.policy = policy;
    }
    async write(target, value, relinquish = false) {
        this.validateTarget(target);
        const encoded = relinquish ? [{ type: client_1.ApplicationTag.NULL, value: null }] : [encodeValue(target, value)];
        await this.client.writeProperty(target.address, { type: target.objectType, instance: target.objectInstance }, target.propertyId, encoded, { priority: this.policy.priority });
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
        if (target.propertyId !== client_1.PropertyIdentifier.PRESENT_VALUE) {
            throw new Error("Only Present_Value is writable");
        }
        if (!Number.isInteger(this.policy.priority) || this.policy.priority < 1 || this.policy.priority > 16) {
            throw new Error(`Invalid BACnet priority: ${this.policy.priority}`);
        }
    }
}
exports.SafeWriter = SafeWriter;
function encodeValue(target, value) {
    const numeric = target.commonType === "boolean" ? (value === true ? 1 : value === false ? 0 : NaN) : Number(value);
    if (!Number.isFinite(numeric)) {
        throw new Error(`Invalid ${target.commonType} write value`);
    }
    if (target.min != null && numeric < target.min) {
        throw new Error(`Value is below minimum ${target.min}`);
    }
    if (target.max != null && numeric > target.max) {
        throw new Error(`Value is above maximum ${target.max}`);
    }
    const type = target.objectType === client_1.ObjectType.BINARY_OUTPUT || target.objectType === client_1.ObjectType.BINARY_VALUE
        ? client_1.ApplicationTag.ENUMERATED
        : client_1.ApplicationTag.REAL;
    return { type, value: numeric };
}
//# sourceMappingURL=write.js.map