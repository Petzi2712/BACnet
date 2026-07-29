import { expect } from "chai";
import { ApplicationTag, ObjectType, PropertyIdentifier } from "@bacnet-js/client";
import type { BacnetPort, IAmMessage, TimerApi } from "./domain";
import { CovManager } from "./cov";
import { DiscoveryManager } from "./discovery";
import { deviceSegment, pointId } from "./ids";
import { InventoryReader } from "./inventory";
import { mapApplicationData } from "./mapper";
import { BoundedQueue, chunks, withRetry } from "./queue";
import { planReconciliation } from "./reconcile";
import { NonOverlappingScheduler } from "./scheduler";
import { SafeWriter } from "./write";

describe("stable BACnet identity", () => {
	it("uses instances rather than mutable names", () => {
		expect(deviceSegment(1234)).to.equal("d_1234");
		const before = pointId(1234, ObjectType.ANALOG_INPUT, 7, PropertyIdentifier.PRESENT_VALUE);
		const afterRename = pointId(1234, ObjectType.ANALOG_INPUT, 7, PropertyIdentifier.PRESENT_VALUE);
		expect(before).to.equal("devices.d_1234.types.analog_input.o_7.present_value");
		expect(afterRename).to.equal(before);
		expect(pointId(1235, ObjectType.ANALOG_INPUT, 7, PropertyIdentifier.PRESENT_VALUE)).not.to.equal(before);
	});

	it("preserves proprietary numeric identifiers", () => {
		expect(pointId(1, 128, 9, 512)).to.equal("devices.d_1.types.type_128.o_9.p_512");
	});
});

describe("bounded work and retry", () => {
	it("never exceeds configured concurrency for thousands of entries", async () => {
		const queue = new BoundedQueue(4);
		await queue.map(
			Array.from({ length: 2500 }, (_, index) => index),
			async value => {
				await Promise.resolve();
				return value;
			},
		);
		expect(queue.maxObserved).to.equal(4);
	});

	it("batches deterministically", () => {
		expect(chunks([1, 2, 3, 4, 5], 2)).to.deep.equal([[1, 2], [3, 4], [5]]);
	});

	it("stops retrying at the maximum", async () => {
		let attempts = 0;
		let delays = 0;
		try {
			await withRetry(
				() => {
					attempts++;
					return Promise.reject(new Error("timeout"));
				},
				{
					retries: 2,
					baseDelayMs: 1,
					maxDelayMs: 4,
					random: () => 0.5,
					delay: () => {
						delays++;
						return Promise.resolve();
					},
				},
			);
			expect.fail("retry should throw");
		} catch (error) {
			expect((error as Error).message).to.equal("timeout");
		}
		expect(attempts).to.equal(3);
		expect(delays).to.equal(2);
	});
});

describe("BACnet value mapping", () => {
	it("maps analog and binary present values", () => {
		expect(
			mapApplicationData(
				[{ type: ApplicationTag.REAL, value: 21.5, len: 4 }],
				ObjectType.ANALOG_INPUT,
				PropertyIdentifier.PRESENT_VALUE,
			),
		).to.include({ value: 21.5, commonType: "number", rawFallback: false });
		expect(
			mapApplicationData(
				[{ type: ApplicationTag.ENUMERATED, value: 1, len: 1 }],
				ObjectType.BINARY_VALUE,
				PropertyIdentifier.PRESENT_VALUE,
			),
		).to.include({ value: true, commonType: "boolean", rawFallback: false });
	});

	it("keeps complex and proprietary data through JSON fallback", () => {
		const mapped = mapApplicationData(
			[{ type: ApplicationTag.CONTEXT_SPECIFIC_DECODED, value: { proprietary: 42 }, len: 1 }],
			128,
			512,
		);
		expect(mapped.commonType).to.equal("string");
		expect(mapped.rawFallback).to.equal(true);
		expect(mapped.value).to.contain("proprietary");
	});
});

