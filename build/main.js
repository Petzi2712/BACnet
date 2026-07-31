"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/*
 * Created with @iobroker/create-adapter v3.1.5
 */
const node_path_1 = require("node:path");
const client_1 = require("@bacnet-js/client");
const utils = __importStar(require("@iobroker/adapter-core"));
const bacnet_port_1 = require("./lib/bacnet-port");
const cov_1 = require("./lib/cov");
const discovery_1 = require("./lib/discovery");
const ids_1 = require("./lib/ids");
const inventory_1 = require("./lib/inventory");
const mapper_1 = require("./lib/mapper");
const persistence_1 = require("./lib/persistence");
const queue_1 = require("./lib/queue");
const scheduler_1 = require("./lib/scheduler");
const selection_1 = require("./lib/selection");
const write_1 = require("./lib/write");
class BacnetClientAdapter extends utils.Adapter {
    port;
    discovery;
    inventoryReader;
    scheduler;
    cov;
    store;
    discovered = new Map();
    inventories = new Map();
    writeTargets = new Map();
    lastConfirmed = new Map();
    activeImport;
    unloading = false;
    timer = {
        now: Date.now,
        schedule: (callback, milliseconds) => this.setTimeout(callback, milliseconds),
        cancel: timer => this.clearTimeout(timer),
    };
    constructor(options = {}) {
        super({ ...options, name: "bacnet-client" });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    async onReady() {
        await Promise.all([
            this.setStateAsync("info.connection", false, true),
            this.setStateAsync("info.socketReady", false, true),
            this.setStateAsync("info.discoveryRunning", false, true),
            this.setStateAsync("info.discoveryProgress", 0, true),
            this.setStateAsync("info.lastError", "", true),
        ]);
        await this.setObjectNotExistsAsync("devices", {
            type: "folder",
            common: { name: "BACnet-Geräte" },
            native: {},
        });
        this.subscribeStates("devices.*");
        try {
            this.port = new bacnet_port_1.BacnetJsPort({
                interface: this.config.bindAddress || "0.0.0.0",
                port: clampInteger(this.config.port, 1, 65535, 47808),
                broadcastAddress: this.config.broadcastAddress || "255.255.255.255",
                apduTimeout: clampInteger(this.config.apduTimeoutMs, 250, 60000, 3000),
            }, error => {
                void this.recordError("bacnet", error);
            }, this.timer);
            this.discovery = new discovery_1.DiscoveryManager(this.port, this.timer);
            this.inventoryReader = new inventory_1.InventoryReader(this.port, {
                concurrency: clampInteger(this.config.perDeviceConcurrency, 1, 8, 2),
                retries: clampInteger(this.config.retries, 0, 10, 2),
                rpmBatchSize: 12,
                delay: milliseconds => new Promise(resolve => {
                    this.timer.schedule(resolve, milliseconds);
                }),
            });
            this.cov = new cov_1.CovManager(this.port, this.timer, (target, notification) => {
                const device = this.discovered.get(target.deviceInstance) ??
                    this.inventories.get(target.deviceInstance)?.device;
                if (!device) {
                    return;
                }
                for (const property of notification.payload.values) {
                    void this.upsertProperty(device, target.objectId, property.property.id, property.value, false);
                }
            }, (target, error) => {
                this.log.debug(`COV fallback to polling for device ${target.deviceInstance}, object ${target.objectId.type}:${target.objectId.instance}: ${errorText(error)}`);
            });
            this.store = new persistence_1.InventoryStore((0, node_path_1.join)(utils.getAbsoluteInstanceDataDir(this), "inventory-v1.json"));
            this.restoreInventories(await this.store.load());
            await this.port.waitUntilListening?.(clampInteger(this.config.apduTimeoutMs, 1000, 60000, 3000));
            await this.pruneUnselectedObjectTree();
            await Promise.all([
                this.setStateAsync("info.connection", true, true),
                this.setStateAsync("info.socketReady", true, true),
                this.setStateAsync("info.importedDevices", this.inventories.size, true),
                this.setStateAsync("info.importedObjects", [...this.inventories.values()].reduce((total, inventory) => total + inventory.objects.length, 0), true),
            ]);
            void this.reconcileRestoredInventories().catch(error => this.recordError("restore selections", error));
            if (this.config.pollingEnabled) {
                this.scheduler = new scheduler_1.NonOverlappingScheduler(() => this.pollImportedPoints(), clampInteger(this.config.pollIntervalMs, 1000, 86400000, 30000), error => this.recordError("poll", error), this.timer);
                this.scheduler.start();
            }
            this.log.info(`BACnet/IP socket configured on ${this.config.bindAddress || "0.0.0.0"}:${this.config.port || 47808}`);
        }
        catch (error) {
            await this.recordError("startup", error);
        }
    }
    onMessage(message) {
        try {
            this.handleMessage(message);
        }
        catch (error) {
            void this.recordError(`command ${message.command}`, error);
            this.respond(message, { ok: false, error: errorText(error) });
        }
    }
    handleMessage(message) {
        switch (message.command) {
            case "startDiscovery": {
                const job = this.startDiscovery();
                this.respond(message, { ok: true, job: job.progress });
                return;
            }
            case "cancelDiscovery":
                this.respond(message, { ok: true, cancelled: this.discovery?.cancel() ?? false });
                return;
            case "getDiscoveryStatus":
                this.respond(message, { ok: true, job: this.discovery?.status ?? null });
                return;
            case "listDevices":
                this.respond(message, { ok: true, devices: [...this.discovered.values()] });
                return;
            case "getDeviceCatalog":
                this.respond(message, { ok: true, devices: this.getDeviceCatalog() });
                return;
            case "importDevices": {
                const instances = parseDeviceInstances(message.message);
                const job = this.startImport(instances.length ? instances : [...this.discovered.keys()]);
                this.respond(message, { ok: true, job: job.progress });
                return;
            }
            case "cancelImport":
                if (this.activeImport) {
                    this.activeImport.cancelled = true;
                }
                this.respond(message, { ok: true, cancelled: Boolean(this.activeImport) });
                return;
            case "getImportStatus":
                this.respond(message, { ok: true, job: this.activeImport?.progress ?? null });
                return;
            case "getDiagnostics":
                this.respond(message, {
                    ok: true,
                    diagnostics: {
                        socketReady: Boolean(this.port),
                        bindAddress: this.config.bindAddress,
                        port: this.config.port,
                        discovery: this.discovery?.status ?? null,
                        import: this.activeImport?.progress ?? null,
                        discoveredDevices: this.discovered.size,
                        importedDevices: this.inventories.size,
                        importedObjects: [...this.inventories.values()].reduce((total, inventory) => total + inventory.objects.length, 0),
                    },
                });
                return;
            default:
                throw new Error(`Unsupported command: ${message.command}`);
        }
    }
    startDiscovery() {
        if (!this.discovery) {
            throw new Error("BACnet socket is not ready");
        }
        const targets = parseTargets(this.config.additionalTargets ?? [], this.config.port || 47808);
        const job = this.discovery.start({
            durationMs: clampInteger(this.config.discoveryTimeoutMs, 500, 120000, 5000),
            lowLimit: nullableInteger(this.config.lowLimit),
            highLimit: nullableInteger(this.config.highLimit),
            targets,
        });
        void this.setStateAsync("info.discoveryRunning", true, true);
        void job.done
            .then(async (devices) => {
            const enriched = await this.enrichDevices(devices);
            this.discovered = new Map(enriched.map(device => [device.deviceInstance, device]));
            await Promise.all([
                this.setStateAsync("info.discoveryRunning", false, true),
                this.setStateAsync("info.discoveryProgress", 100, true),
                this.setStateAsync("info.lastDiscovery", Date.now(), true),
                this.setStateAsync("info.discoveredDevices", enriched.length, true),
            ]);
            if (this.config.autoImportAll) {
                this.startImport(enriched.filter(device => !device.conflict).map(device => device.deviceInstance));
            }
        })
            .catch(error => this.recordError("discovery", error));
        return job;
    }
    async enrichDevices(devices) {
        if (!this.inventoryReader) {
            return devices;
        }
        const queue = new queue_1.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
        return queue.map(devices, async (device) => {
            if (device.conflict) {
                return device;
            }
            const objectId = { type: client_1.ObjectType.DEVICE, instance: device.deviceInstance };
            const fields = [
                ["objectName", client_1.PropertyIdentifier.OBJECT_NAME],
                ["vendorName", client_1.PropertyIdentifier.VENDOR_NAME],
                ["modelName", client_1.PropertyIdentifier.MODEL_NAME],
                ["firmwareRevision", client_1.PropertyIdentifier.FIRMWARE_REVISION],
                ["applicationSoftwareVersion", client_1.PropertyIdentifier.APPLICATION_SOFTWARE_VERSION],
                ["location", client_1.PropertyIdentifier.LOCATION],
                ["description", client_1.PropertyIdentifier.DESCRIPTION],
            ];
            await queue.map(fields, async ([key, propertyId]) => {
                try {
                    const values = await this.inventoryReader.readValue(device.address, objectId, propertyId);
                    const value = values[0]?.value;
                    if (value != null) {
                        device[key] = String(value);
                    }
                }
                catch {
                    // Optional device metadata does not invalidate discovery.
                }
            });
            return device;
        });
    }
    startImport(instances) {
        if (!this.inventoryReader || !this.store) {
            throw new Error("Inventory subsystem is not ready");
        }
        if (this.activeImport?.progress.status === "running") {
            return this.activeImport;
        }
        const progress = {
            jobId: `import-${Date.now()}`,
            kind: "import",
            status: "running",
            startedAt: Date.now(),
            processed: 0,
            total: instances.length,
            errors: [],
        };
        const active = { progress, cancelled: false };
        this.activeImport = active;
        void this.runImport(active, instances);
        return active;
    }
    async runImport(active, instances) {
        const queue = new queue_1.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
        try {
            await queue.map(instances, async (instance) => {
                if (active.cancelled) {
                    return;
                }
                const device = this.discovered.get(instance);
                if (!device) {
                    active.progress.errors.push(`Device ${instance}: not discovered`);
                    return;
                }
                try {
                    const inventory = await this.inventoryReader.importDevice(device);
                    this.inventories.set(instance, inventory);
                    await this.reconcileInventory(inventory, false);
                }
                catch (error) {
                    active.progress.errors.push(`Device ${instance}: ${errorText(error)}`);
                }
                finally {
                    active.progress.processed++;
                }
            });
            active.progress.status = active.cancelled ? "cancelled" : "completed";
            await this.pruneUnselectedObjectTree();
            await this.persistInventories();
            await Promise.all([
                this.setStateAsync("info.importedDevices", this.inventories.size, true),
                this.setStateAsync("info.importedObjects", [...this.inventories.values()].reduce((total, inventory) => total + inventory.objects.length, 0), true),
            ]);
        }
        catch (error) {
            active.progress.status = "failed";
            active.progress.errors.push(errorText(error));
            await this.recordError("import", error);
        }
        finally {
            active.progress.finishedAt = Date.now();
        }
    }
    async reconcileInventory(inventory, refreshMissingValues) {
        const selectedPoints = this.selectedPointIds();
        const selectedObjects = inventory.objects
            .map(object => ({
            object,
            properties: [...object.properties.entries()].filter(([propertyId]) => selectedPoints.has((0, ids_1.pointId)(inventory.device.deviceInstance, object.objectId.type, object.objectId.instance, propertyId))),
        }))
            .filter(entry => entry.properties.length > 0);
        if (selectedObjects.length === 0) {
            return;
        }
        const deviceBase = `devices.${(0, ids_1.deviceSegment)(inventory.device.deviceInstance)}`;
        const configuredDescription = (0, selection_1.selectionForDevice)(this.config.deviceSelections, inventory.device.deviceInstance)?.description;
        await this.extendObjectAsync(deviceBase, {
            type: "device",
            common: {
                name: inventory.device.objectName || `BACnet device ${inventory.device.deviceInstance}`,
                desc: configuredDescription ?? "",
            },
            native: {
                deviceInstance: inventory.device.deviceInstance,
                address: inventory.device.address,
                vendorId: inventory.device.vendorId,
                vendorName: inventory.device.vendorName,
                modelName: inventory.device.modelName,
                scanCompleteness: inventory.completeness,
            },
        });
        await this.extendObjectAsync(`${deviceBase}.info`, {
            type: "channel",
            common: { name: "Geräteinformationen" },
            native: {},
        });
        await this.extendObjectAsync(`${deviceBase}.types`, {
            type: "folder",
            common: { name: "BACnet-Objekttypen" },
            native: {},
        });
        for (const { object, properties } of selectedObjects) {
            const typeBase = `${deviceBase}.types.${(0, ids_1.objectTypeSegment)(object.objectId.type)}`;
            const objectBase = `${typeBase}.${(0, ids_1.objectSegment)(object.objectId.instance)}`;
            await this.extendObjectAsync(typeBase, {
                type: "channel",
                common: { name: (0, ids_1.objectTypeSegment)(object.objectId.type) },
                native: { objectType: object.objectId.type },
            });
            await this.extendObjectAsync(objectBase, {
                type: "channel",
                common: {
                    name: readString(object.properties.get(client_1.PropertyIdentifier.OBJECT_NAME)) ??
                        object.objectName ??
                        (0, ids_1.objectSegment)(object.objectId.instance),
                },
                native: {
                    deviceInstance: inventory.device.deviceInstance,
                    objectType: object.objectId.type,
                    objectInstance: object.objectId.instance,
                    partial: object.partial,
                },
            });
            for (const [propertyId, cachedValues] of properties) {
                let values = cachedValues;
                if (refreshMissingValues && values.length === 0) {
                    try {
                        values = await this.inventoryReader.readValue(inventory.device.address, object.objectId, propertyId);
                        object.properties.set(propertyId, values);
                    }
                    catch (error) {
                        this.log.debug(`Initial read failed for selected point ${(0, ids_1.pointId)(inventory.device.deviceInstance, object.objectId.type, object.objectId.instance, propertyId)}: ${errorText(error)}`);
                        continue;
                    }
                }
                if (values.length > 0) {
                    await this.upsertProperty(inventory.device, object.objectId, propertyId, values);
                }
            }
            if (this.config.covEnabled &&
                properties.some(([propertyId]) => propertyId === client_1.PropertyIdentifier.PRESENT_VALUE) &&
                isCovCandidate(object.objectId.type)) {
                await this.cov?.start({
                    subscriberId: subscriberId(inventory.device.deviceInstance, object.objectId),
                    deviceInstance: inventory.device.deviceInstance,
                    address: inventory.device.address,
                    objectId: object.objectId,
                }, 300);
            }
        }
    }
    async upsertProperty(device, objectId, propertyId, values, ensureObject = true) {
        const id = (0, ids_1.pointId)(device.deviceInstance, objectId.type, objectId.instance, propertyId);
        if (!this.selectedPointIds().has(id)) {
            return;
        }
        const mapped = (0, mapper_1.mapApplicationData)(values, objectId.type, propertyId);
        const writable = this.config.writeEnabled &&
            (this.config.writeAllowlist ?? []).includes(id) &&
            propertyId === client_1.PropertyIdentifier.PRESENT_VALUE &&
            isSupportedWritableType(objectId.type);
        const existingObject = ensureObject ? await this.getObjectAsync(id) : null;
        const existingCommon = existingObject?.type === "state" ? existingObject.common : undefined;
        const configuredDescription = (0, selection_1.selectionForDevice)(this.config.deviceSelections, device.deviceInstance)?.pointDescriptions[id]?.trim();
        const configuredUnit = (0, selection_1.selectionForDevice)(this.config.deviceSelections, device.deviceInstance)?.pointUnits[id]?.trim();
        const common = {
            name: configuredDescription || existingCommon?.name || (0, ids_1.propertySegment)(propertyId),
            type: mapped.commonType,
            role: existingCommon?.role || mapped.role,
            read: true,
            write: writable,
        };
        if (configuredDescription) {
            common.desc = configuredDescription;
        }
        else if (existingCommon?.desc) {
            common.desc = existingCommon.desc;
        }
        if (configuredUnit || existingCommon?.unit !== undefined || mapped.unit) {
            common.unit = configuredUnit || existingCommon?.unit || mapped.unit;
        }
        if (existingCommon?.states || mapped.states) {
            common.states = existingCommon?.states ?? mapped.states;
        }
        for (const property of ["min", "max", "step", "def"]) {
            if (existingCommon?.[property] !== undefined) {
                common[property] = existingCommon[property];
            }
        }
        if (ensureObject) {
            await this.extendObjectAsync(id, {
                type: "state",
                common,
                native: {
                    deviceInstance: device.deviceInstance,
                    address: device.address,
                    objectType: objectId.type,
                    objectInstance: objectId.instance,
                    propertyId,
                    arrayIndex: 0xffffffff,
                    applicationTag: mapped.applicationTag,
                    importSource: "bacnet",
                    rawFallback: mapped.rawFallback,
                },
            });
        }
        await this.setStateAsync(id, mapped.value, true);
        this.lastConfirmed.set(id, mapped.value);
        if (writable) {
            this.writeTargets.set(id, {
                stableId: id,
                address: device.address,
                objectType: objectId.type,
                objectInstance: objectId.instance,
                propertyId,
                commonType: mapped.commonType === "boolean" ? "boolean" : "number",
            });
        }
    }
    async pollImportedPoints() {
        if (!this.inventoryReader || this.unloading) {
            return;
        }
        const queue = new queue_1.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
        const tasks = [];
        const selectedPoints = this.selectedPointIds();
        for (const inventory of this.inventories.values()) {
            for (const object of inventory.objects) {
                if (object.properties.has(client_1.PropertyIdentifier.PRESENT_VALUE) &&
                    selectedPoints.has((0, ids_1.pointId)(inventory.device.deviceInstance, object.objectId.type, object.objectId.instance, client_1.PropertyIdentifier.PRESENT_VALUE))) {
                    tasks.push({
                        device: inventory.device,
                        objectId: object.objectId,
                        propertyId: client_1.PropertyIdentifier.PRESENT_VALUE,
                    });
                }
            }
        }
        await queue.map(tasks, async (task) => {
            try {
                const values = await this.inventoryReader.readValue(task.device.address, task.objectId, task.propertyId);
                await this.upsertProperty(task.device, task.objectId, task.propertyId, values, false);
            }
            catch (error) {
                this.log.debug(`Poll failed for device ${task.device.deviceInstance}, object ${task.objectId.type}:${task.objectId.instance}: ${errorText(error)}`);
            }
        });
    }
    onStateChange(id, state) {
        if (!state || state.ack || this.unloading) {
            return;
        }
        void this.handleWrite(id, state.val).catch(error => this.recordError(`write ${id}`, error));
    }
    async handleWrite(fullId, value) {
        if (!this.port || !this.inventoryReader) {
            throw new Error("BACnet socket is not ready");
        }
        const id = fullId.startsWith(`${this.namespace}.`) ? fullId.slice(this.namespace.length + 1) : fullId;
        const target = this.writeTargets.get(id);
        if (!target) {
            throw new Error(`Write target is not configured: ${id}`);
        }
        const previous = this.lastConfirmed.get(id);
        const writer = new write_1.SafeWriter(this.port, {
            enabled: this.config.writeEnabled,
            allowlist: new Set(this.config.writeAllowlist ?? []),
            priority: clampInteger(this.config.writePriority, 1, 16, 16),
        });
        try {
            const relinquish = value === null;
            await writer.write(target, value, relinquish);
            const readback = await this.inventoryReader.readValue(target.address, { type: target.objectType, instance: target.objectInstance }, target.propertyId);
            const mapped = (0, mapper_1.mapApplicationData)(readback, target.objectType, target.propertyId);
            await this.setStateAsync(id, mapped.value, true);
            this.lastConfirmed.set(id, mapped.value);
        }
        catch (error) {
            if (previous !== undefined) {
                await this.setStateAsync(id, previous, true);
            }
            throw error;
        }
    }
    selectedPointIds() {
        return (0, selection_1.selectedPointSet)(this.config.deviceSelections);
    }
    restoreInventories(file) {
        this.inventories.clear();
        for (const persisted of file.devices) {
            if (!Number.isInteger(persisted.deviceInstance) ||
                persisted.deviceInstance < 0 ||
                !persisted.address ||
                typeof persisted.address !== "object" ||
                !Array.isArray(persisted.objects)) {
                continue;
            }
            const device = {
                deviceInstance: persisted.deviceInstance,
                address: persisted.address,
                addressKey: (0, ids_1.addressKey)(persisted.address),
                maxApdu: persisted.maxApdu ?? 1476,
                segmentation: persisted.segmentation ?? 0,
                vendorId: persisted.vendorId ?? 0,
                lastSeen: persisted.lastSeen,
                conflict: false,
                conflictingAddresses: [],
                objectName: persisted.objectName,
                vendorName: persisted.vendorName,
                modelName: persisted.modelName,
                firmwareRevision: persisted.firmwareRevision,
                applicationSoftwareVersion: persisted.applicationSoftwareVersion,
                location: persisted.location,
                description: persisted.description,
            };
            this.inventories.set(persisted.deviceInstance, {
                schemaVersion: 1,
                device,
                objects: persisted.objects
                    .filter(object => Number.isInteger(object.objectType) &&
                    object.objectType >= 0 &&
                    Number.isInteger(object.objectInstance) &&
                    object.objectInstance >= 0 &&
                    Array.isArray(object.propertyIds))
                    .map(object => ({
                    objectId: { type: object.objectType, instance: object.objectInstance },
                    properties: new Map(object.propertyIds
                        .filter(propertyId => Number.isInteger(propertyId) && propertyId >= 0)
                        .map(propertyId => [propertyId, []])),
                    propertySource: object.partial ? "fallback" : "property-list",
                    partial: object.partial,
                    objectName: object.objectName,
                })),
                importedAt: file.updatedAt,
                completeness: persisted.objects.some(object => object.partial) ? "partial" : "complete",
                errors: [],
            });
        }
    }
    async reconcileRestoredInventories() {
        if (!this.inventoryReader || this.inventories.size === 0) {
            return;
        }
        const queue = new queue_1.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
        await queue.map([...this.inventories.values()], inventory => this.reconcileInventory(inventory, true).catch(error => {
            this.log.warn(`Could not restore selected points for device ${inventory.device.deviceInstance}: ${errorText(error)}`);
        }));
    }
    getDeviceCatalog() {
        const selectedPoints = this.selectedPointIds();
        const instances = new Set([...this.discovered.keys(), ...this.inventories.keys()]);
        return [...instances]
            .sort((a, b) => a - b)
            .map(deviceInstance => {
            const liveDevice = this.discovered.get(deviceInstance);
            const inventory = this.inventories.get(deviceInstance);
            const device = liveDevice ?? inventory?.device;
            if (!device) {
                return undefined;
            }
            const selection = (0, selection_1.selectionForDevice)(this.config.deviceSelections, deviceInstance);
            return {
                deviceInstance,
                active: Boolean(liveDevice && !liveDevice.conflict),
                imported: Boolean(inventory),
                conflict: device.conflict,
                address: device.address,
                lastSeen: device.lastSeen,
                objectName: device.objectName ?? `BACnet device ${deviceInstance}`,
                vendorName: device.vendorName ?? "",
                modelName: device.modelName ?? "",
                location: device.location ?? "",
                deviceDescription: device.description ?? "",
                userDescription: selection?.description ?? "",
                points: inventory?.objects
                    .flatMap(object => {
                    const objectName = readString(object.properties.get(client_1.PropertyIdentifier.OBJECT_NAME)) ??
                        object.objectName ??
                        (0, ids_1.objectSegment)(object.objectId.instance);
                    return [...object.properties.keys()].map(propertyId => {
                        const id = (0, ids_1.pointId)(deviceInstance, object.objectId.type, object.objectId.instance, propertyId);
                        return {
                            id,
                            deviceInstance,
                            objectType: object.objectId.type,
                            objectTypeName: (0, ids_1.objectTypeSegment)(object.objectId.type),
                            objectInstance: object.objectId.instance,
                            objectName,
                            propertyId,
                            propertyName: (0, ids_1.propertySegment)(propertyId),
                            selected: selectedPoints.has(id),
                            userDescription: selection?.pointDescriptions[id] ?? "",
                            userUnit: selection?.pointUnits[id] ?? "",
                        };
                    });
                })
                    .sort((a, b) => a.id.localeCompare(b.id)) ?? [],
            };
        })
            .filter((device) => Boolean(device));
    }
    async pruneUnselectedObjectTree() {
        const selectedPoints = this.selectedPointIds();
        const selectedObjects = (0, selection_1.selectedObjectSet)(selectedPoints);
        const startkey = `${this.namespace}.devices.`;
        const endkey = `${this.namespace}.devices.\u9999`;
        const params = { startkey, endkey, include_docs: true };
        const [states, channels, devices] = await Promise.all([
            this.getObjectViewAsync("system", "state", params),
            this.getObjectViewAsync("system", "channel", params),
            this.getObjectViewAsync("system", "device", params),
        ]);
        const entries = [
            ...states.rows.map(row => ({ id: row.id, state: true })),
            ...channels.rows.map(row => ({ id: row.id, state: false })),
            ...devices.rows.map(row => ({ id: row.id, state: false })),
        ].sort((a, b) => b.id.length - a.id.length);
        for (const entry of entries) {
            const relativeId = entry.id.startsWith(`${this.namespace}.`)
                ? entry.id.slice(this.namespace.length + 1)
                : entry.id;
            if (selectedObjects.has(relativeId)) {
                continue;
            }
            if (entry.state) {
                await this.delStateAsync(relativeId).catch(() => undefined);
            }
            await this.delObjectAsync(relativeId).catch(() => undefined);
        }
        for (const inventory of this.inventories.values()) {
            const typesFolder = `devices.${(0, ids_1.deviceSegment)(inventory.device.deviceInstance)}.types`;
            if (!selectedObjects.has(typesFolder)) {
                await this.delObjectAsync(typesFolder).catch(() => undefined);
            }
        }
    }
    async persistInventories() {
        if (!this.store) {
            return;
        }
        await this.store.save({
            schemaVersion: 1,
            updatedAt: Date.now(),
            devices: [...this.inventories.values()].map(inventory => ({
                deviceInstance: inventory.device.deviceInstance,
                address: inventory.device.address,
                lastSeen: inventory.device.lastSeen,
                staleScans: 0,
                maxApdu: inventory.device.maxApdu,
                segmentation: inventory.device.segmentation,
                vendorId: inventory.device.vendorId,
                objectName: inventory.device.objectName,
                vendorName: inventory.device.vendorName,
                modelName: inventory.device.modelName,
                firmwareRevision: inventory.device.firmwareRevision,
                applicationSoftwareVersion: inventory.device.applicationSoftwareVersion,
                location: inventory.device.location,
                description: inventory.device.description,
                objects: inventory.objects.map(object => ({
                    objectType: object.objectId.type,
                    objectInstance: object.objectId.instance,
                    propertyIds: [...object.properties.keys()],
                    partial: object.partial,
                    objectName: readString(object.properties.get(client_1.PropertyIdentifier.OBJECT_NAME)) ?? object.objectName,
                })),
            })),
        });
    }
    async recordError(scope, error) {
        const text = `${scope}: ${errorText(error)}`;
        this.log.error(text);
        await this.setStateAsync("info.lastError", text, true);
    }
    respond(message, payload) {
        if (message.callback) {
            this.sendTo(message.from, message.command, payload, message.callback);
        }
    }
    onUnload(callback) {
        let called = false;
        const done = () => {
            if (called) {
                return;
            }
            called = true;
            callback();
        };
        try {
            this.unloading = true;
            this.discovery?.cancel();
            if (this.activeImport) {
                this.activeImport.cancelled = true;
            }
            this.scheduler?.stop();
            const closePort = () => {
                this.port?.close();
                this.port = undefined;
            };
            void (this.cov?.stopAll() ?? Promise.resolve())
                .catch(error => this.log.debug(`COV cleanup failed: ${errorText(error)}`))
                .then(closePort)
                .then(() => Promise.all([
                this.setStateAsync("info.connection", false, true),
                this.setStateAsync("info.socketReady", false, true),
                this.setStateAsync("info.discoveryRunning", false, true),
            ]))
                .finally(done);
        }
        catch (error) {
            this.log.error(`Unload failed: ${errorText(error)}`);
            done();
        }
    }
}
function parseDeviceInstances(message) {
    const value = message && typeof message === "object" && "deviceInstances" in message
        ? message.deviceInstances
        : [];
    if (!Array.isArray(value)) {
        return [];
    }
    return [...new Set(value.filter((entry) => Number.isInteger(entry) && entry >= 0))];
}
function parseTargets(values, defaultPort) {
    return values
        .filter(value => typeof value === "string" && value.trim())
        .map(value => ({ address: value.includes(":") ? value.trim() : `${value.trim()}:${defaultPort}` }));
}
function nullableInteger(value) {
    return Number.isInteger(value) && value != null ? value : undefined;
}
function clampInteger(value, min, max, fallback) {
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
function readString(values) {
    const value = values?.[0]?.value;
    return value == null ? undefined : String(value);
}
function isSupportedWritableType(objectType) {
    return [
        client_1.ObjectType.ANALOG_OUTPUT,
        client_1.ObjectType.ANALOG_VALUE,
        client_1.ObjectType.BINARY_OUTPUT,
        client_1.ObjectType.BINARY_VALUE,
        client_1.ObjectType.MULTI_STATE_OUTPUT,
        client_1.ObjectType.MULTI_STATE_VALUE,
    ].includes(objectType);
}
function isCovCandidate(objectType) {
    return [
        client_1.ObjectType.ANALOG_INPUT,
        client_1.ObjectType.ANALOG_OUTPUT,
        client_1.ObjectType.ANALOG_VALUE,
        client_1.ObjectType.BINARY_INPUT,
        client_1.ObjectType.BINARY_OUTPUT,
        client_1.ObjectType.BINARY_VALUE,
        client_1.ObjectType.MULTI_STATE_INPUT,
        client_1.ObjectType.MULTI_STATE_OUTPUT,
        client_1.ObjectType.MULTI_STATE_VALUE,
    ].includes(objectType);
}
function subscriberId(deviceInstance, objectId) {
    return (deviceInstance * 4099 + objectId.type * 257 + objectId.instance) >>> 0 || 1;
}
if (require.main !== module) {
    module.exports = (options) => new BacnetClientAdapter(options);
}
else {
    (() => new BacnetClientAdapter())();
}
//# sourceMappingURL=main.js.map