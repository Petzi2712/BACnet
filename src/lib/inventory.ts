import {
	ObjectType,
	PropertyIdentifier,
	type ApplicationData,
	type BACNetAddress,
	type BACNetObjectID,
} from "@bacnet-js/client";
import type { BacnetPort, BacnetObject, DeviceInventory, DiscoveredDevice } from "./domain";
import { BoundedQueue, chunks, withRetry } from "./queue";

const FALLBACK_PROPERTIES = [
	PropertyIdentifier.OBJECT_IDENTIFIER,
	PropertyIdentifier.OBJECT_NAME,
	PropertyIdentifier.OBJECT_TYPE,
	PropertyIdentifier.DESCRIPTION,
	PropertyIdentifier.PRESENT_VALUE,
	PropertyIdentifier.STATUS_FLAGS,
	PropertyIdentifier.RELIABILITY,
	PropertyIdentifier.OUT_OF_SERVICE,
	PropertyIdentifier.UNITS,
	PropertyIdentifier.ACTIVE_TEXT,
	PropertyIdentifier.INACTIVE_TEXT,
	PropertyIdentifier.STATE_TEXT,
	PropertyIdentifier.NUMBER_OF_STATES,
];
export interface InventoryOptions {
	concurrency: number;
	retries: number;
	rpmBatchSize: number;
	delay: (milliseconds: number) => Promise<void>;
}
export class InventoryReader {
	private readonly objectQueue: BoundedQueue;
	private readonly requestQueue: BoundedQueue;
	public constructor(
		private readonly client: BacnetPort,
		private readonly options: InventoryOptions,
	) {
		this.objectQueue = new BoundedQueue(options.concurrency);
		this.requestQueue = new BoundedQueue(options.concurrency);
	}
	public async importDevice(device: DiscoveredDevice): Promise<DeviceInventory> {
		if (device.conflict) {
			throw new Error(`Device ${device.deviceInstance} has duplicate instance addresses`);
		}
		const errors: string[] = [];
		const objectIds = await this.readObjectList(device);
		const objects = await this.objectQueue.map(objectIds, async objectId => {
			try {
				return await this.readObject(device.address, objectId);
			} catch (error) {
				errors.push(`${objectId.type}:${objectId.instance}: ${errorMessage(error)}`);
				return {
					objectId,
					properties: new Map<number, ApplicationData[]>(),
					propertySource: "fallback" as const,
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
	public async readObjectList(device: DiscoveredDevice): Promise<BACNetObjectID[]> {
		const deviceObject = { type: ObjectType.DEVICE, instance: device.deviceInstance };
		const countResult = await this.read(device.address, deviceObject, PropertyIdentifier.OBJECT_LIST, 0);
		const count = Number(countResult[0]?.value);
		if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000) {
			throw new Error(`Invalid Object_List count for device ${device.deviceInstance}: ${count}`);
		}
		const indexes = Array.from({ length: count }, (_, index) => index + 1);
		return this.requestQueue.map(indexes, async index => {
			const result = await this.read(device.address, deviceObject, PropertyIdentifier.OBJECT_LIST, index);
			const objectId = result[0]?.value as BACNetObjectID | undefined;
			if (!objectId || !Number.isInteger(objectId.type) || !Number.isInteger(objectId.instance)) {
				throw new Error(`Invalid Object_List entry ${index}`);
			}
			return objectId;
		});
	}
	public readValue(
		address: BACNetAddress,
		objectId: BACNetObjectID,
		propertyId: number,
		arrayIndex = 0xffffffff,
	): Promise<ApplicationData[]> {
		return this.read(address, objectId, propertyId, arrayIndex);
	}

	private async readObject(address: BACNetAddress, objectId: BACNetObjectID): Promise<BacnetObject> {
		let propertyIds: number[];
		let partial = false;
		try {
			propertyIds = await this.readPropertyList(address, objectId);
		} catch {
			propertyIds = FALLBACK_PROPERTIES;
			partial = true;
		}
		const uniqueIds = [...new Set(propertyIds)];
		const properties = new Map<number, ApplicationData[]>();
		for (const batch of chunks(uniqueIds, this.options.rpmBatchSize)) {
			try {
				const result = await this.client.readPropertyMultiple(address, [
					{ objectId, properties: batch.map(id => ({ id, index: 0xffffffff })) },
				]);
				for (const objectResult of result.values) {
					for (const property of objectResult.values) {
						properties.set(property.id, property.value);
					}
				}
			} catch {
				await this.requestQueue.map(batch, async propertyId => {
					try {
						properties.set(propertyId, await this.read(address, objectId, propertyId));
					} catch {
						partial = true;
					}
				});
			}
		}
		return { objectId, properties, propertySource: partial ? "fallback" : "property-list", partial };
	}

	private async readPropertyList(address: BACNetAddress, objectId: BACNetObjectID): Promise<number[]> {
		const countValues = await this.read(address, objectId, PropertyIdentifier.PROPERTY_LIST, 0);
		const count = Number(countValues[0]?.value);
		if (!Number.isSafeInteger(count) || count < 0 || count > 10000) {
			throw new Error("Invalid Property_List count");
		}
		const indexes = Array.from({ length: count }, (_, index) => index + 1);
		return this.requestQueue.map(indexes, async index => {
			const value = await this.read(address, objectId, PropertyIdentifier.PROPERTY_LIST, index);
			const propertyId = Number(value[0]?.value);
			if (!Number.isInteger(propertyId) || propertyId < 0) {
				throw new Error(`Invalid property id at index ${index}`);
			}
			return propertyId;
		});
	}

	private async read(
		address: BACNetAddress,
		objectId: BACNetObjectID,
		propertyId: number,
		arrayIndex = 0xffffffff,
	): Promise<ApplicationData[]> {
		return withRetry(
			async () => (await this.client.readProperty(address, objectId, propertyId, { arrayIndex })).values,
			{ retries: this.options.retries, baseDelayMs: 100, maxDelayMs: 2000, delay: this.options.delay },
		);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