describe("controlled discovery", () => {
	it("deduplicates I-Am and exposes duplicate-instance conflicts", async () => {
		const fake = new FakeDiscoveryPort();
		const clock = new FakeTimer();
		const manager = new DiscoveryManager(fake as unknown as BacnetPort, clock);
		const job = manager.start({ durationMs: 1000, targets: [] });
		const same: IAmMessage = {
			header: {
				apduType: 0,
				expectingReply: false,
				sender: { address: "192.0.2.10:47808" },
			},
			payload: { address: "192.0.2.10:47808", deviceId: 7, maxApdu: 1476, segmentation: 3, vendorId: 5 },
		};
		fake.emit(same);
		clock.time++;
		fake.emit(same);
		fake.emit({
			...same,
			header: {
				apduType: 0,
				expectingReply: false,
				sender: { address: "192.0.2.11:47808", net: 42, adr: [1] },
			},
		});
		expect(job.devices.size).to.equal(1);
		expect(job.devices.get(7)?.conflict).to.equal(true);
		clock.fire();
		await job.done;
		expect(fake.listeners.size).to.equal(0);
	});

	it("returns the active generation and cleans listeners on cancel", async () => {
		const fake = new FakeDiscoveryPort();
		const clock = new FakeTimer();
		const manager = new DiscoveryManager(fake as unknown as BacnetPort, clock);
		const first = manager.start({ durationMs: 1000, targets: [] });
		expect(manager.start({ durationMs: 1000, targets: [] })).to.equal(first);
		first.cancel();
		await first.done;
		expect(first.progress.status).to.equal("cancelled");
		expect(fake.listeners.size).to.equal(0);
	});
});

describe("safe write policy", () => {
	it("rejects disabled and non-allowlisted writes", async () => {
		const target = {
			stableId: "devices.d_1.types.analog_output.o_2.present_value",
			address: { address: "192.0.2.1:47808" },
			objectType: ObjectType.ANALOG_OUTPUT,
			objectInstance: 2,
			propertyId: PropertyIdentifier.PRESENT_VALUE,
			commonType: "number" as const,
		};
		const port = { writeProperty: () => Promise.resolve() } as unknown as BacnetPort;
		let disabled = "";
		try {
			await new SafeWriter(port, { enabled: false, allowlist: new Set([target.stableId]), priority: 16 }).write(
				target,
				1,
			);
		} catch (error) {
			disabled = (error as Error).message;
		}
		expect(disabled).to.contain("disabled");
		let allowlist = "";
		try {
			await new SafeWriter(port, { enabled: true, allowlist: new Set(), priority: 16 }).write(target, 1);
		} catch (error) {
			allowlist = (error as Error).message;
		}
		expect(allowlist).to.contain("allowlisted");
	});

	it("encodes relinquish as BACnet NULL at the configured priority", async () => {
		let captured: unknown[] = [];
		let priority = 0;
		const port = {
			writeProperty: (
				_a: unknown,
				_o: unknown,
				_p: unknown,
				values: unknown[],
				options: { priority: number },
			) => {
				captured = values;
				priority = options.priority;
				return Promise.resolve();
			},
		} as unknown as BacnetPort;
		const target = {
			stableId: "point",
			address: { address: "192.0.2.1:47808" },
			objectType: ObjectType.ANALOG_OUTPUT,
			objectInstance: 2,
			propertyId: PropertyIdentifier.PRESENT_VALUE,
			commonType: "number" as const,
		};
		await new SafeWriter(port, { enabled: true, allowlist: new Set(["point"]), priority: 8 }).write(
			target,
			null,
			true,
		);
		expect(captured).to.deep.equal([{ type: ApplicationTag.NULL, value: null }]);
		expect(priority).to.equal(8);
	});
});

describe("poll scheduler", () => {
	it("does not overlap runs", async () => {
		let release!: () => void;
		const wait = new Promise<void>(resolve => (release = resolve));
		const scheduler = new NonOverlappingScheduler(
			() => wait,
			1000,
			() => undefined,
		);
		scheduler.start();
		const first = scheduler.runNow();
		expect(await scheduler.runNow()).to.equal(false);
		release();
		expect(await first).to.equal(true);
		scheduler.stop();
	});
});

