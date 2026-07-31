"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var selection_exports = {};
__export(selection_exports, {
  keepObjectForSelection: () => keepObjectForSelection,
  normalizeDeviceSelections: () => normalizeDeviceSelections,
  selectedObjectSet: () => selectedObjectSet,
  selectedPointSet: () => selectedPointSet,
  selectionForDevice: () => selectionForDevice
});
module.exports = __toCommonJS(selection_exports);
function normalizeDeviceSelections(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const result = /* @__PURE__ */ new Map();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry;
    if (!Number.isInteger(candidate.deviceInstance) || candidate.deviceInstance < 0) {
      continue;
    }
    const selectedPoints = Array.isArray(candidate.selectedPoints) ? [
      ...new Set(
        candidate.selectedPoints.filter((point) => {
          if (typeof point !== "string") {
            return false;
          }
          const match = /^devices\.d_(\d+)\.types\.[^.]+\.o_\d+\.[^.]+$/.exec(point);
          return Boolean(match && Number(match[1]) === candidate.deviceInstance);
        })
      )
    ].sort() : [];
    result.set(candidate.deviceInstance, {
      deviceInstance: candidate.deviceInstance,
      description: typeof candidate.description === "string" ? candidate.description.trim() : "",
      selectedPoints
    });
  }
  return [...result.values()].sort((a, b) => a.deviceInstance - b.deviceInstance);
}
function selectedPointSet(value) {
  return new Set(normalizeDeviceSelections(value).flatMap((device) => device.selectedPoints));
}
function selectionForDevice(value, deviceInstance) {
  return normalizeDeviceSelections(value).find((device) => device.deviceInstance === deviceInstance);
}
function selectedObjectSet(selectedPoints) {
  var _a;
  const result = /* @__PURE__ */ new Set(["devices"]);
  for (const point of selectedPoints) {
    const segments = point.split(".");
    for (let length = 1; length <= segments.length; length++) {
      result.add(segments.slice(0, length).join("."));
    }
    if (segments[0] === "devices" && /^d_\d+$/.test((_a = segments[1]) != null ? _a : "")) {
      result.add(`devices.${segments[1]}.info`);
    }
  }
  return result;
}
function keepObjectForSelection(relativeId, selectedPoints) {
  return selectedObjectSet(selectedPoints).has(relativeId);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  keepObjectForSelection,
  normalizeDeviceSelections,
  selectedObjectSet,
  selectedPointSet,
  selectionForDevice
});
//# sourceMappingURL=selection.js.map
