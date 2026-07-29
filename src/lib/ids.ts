import { ObjectType, PropertyIdentifier } from "@bacnet-js/client";

const objectNames = new Map<number, string>();
const propertyNames = new Map<number, string>();

for (const [key, value] of Object.entries(ObjectType)) {
	if (typeof value === "number") {
		objectNames.set(value, key.toLowerCase());
	}
}
for (const [key, value] of Object.entries(PropertyIdentifier)) {
	if (typeof value === "number") {
		propertyNames.set(value, key.toLowerCase());
	}
}
export function deviceSegment(deviceInstance: number): string {
	assertNonNegativeInteger(deviceInstance, "device instance");
	return `d_${deviceInstance}`;
}
export function objectTypeSegment(objectType: number): string {
	assertNonNegativeInteger(objectType, "object type");
	return objectNames.get(objectType) ?? `type_${objectType}`;
}
export function objectSegment(objectInstance: number): string {
	assertNonNegativeInteger(objectInstance, "object instance");
	return `o_${objectInstance}`;
}
export function propertySegment(propertyId: number, arrayIndex?: number): string {
	assertNonNegativeInteger(propertyId, "property id");
	const base = propertyNames.get(propertyId) ?? `p_${propertyId}`;
	return arrayIndex == null || arrayIndex === 0xffffffff ? base : `${base}.a_${arrayIndex}`;
}
export function pointId(
	deviceInstance: number,
	objectType: number,
	objectInstance: number,
	propertyId: number,
	arrayIndex?: number,
): string {
	return [
		"devices",
		deviceSegment(deviceInstance),
		"types",
		objectTypeSegment(objectType),
		objectSegment(objectInstance),
		propertySegment(propertyId, arrayIndex),
	].join(".");
}
export function addressKey(address: object): string {
	return stableStringify(address);
}
export function stableStringify(value: unknown): string {
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

function assertNonNegativeInteger(value: number, label: string): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`Invalid ${label}: ${value}`);
	}
}
