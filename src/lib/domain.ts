import type {
	ApplicationData,
	BACNetAddress,
	BACNetObjectID,
	BACNetReadAccessSpecification,
	BACNetWritePropertyValues,
	BACnetMessageHeader,
	DecodeAcknowledgeMultipleResult,
	DecodeAcknowledgeSingleResult,
	CovNotifyPayload,
	ReadPropertyOptions,
	ServiceOptions,
	WritePropertyOptions,
	WhoIsOptions,
	IAMResult,
} from "@bacnet-js/client";

export interface IAmMessage {
	header?: BACnetMessageHeader;
	payload: IAMResult;
}

export interface CovNotification {
	payload: CovNotifyPayload;
}

export interface BacnetPort {
	on(event: "iAm", listener: (message: IAmMessage) => void): void;
	off(event: "iAm", listener: (message: IAmMessage) => void): void;
	onCov(listener: (message: CovNotification) => void): void;
	offCov(listener: (message: CovNotification) => void): void;
	waitUntilListening?(timeoutMs: number): Promise<void>;
	whoIs(receiver?: BACNetAddress, options?: WhoIsOptions): void;
	readProperty(
		receiver: BACNetAddress,
		objectId: BACNetObjectID,
		propertyId: number,
		options?: ReadPropertyOptions,
	): Promise<DecodeAcknowledgeSingleResult>;
	readPropertyMultiple(
		receiver: BACNetAddress,
		properties: BACNetReadAccessSpecification[],
		options?: ServiceOptions,
	): Promise<DecodeAcknowledgeMultipleResult>;
	writeProperty(
		receiver: BACNetAddress,
		objectId: BACNetObjectID,
		propertyId: number,
		values: BACNetWritePropertyValues,
		options: WritePropertyOptions,
	): Promise<void>;
	subscribeCov(
		receiver: BACNetAddress,
		objectId: BACNetObjectID,
		subscribeId: number,
		cancel: boolean,
		confirmed: boolean,
		lifetime: number,
		options?: ServiceOptions,
	): Promise<void>;
	close(): void;
}

export interface TimerApi {
	now(): number;
	schedule(callback: () => void, milliseconds: number): unknown;
	cancel(timer: unknown): void;
}

export const systemTimer: TimerApi = {
	now: Date.now,
	schedule: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
	cancel: timer => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
};

export interface DiscoveredDevice {
	deviceInstance: number;
	address: BACNetAddress;
	addressKey: string;
	maxApdu: number;
	segmentation: number;
	vendorId: number;
	lastSeen: number;
	conflict: boolean;
	conflictingAddresses: string[];
	objectName?: string;
	vendorName?: string;
	modelName?: string;
	firmwareRevision?: string;
	applicationSoftwareVersion?: string;
	location?: string;
	description?: string;
}

export interface BacnetObject {
	objectId: BACNetObjectID;
	properties: Map<number, ApplicationData[]>;
	propertySource: "property-list" | "fallback";
	partial: boolean;
}

export interface DeviceInventory {
	schemaVersion: 1;
	device: DiscoveredDevice;
	objects: BacnetObject[];
	importedAt: number;
	completeness: "complete" | "partial";
	errors: string[];
}

export interface PersistedObject {
	objectType: number;
	objectInstance: number;
	propertyIds: number[];
	partial: boolean;
}

export interface PersistedDevice {
	deviceInstance: number;
	address: BACNetAddress;
	lastSeen: number;
	staleScans: number;
	objects: PersistedObject[];
}

export interface InventoryFile {
	schemaVersion: 1;
	updatedAt: number;
	devices: PersistedDevice[];
}

export interface JobProgress {
	jobId: string;
	kind: "discovery" | "import";
	status: "running" | "completed" | "cancelled" | "failed";
	startedAt: number;
	finishedAt?: number;
	processed: number;
	total?: number;
	errors: string[];
}
