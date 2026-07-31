export interface DeviceSelection {
	deviceInstance: number;
	description: string;
	selectedPoints: string[];
}

export function normalizeDeviceSelections(value: unknown): DeviceSelection[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const result = new Map<number, DeviceSelection>();
	for (const entry of value) {
		if (!entry || typeof entry !== "object") {
			continue;
		}
		const candidate = entry as Partial<DeviceSelection>;
		if (!Number.isInteger(candidate.deviceInstance) || candidate.deviceInstance! < 0) {
			continue;
		}
		const selectedPoints = Array.isArray(candidate.selectedPoints)
			? [
					...new Set(
						candidate.selectedPoints.filter((point): point is string => {
							if (typeof point !== "string") {
								return false;
							}
							const match = /^devices\.d_(\d+)\.types\.[^.]+\.o_\d+\.[^.]+$/.exec(point);
							return Boolean(match && Number(match[1]) === candidate.deviceInstance);
						}),
					),
				].sort()
			: [];
		result.set(candidate.deviceInstance!, {
			deviceInstance: candidate.deviceInstance!,
			description: typeof candidate.description === "string" ? candidate.description.trim() : "",
			selectedPoints,
		});
	}
	return [...result.values()].sort((a, b) => a.deviceInstance - b.deviceInstance);
}

export function selectedPointSet(value: unknown): Set<string> {
	return new Set(normalizeDeviceSelections(value).flatMap(device => device.selectedPoints));
}

export function selectionForDevice(value: unknown, deviceInstance: number): DeviceSelection | undefined {
	return normalizeDeviceSelections(value).find(device => device.deviceInstance === deviceInstance);
}

export function selectedObjectSet(selectedPoints: ReadonlySet<string>): Set<string> {
	const result = new Set<string>(["devices"]);
	for (const point of selectedPoints) {
		const segments = point.split(".");
		for (let length = 1; length <= segments.length; length++) {
			result.add(segments.slice(0, length).join("."));
		}
		if (segments[0] === "devices" && /^d_\d+$/.test(segments[1] ?? "")) {
			result.add(`devices.${segments[1]}.info`);
		}
	}
	return result;
}

export function keepObjectForSelection(relativeId: string, selectedPoints: ReadonlySet<string>): boolean {
	return selectedObjectSet(selectedPoints).has(relativeId);
}
