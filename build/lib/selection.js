"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDeviceSelections = normalizeDeviceSelections;
exports.selectedPointSet = selectedPointSet;
exports.selectionForDevice = selectionForDevice;
exports.selectedObjectSet = selectedObjectSet;
exports.keepObjectForSelection = keepObjectForSelection;
function normalizeDeviceSelections(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const result = new Map();
    for (const entry of value) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const candidate = entry;
        if (!Number.isInteger(candidate.deviceInstance) || candidate.deviceInstance < 0) {
            continue;
        }
        const selectedPoints = Array.isArray(candidate.selectedPoints)
            ? [
                ...new Set(candidate.selectedPoints.filter((point) => {
                    if (typeof point !== "string") {
                        return false;
                    }
                    const match = /^devices\.d_(\d+)\.types\.[^.]+\.o_\d+\.[^.]+$/.exec(point);
                    return Boolean(match && Number(match[1]) === candidate.deviceInstance);
                })),
            ].sort()
            : [];
        const pointDescriptions = {};
        if (candidate.pointDescriptions && typeof candidate.pointDescriptions === "object") {
            for (const [point, description] of Object.entries(candidate.pointDescriptions)) {
                if (selectedPoints.includes(point) && typeof description === "string" && description.trim()) {
                    pointDescriptions[point] = description.trim();
                }
            }
        }
        result.set(candidate.deviceInstance, {
            deviceInstance: candidate.deviceInstance,
            description: typeof candidate.description === "string" ? candidate.description.trim() : "",
            selectedPoints,
            pointDescriptions,
        });
    }
    return [...result.values()].sort((a, b) => a.deviceInstance - b.deviceInstance);
}
function selectedPointSet(value) {
    return new Set(normalizeDeviceSelections(value).flatMap(device => device.selectedPoints));
}
function selectionForDevice(value, deviceInstance) {
    return normalizeDeviceSelections(value).find(device => device.deviceInstance === deviceInstance);
}
function selectedObjectSet(selectedPoints) {
    const result = new Set(["devices"]);
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
function keepObjectForSelection(relativeId, selectedPoints) {
    return selectedObjectSet(selectedPoints).has(relativeId);
}
//# sourceMappingURL=selection.js.map