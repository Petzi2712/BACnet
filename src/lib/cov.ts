import type { BACNetAddress, BACNetObjectID } from "@bacnet-js/client";
import type { BacnetPort, CovNotification, TimerApi } from "./domain";
import { BoundedQueue } from "./queue";

export interface CovTarget {
	subscriberId: number;
	deviceInstance: number;
	address: BACNetAddress;
	objectId: BACNetObjectID;
}

interface ActiveCov {
	target: CovTarget;
	lifetimeSeconds: number;
	timer?: ReturnType<typeof setTimeout>;
}

export class CovManager {
	private readonly active = new Map<number, ActiveCov>();
	private stopped = false;
	private readonly listener = (message: CovNotification): void => {
		const subscription = this.active.get(message.payload.subscriberProcessId);
		if (subscription) {
			this.onNotification(subscription.target, message);
		}
	};

	public constructor(
		private readonly client: BacnetPort,
		private readonly timer: TimerApi,
		private readonly onNotification: (target: CovTarget, message: CovNotification) => void,
		private readonly onFallback: (target: CovTarget, error: unknown) => void,
	) {
		this.client.onCov(this.listener);
	}

	public async start(target: CovTarget, lifetimeSeconds: number): Promise<boolean> {
		if (this.stopped) {
			return false;
		}
		const subscription: ActiveCov = { target, lifetimeSeconds };
		this.active.set(target.subscriberId, subscription);
		try {
			await this.subscribe(subscription);
			return true;
		} catch (error) {
			this.active.delete(target.subscriberId);
			this.onFallback(target, error);
			return false;
		}
	}

	public async stopAll(): Promise<void> {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.client.offCov(this.listener);
		const subscriptions = [...this.active.values()];
		this.active.clear();
		await new BoundedQueue(4).map(subscriptions, async subscription => {
			if (subscription.timer) {
				this.timer.clearTimeout(subscription.timer);
			}
			try {
				await this.client.subscribeCov(
					subscription.target.address,
					subscription.target.objectId,
					subscription.target.subscriberId,
					true,
					false,
					0,
				);
			} catch {
				// Closing the socket is the final cleanup fallback.
			}
		});
	}

	private async subscribe(subscription: ActiveCov): Promise<void> {
		await this.client.subscribeCov(
			subscription.target.address,
			subscription.target.objectId,
			subscription.target.subscriberId,
			false,
			false,
			subscription.lifetimeSeconds,
		);
		subscription.timer = this.timer.setTimeout(
			() => {
				void this.renew(subscription);
			},
			Math.max(1000, subscription.lifetimeSeconds * 800),
		);
	}

	private async renew(subscription: ActiveCov): Promise<void> {
		if (this.stopped || !this.active.has(subscription.target.subscriberId)) {
			return;
		}
		try {
			await this.subscribe(subscription);
		} catch (error) {
			this.active.delete(subscription.target.subscriberId);
			this.onFallback(subscription.target, error);
		}
	}
}
