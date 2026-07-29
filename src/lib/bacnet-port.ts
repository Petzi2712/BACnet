import BACnetClient, {
	type BACNetAddress,
	type BACNetObjectID,
	type BACNetReadAccessSpecification,
	type BACNetWritePropertyValues,
	type ClientOptions,
	type DecodeAcknowledgeMultipleResult,
	type DecodeAcknowledgeSingleResult,
	type ReadPropertyOptions,
	type ServiceOptions,
	type WritePropertyOptions,
	type WhoIsOptions,
} from "@bacnet-js/client";
import { systemTimer, type BacnetPort, type CovNotification, type IAmMessage, type TimerApi } from "./domain";

export class BacnetJsPort implements BacnetPort {
	private readonly client: BACnetClient;
	private readonly listening: Promise<void>;
	private readonly covListeners = new Map<
		(message: CovNotification) => void,
		{ confirmed: (message: CovNotification) => void; unconfirmed: (message: CovNotification) => void }
	>();

	public constructor(
		options: ClientOptions,
		onError: (error: Error) => void = () => undefined,
		private readonly timer: TimerApi = systemTimer,
	) {
		this.client = new BACnetClient(options);
		this.client.on("error", onError);
		this.listening = new Promise<void>((resolve, reject) => {
			this.client.once("listening", resolve);
			this.client.once("error", reject);
		});
	}

	public on(event: "iAm", listener: (message: IAmMessage) => void): void {
		this.client.on(event, listener);
	}

	public off(event: "iAm", listener: (message: IAmMessage) => void): void {
		this.client.off(event, listener);
	}

	public onCov(listener: (message: CovNotification) => void): void {
		const wrappers = { confirmed: listener, unconfirmed: listener };
		this.covListeners.set(listener, wrappers);
		this.client.on("covNotify", wrappers.confirmed);
		this.client.on("covNotifyUnconfirmed", wrappers.unconfirmed);
	}

	public offCov(listener: (message: CovNotification) => void): void {
		const wrappers = this.covListeners.get(listener);
		if (!wrappers) {
			return;
		}
		this.client.off("covNotify", wrappers.confirmed);
		this.client.off("covNotifyUnconfirmed", wrappers.unconfirmed);
		this.covListeners.delete(listener);
	}

	public waitUntilListening(timeoutMs: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const timeout = this.timer.schedule(
				() => reject(new Error("BACnet UDP socket did not start listening in time")),
				timeoutMs,
			);
			this.listening.then(
				() => {
					this.timer.cancel(timeout);
					resolve();
				},
				error => {
					this.timer.cancel(timeout);
					reject(error instanceof Error ? error : new Error(String(error)));
				},
			);
		});
	}

	public whoIs(receiver?: BACNetAddress, options?: WhoIsOptions): void {
		this.client.whoIs(receiver, options);
	}

	public readProperty(
		receiver: BACNetAddress,
		objectId: BACNetObjectID,
		propertyId: number,
		options?: ReadPropertyOptions,
	): Promise<DecodeAcknowledgeSingleResult> {
		return this.client.readProperty(receiver, objectId, propertyId, options);
	}

	public readPropertyMultiple(
		receiver: BACNetAddress,
		properties: BACNetReadAccessSpecification[],
		options?: ServiceOptions,
	): Promise<DecodeAcknowledgeMultipleResult> {
		return this.client.readPropertyMultiple(receiver, properties, options);
	}

	public writeProperty(
		receiver: BACNetAddress,
		objectId: BACNetObjectID,
		propertyId: number,
		values: BACNetWritePropertyValues,
		options: WritePropertyOptions,
	): Promise<void> {
		return this.client.writeProperty(receiver, objectId, propertyId, values, options);
	}

	public subscribeCov(
		receiver: BACNetAddress,
		objectId: BACNetObjectID,
		subscribeId: number,
		cancel: boolean,
		confirmed: boolean,
		lifetime: number,
		options?: ServiceOptions,
	): Promise<void> {
		return this.client.subscribeCov(receiver, objectId, subscribeId, cancel, confirmed, lifetime, options);
	}

	public close(): void {
		for (const listener of this.covListeners.keys()) {
			this.offCov(listener);
		}
		this.client.close();
	}
}
