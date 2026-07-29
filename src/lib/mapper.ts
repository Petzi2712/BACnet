import { ApplicationTag, BinaryPV, EngineeringUnits, ObjectType, PropertyIdentifier } from "@bacnet-js/client";
import type { ApplicationData } from "@bacnet-js/client";
export interface MappedValue {
	value: string | number | boolean;
	commonType: "string" | "number" | "boolean";
	role: string;
	unit?: string;
	states?: Record<string, string>;
	applicationTag: number;
	rawFallback: boolean;
}

const unitNames = new Map<number, string>();
for (const [key, value] of Object.entries(EngineeringUnits)) {
	if (typeof value === "number") {
		unitNames.set(value, key.toLowerCase().replaceAll("_", " "));
	}
}
export function mapApplicationData(
	values: readonly ApplicationData[],
	objectType: number,
	propertyId: number,
): MappedValue {
	if (values.length !== 1) {
		return jsonFallback(values, values[0]?.type ?? -1);
	}
	const entry = values[0];
	switch (entry.type) {
		case ApplicationTag.BOOLEAN:
			return mappedBoolean(Boolean(entry.value), entry.type);
		case ApplicationTag.REAL:
		case ApplicationTag.DOUBLE:
		case ApplicationTag.SIGNED_INTEGER:
		case ApplicationTag.UNSIGNED_INTEGER:
			return mappedNumber(Number(entry.value), entry.type, propertyId);
		case ApplicationTag.ENUMERATED:
			if (isBinaryObject(objectType) && propertyId === PropertyIdentifier.PRESENT_VALUE) {
				return {
					value: Number(entry.value) === BinaryPV.ACTIVE,
					commonType: "boolean",
					role: "value",
					states: { false: "Inactive", true: "Active" },
					applicationTag: entry.type,
					rawFallback: false,
				};
			}
			return mappedNumber(Number(entry.value), entry.type, propertyId);
		case ApplicationTag.CHARACTER_STRING:
			return {
				value: String(entry.value),
				commonType: "string",
				role: "text",
				applicationTag: entry.type,
				rawFallback: false,
			};
		case ApplicationTag.DATE:
		case ApplicationTag.TIME:
		case ApplicationTag.DATETIME: {
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

function mappedBoolean(value: boolean, tag: number): MappedValue {
	return { value, commonType: "boolean", role: "value", applicationTag: tag, rawFallback: false };
}

function mappedNumber(value: number, tag: number, propertyId: number): MappedValue {
	if (!Number.isFinite(value)) {
		return jsonFallback([{ type: tag, value } as ApplicationData], tag);
	}
	const unit = propertyId === PropertyIdentifier.UNITS && Number.isInteger(value) ? unitNames.get(value) : undefined;
	return {
		value,
		commonType: "number",
		role: propertyId === PropertyIdentifier.PRESENT_VALUE ? "value" : "value",
		unit,
		applicationTag: tag,
		rawFallback: false,
	};
}

function jsonFallback(value: unknown, tag: number): MappedValue {
	return {
		value: JSON.stringify(value, jsonReplacer),
		commonType: "string",
		role: "json",
		applicationTag: tag,
		rawFallback: true,
	};
}

function jsonReplacer(_key: string, value: unknown): unknown {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Buffer.isBuffer(value)) {
		return value.toString("base64");
	}
	return value;
}
export function isBinaryObject(objectType: number): boolean {
	return [ObjectType.BINARY_INPUT, ObjectType.BINARY_OUTPUT, ObjectType.BINARY_VALUE].includes(objectType);
}
