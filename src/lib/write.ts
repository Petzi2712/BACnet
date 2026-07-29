import { ApplicationTag, ObjectType, PropertyIdentifier, type BACNetAddress } from "@bacnet-js/client";
import type { BacnetPort } from "./domain";

const WRITABLE_TYPES = new Set<number>([
	ObjectType.ANALOG_OUTPUT,
	ObjectType.ANALOG_VALUE,
	ObjectType.BINARY_OUTPUT,
	ObjectType.BINARY_VALUE,
	ObjectType.MULTI_STATE_OUTPUT,
	ObjectType.MULTI_STATE_VALUE,
]);
export interface WriteTarget {
	stableId: string;
	address: BACNetAddress;
	objectType: number;
	objectInstance: number;
	propertyId: number;
	commonType: "number" | "boolean";
	min?: number;
	max?: number;
}
export interface WritePolicy {
	enabled: boolean;
	allowlist: ReadonlySet<string>;
	priority: number;
}
export class SafeWriter {
	public constructor(
		private readonly client: BacnetPort,
		private readonly policy: WritePolicy,
	) {}
	public async write(target: WriteTarget, value: unknown, relinquish = false): Promise<void> {
		this.validateTarget(target);
		const encoded = relinquish ? [{ type: ApplicationTag.NULL, value: null }] : [encodeValue(target, value)];
		await this.client.writeProperty(
			target.address,
			{ type: target.objectType, instance: target.objectInstance },
			target.propertyId,
			encoded,
			{ priority: this.policy.priority },
		);
	}

	private validateTarget(target: WriteTarget): void {
		if (!this.policy.enabled) {
			throw new Error("BACnet writing is globally disabled");
		}
		if (!this.policy.allowlist.has(target.stableId)) {
			throw new Error(`Point is not allowlisted: ${target.stableId}`);
		}
		if (!WRITABLE_TYPES.has(target.objectType)) {
			throw new Error(`Object type ${target.objectType} is not writable`);
		}
		if (target.propertyId !== PropertyIdentifier.PRESENT_VALUE) {
			throw new Error("Only Present_Value is writable");
		}
		if (!Number.isInteger(this.policy.priority) || this.policy.priority < 1 || this.policy.priority > 16) {
			throw new Error(`Invalid BACnet priority: ${this.policy.priority}`);
		}
	}
}

function encodeValue(target: WriteTarget, value: unknown): { type: ApplicationTag; value: number } {
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
	const type =
		target.objectType === ObjectType.BINARY_OUTPUT || target.objectType === ObjectType.BINARY_VALUE
			? ApplicationTag.ENUMERATED
			: ApplicationTag.REAL;
	return { type, value: numeric };
}