describe("inventory reads and reconciliation", () => {
	it("reads Object_List by array index and validates every identity", async () => {
		const indexes: number[] = [];
		const port = {
			readProperty: (
				_address: unknown,
				_objectId: unknown,
				propertyId: number,
				options: { arrayIndex?: number },
			) => {
				expect(propertyId).to.equal(PropertyIdentifier.OBJECT_LIST);
				indexes.push(options.arrayIndex ?? -1);
				const value =
					options.arrayIndex === 0
						? 2
						: { type: options.arrayIndex === 1 ? ObjectType.ANALOG_INPUT : 128, instance: 7 };
				return Promise.resolve({
					len: 1,
					objectId: { type: ObjectType.DEVICE, instance: 10 },
					property: { id: PropertyIdentifier.OBJECT_LIST, index: options.arrayIndex ?? -1 },
					values: [
						{
							type:
								options.arrayIndex === 0
									? ApplicationTag.UNSIGNED_INTEGER
									: ApplicationTag.OBJECTIDENTIFIER,
							value,
							len: 1,
						},
					],
				});
			},
		} as unknown as BacnetPort;
		const reader = new InventoryReader(port, {
			concurrency: 2,
			retries: 0,
			rpmBatchSize: 4,
			delay: () => Promise.resolve(),
		});
		const objects = await reader.readObjectList({
			deviceInstance: 10,
			address: { address: "192.0.2.10:47808" },
			addressKey: "a",
			maxApdu: 1476,
			segmentation: 3,
			vendorId: 1,
			lastSeen: 1,
			conflict: false,
			conflictingAddresses: [],
		});
		expect(indexes).to.deep.equal([0, 1, 2]);
		expect(objects).to.deep.equal([
			{ type: ObjectType.ANALOG_INPUT, instance: 7 },
			{ type: 128, instance: 7 },
		]);
	});

	it("marks missing objects stale before explicit threshold cleanup", () => {
		const first = planReconciliation([{ key: "old", staleScans: 0 }], new Set(["new"]), 2, true);
		expect(first.stale).to.deep.equal(["old"]);
		expect(first.remove).to.deep.equal([]);
		const second = planReconciliation(first.current, new Set(["new"]), 2, true);
		expect(second.remove).to.deep.equal(["old"]);
		expect(second.current).to.deep.equal([{ key: "new", staleScans: 0 }]);
	});
});

describe("COV lifecycle", () => {
	it("renews subscriptions, forwards notifications, falls back and unsubscribes", async () => {
		const clock = new FakeTimer();
		let listener: ((message: { payload: { subscriberProcessId: number } }) => void) | undefined;
		const calls: Array<{ cancel: boolean; lifetime: number }> = [];
		let notifications = 0;
		const port = {
			onCov: (value: typeof listener) => {
				listener = value;
			},
			offCov: () => {
				listener = undefined;
			},
			subscribeCov: (
				_address: unknown,
				_objectId: unknown,
				_subscriberId: number,
				cancel: boolean,
				_confirmed: boolean,
				lifetime: number,
			) => {
				calls.push({ cancel, lifetime });
				return Promise.resolve();
			},
		} as unknown as BacnetPort;
		const manager = new CovManager(
			port,
			clock,
			() => {
				notifications++;
			},
			() => expect.fail("unexpected fallback"),
		);
		const target = {
			subscriberId: 17,
			deviceInstance: 10,
			address: { address: "192.0.2.10:47808" },
			objectId: { type: ObjectType.ANALOG_INPUT, instance: 7 },
		};
		expect(await manager.start(target, 60)).to.equal(true);
		listener?.({ payload: { subscriberProcessId: 17 } });
		expect(notifications).to.equal(1);
		clock.fire();
		await Promise.resolve();
		await Promise.resolve();
		expect(calls.filter(call => !call.cancel)).to.have.length(2);
		await manager.stopAll();
		expect(calls.at(-1)).to.deep.equal({ cancel: true, lifetime: 0 });
		expect(listener).to.equal(undefined);
	});
});

class FakeDiscoveryPort {
	public readonly listeners = new Set<(message: IAmMessage) => void>();
	public on(_event: string, listener: (message: IAmMessage) => void): void {
		this.listeners.add(listener);
	}
	public off(_event: string, listener: (message: IAmMessage) => void): void {
		this.listeners.delete(listener);
	}
	public whoIs(): void {}
	public emit(message: IAmMessage): void {
		for (const listener of this.listeners) {
			listener(message);
		}
	}
}

class FakeTimer implements TimerApi {
	public time = 100;
	private callback?: () => void;
	public now(): number {
		return this.time;
	}
	public schedule(callback: () => void): unknown {
		this.callback = callback;
		return 1;
	}
	public cancel(): void {
		this.callback = undefined;
	}
	public fire(): void {
		const callback = this.callback;
		this.callback = undefined;
		callback?.();
	}
}
