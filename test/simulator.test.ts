import { expect } from "chai";
import {
	ApplicationTag,
	ObjectType,
	PropertyIdentifier,
	type ApplicationData,
	type BACNetObjectID,
	type BACNetReadAccessSpecification,
} from "@bacnet-js/client";
import { DiscoveryManager } from "../src/lib/discovery";
import type { IAmMessage } from "../src/lib/domain";
import { systemTimer } from "../src/lib/domain";
import { pointId } from "../src/lib/ids";
import { InventoryReader } from "../src/lib/inventory";
import { SafeWriter } from "../src/lib/write";

describe("controlled BACnet device integration", () => {
	it("runs discovery, import, RPM, write, readback and unload", async () => {
		const simulator = new SimulatedBacnetPort();
		const discovery = new DiscoveryManager(simulator, systemTimer);
		const job = discovery.start({ durationMs: 20, targets: [] });
		const [device] = await job.done;
		expect(device.deviceInstance).to.equal(1001);

		const reader = new InventoryReader(simulator, {
			concurrency: 2,
			retries: 0,
			rpmBatchSize: 4,
		});
		const inventory = await reader.importDevice(device);
		expect(inventory.objects).to.have.length(2);
		expect(inventory.completeness).to.equal("complete");
		expect(simulator.rpmCalls).to.be.greaterThan(0);

		const stableId = pointId(1001, ObjectType.ANALOG_OUTPUT, 1, PropertyIdentifier.PRESENT_VALUE);
		const writer = new SafeWriter(simulator, {
			enabled: true,
			allowlist: new Set([stableId]),
			priority: 16,
		});
		await writer.write(
			{
				stableId,
				address: device.address,
				objectType: ObjectType.ANALOG_OUTPUT,
				objectInstance: 1,
				propertyId: PropertyIdentifier.PRESENT_VALUE,
				commonType: "number",
			},
			22.75,
		);
		const readback = await reader.readValue(
			device.address,
			{ type: ObjectType.ANALOG_OUTPUT, instance: 1 },
			PropertyIdentifier.PRESENT_VALUE,
		);
		expect(readback[0].value).to.equal(22.75);

		simulator.close();
		expect(simulator.closed).to.equal(true);
		expect(simulator.listeners.size).to.equal(0);
	});
});

class SimulatedBacnetPort {
	public readonly listeners = new Set<(message: IAmMessage) => void>();
	public readonly address = { address: "127.0.0.1:47809" };
	public closed = false;
	public rpmCalls = 0;
	private presentValue = 20.5;
	private readonly objects: BACNetObjectID[] = [
		{ type: ObjectType.DEVICE, instance: 1001 },
		{ type: ObjectType.ANALOG_OUTPUT, instance: 1 },
	];

	public on(_event: "iAm", listener: (message: IAmMessage) => void): void {
		this.listeners.add(listener);
	}

	public off(_event: "iAm", listener: (message: IAmMessage) => void): void {
		this.listeners.delete(listener);
	}

	public onCov(): void {}
	public offCov(): void {}

	public whoIs(): void {
		queueMicrotask(() => {
			const message: IAmMessage = {
				header: { apduType: 0, expectingReply: false, sender: this.address },
				payload: {
					address: this.address.address,
					deviceId: 1001,
					maxApdu: 1476,
					segmentation: 3,
					vendorId: 999,
				},
			};
			for (const listener of this.listeners) {
				listener(message);
			}
		});
	}

	public readProperty(
		_address: unknown,
		objectId: BACNetObjectID,
		propertyId: number,
		options: { arrayIndex?: number } = {},
	): Promise<{
		len: number;
		objectId: BACNetObjectID;
		property: { id: number; index: number };
		values: ApplicationData[];
	}> {
		const index = options.arrayIndex ?? 0xffffffff;
		let values: ApplicationData[];
		if (propertyId === PropertyIdentifier.OBJECT_LIST) {
			values =
				index === 0
					? [app(ApplicationTag.UNSIGNED_INTEGER, this.objects.length)]
					: [app(ApplicationTag.OBJECTIDENTIFIER, this.objects[index - 1])];
		} else if (propertyId === PropertyIdentifier.PROPERTY_LIST) {
			const properties = [
				PropertyIdentifier.OBJECT_IDENTIFIER,
				PropertyIdentifier.OBJECT_NAME,
				PropertyIdentifier.PRESENT_VALUE,
			];
			values =
				index === 0
					? [app(ApplicationTag.UNSIGNED_INTEGER, properties.length)]
					: [app(ApplicationTag.ENUMERATED, properties[index - 1])];
		} else {
			values = this.valueFor(objectId, propertyId);
		}
		return Promise.resolve({ len: 1, objectId, property: { id: propertyId, index }, values });
	}

	public readPropertyMultiple(
		_address: unknown,
		specifications: BACNetReadAccessSpecification[],
	): Promise<{
		len: number;
		values: Array<{
			objectId: BACNetObjectID;
			values: Array<{ id: number; index: number; value: ApplicationData[] }>;
		}>;
	}> {
		this.rpmCalls++;
		return Promise.resolve({
			len: 1,
			values: specifications.map(specification => ({
				objectId: specification.objectId,
				values: specification.properties.map(property => ({
					id: property.id,
					index: property.index,
					value: this.valueFor(specification.objectId, property.id),
				})),
			})),
		});
	}

	public writeProperty(
		_address: unknown,
		_objectId: BACNetObjectID,
		_propertyId: number,
		values: ApplicationData[],
	): Promise<void> {
		this.presentValue = Number(values[0].value);
		return Promise.resolve();
	}

	public subscribeCov(): Promise<void> {
		return Promise.resolve();
	}

	public close(): void {
		this.closed = true;
		this.listeners.clear();
	}

	private valueFor(objectId: BACNetObjectID, propertyId: number): ApplicationData[] {
		switch (propertyId) {
			case PropertyIdentifier.OBJECT_IDENTIFIER:
				return [app(ApplicationTag.OBJECTIDENTIFIER, objectId)];
			case PropertyIdentifier.OBJECT_NAME:
				return [
					app(
						ApplicationTag.CHARACTER_STRING,
						objectId.type === ObjectType.DEVICE ? "Simulator" : "Room setpoint",
					),
				];
			case PropertyIdentifier.PRESENT_VALUE:
				return [app(ApplicationTag.REAL, this.presentValue)];
			default:
				return [];
		}
	}
}

function app(type: ApplicationTag, value: ApplicationData["value"]): ApplicationData {
	return { type, value, len: 1 };
}
