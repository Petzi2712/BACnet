import type { BACNetAddress } from "@bacnet-js/client";
import { addressKey } from "./ids";
import type { BacnetPort, DiscoveredDevice, IAmMessage, JobProgress, TimerApi } from "./domain";
export interface DiscoveryOptions {
	durationMs: number;
	lowLimit?: number;
	highLimit?: number;
	targets: BACNetAddress[];
}
export interface DiscoveryJob {
	progress: JobProgress;
	devices: Map<number, DiscoveredDevice>;
	done: Promise<DiscoveredDevice[]>;
	cancel(): void;
}
export class DiscoveryManager {
	private active?: DiscoveryJob;
	private generation = 0;
	public constructor(
		private readonly client: BacnetPort,
		private readonly timer: TimerApi,
	) {}
	public start(options: DiscoveryOptions): DiscoveryJob {
		if (this.active?.progress.status === "running") {
			return this.active;
		}
		const generation = ++this.generation;
		const devices = new Map<number, DiscoveredDevice>();
		const progress: JobProgress = {
			jobId: `discovery-${this.timer.now()}-${generation}`,
			kind: "discovery",
			status: "running",
			startedAt: this.timer.now(),
			processed: 0,
			errors: [],
		};
		let finish!: (value: DiscoveredDevice[]) => void;
		const done = new Promise<DiscoveredDevice[]>(resolve => (finish = resolve));
		const timeoutRef: { value?: unknown } = {};
		let finished = false;

		const listener = (message: IAmMessage): void => {
			if (finished || generation !== this.generation) {
				return;
			}
			const address = message.header?.sender ?? { address: message.payload.address };
			const key = addressKey(address);
			const existing = devices.get(message.payload.deviceId);
			if (!existing) {
				devices.set(message.payload.deviceId, {
					deviceInstance: message.payload.deviceId,
					address,
					addressKey: key,
					maxApdu: message.payload.maxApdu,
					segmentation: message.payload.segmentation,
					vendorId: message.payload.vendorId,
					lastSeen: this.timer.now(),
					conflict: false,
					conflictingAddresses: [],
				});
			} else if (existing.addressKey === key) {
				existing.lastSeen = this.timer.now();
				existing.maxApdu = message.payload.maxApdu;
				existing.segmentation = message.payload.segmentation;
				existing.vendorId = message.payload.vendorId;
			} else {
				existing.conflict = true;
				if (!existing.conflictingAddresses.includes(key)) {
					existing.conflictingAddresses.push(key);
				}
			}
			progress.processed = devices.size;
		};

		const complete = (status: "completed" | "cancelled"): void => {
			if (finished) {
				return;
			}
			finished = true;
			this.client.off("iAm", listener);
			if (timeoutRef.value) {
				this.timer.cancel(timeoutRef.value);
			}
			progress.status = status;
			progress.finishedAt = this.timer.now();
			finish([...devices.values()]);
		};
		timeoutRef.value = this.timer.schedule(() => complete("completed"), options.durationMs);

		const job: DiscoveryJob = {
			progress,
			devices,
			done,
			cancel: () => complete("cancelled"),
		};
		this.active = job;
		this.client.on("iAm", listener);
		const whoIsOptions = {
			...(options.lowLimit == null ? {} : { lowLimit: options.lowLimit }),
			...(options.highLimit == null ? {} : { highLimit: options.highLimit }),
		};
		if (options.targets.length === 0) {
			this.client.whoIs(undefined, whoIsOptions);
		}
		for (const target of options.targets) {
			this.client.whoIs(target, whoIsOptions);
		}
		return job;
	}
	public cancel(): boolean {
		if (!this.active || this.active.progress.status !== "running") {
			return false;
		}
		this.active.cancel();
		return true;
	}
	public get status(): JobProgress | undefined {
		return this.active?.progress;
	}
}
