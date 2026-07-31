declare global {
	namespace ioBroker {
		interface AdapterConfig {
			bindAddress: string;
			subnetCidr: string;
			broadcastAddress: string;
			port: number;
			discoveryTimeoutMs: number;
			lowLimit: number | null;
			highLimit: number | null;
			additionalTargets: string[];
			apduTimeoutMs: number;
			retries: number;
			requestConcurrency: number;
			perDeviceConcurrency: number;
			pollIntervalMs: number;
			pollingEnabled: boolean;
			covEnabled: boolean;
			writeEnabled: boolean;
			writePriority: number;
			writeAllowlist: string[];
			staleScansBeforeDelete: number;
			autoImportAll: boolean;
			deviceSelections: Array<{
				deviceInstance: number;
				description: string;
				selectedPoints: string[];
				pointDescriptions: Record<string, string>;
			}>;
		}
	}
}

export {};
