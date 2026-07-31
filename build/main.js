"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_node_path = require("node:path");
var import_client = require("@bacnet-js/client");
var utils = __toESM(require("@iobroker/adapter-core"));
var import_bacnet_port = require("./lib/bacnet-port");
var import_cov = require("./lib/cov");
var import_discovery = require("./lib/discovery");
var import_ids = require("./lib/ids");
var import_inventory = require("./lib/inventory");
var import_mapper = require("./lib/mapper");
var import_persistence = require("./lib/persistence");
var import_queue = require("./lib/queue");
var import_scheduler = require("./lib/scheduler");
var import_selection = require("./lib/selection");
var import_write = require("./lib/write");
class BacnetClientAdapter extends utils.Adapter {
  port;
  discovery;
  inventoryReader;
  scheduler;
  cov;
  store;
  discovered = /* @__PURE__ */ new Map();
  inventories = /* @__PURE__ */ new Map();
  writeTargets = /* @__PURE__ */ new Map();
  lastConfirmed = /* @__PURE__ */ new Map();
  activeImport;
  unloading = false;
  timer = {
    now: Date.now,
    schedule: (callback, milliseconds) => this.setTimeout(callback, milliseconds),
    cancel: (timer) => this.clearTimeout(timer)
  };
  constructor(options = {}) {
    super({ ...options, name: "bacnet-client" });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    var _a, _b;
    await Promise.all([
      this.setStateAsync("info.connection", false, true),
      this.setStateAsync("info.socketReady", false, true),
      this.setStateAsync("info.discoveryRunning", false, true),
      this.setStateAsync("info.discoveryProgress", 0, true),
      this.setStateAsync("info.lastError", "", true)
    ]);
    await this.setObjectNotExistsAsync("devices", {
      type: "folder",
      common: { name: "BACnet devices" },
      native: {}
    });
    this.subscribeStates("devices.*");
    try {
      this.port = new import_bacnet_port.BacnetJsPort(
        {
          interface: this.config.bindAddress || "0.0.0.0",
          port: clampInteger(this.config.port, 1, 65535, 47808),
          broadcastAddress: this.config.broadcastAddress || "255.255.255.255",
          apduTimeout: clampInteger(this.config.apduTimeoutMs, 250, 6e4, 3e3)
        },
        (error) => {
          void this.recordError("bacnet", error);
        },
        this.timer
      );
      this.discovery = new import_discovery.DiscoveryManager(this.port, this.timer);
      this.inventoryReader = new import_inventory.InventoryReader(this.port, {
        concurrency: clampInteger(this.config.perDeviceConcurrency, 1, 8, 2),
        retries: clampInteger(this.config.retries, 0, 10, 2),
        rpmBatchSize: 12,
        delay: (milliseconds) => new Promise((resolve) => {
          this.timer.schedule(resolve, milliseconds);
        })
      });
      this.cov = new import_cov.CovManager(
        this.port,
        this.timer,
        (target, notification) => {
          var _a2, _b2;
          const device = (_b2 = this.discovered.get(target.deviceInstance)) != null ? _b2 : (_a2 = this.inventories.get(target.deviceInstance)) == null ? void 0 : _a2.device;
          if (!device) {
            return;
          }
          for (const property of notification.payload.values) {
            void this.upsertProperty(
              device,
              target.objectId,
              property.property.id,
              property.value,
              false
            );
          }
        },
        (target, error) => {
          this.log.debug(
            `COV fallback to polling for device ${target.deviceInstance}, object ${target.objectId.type}:${target.objectId.instance}: ${errorText(error)}`
          );
        }
      );
      this.store = new import_persistence.InventoryStore((0, import_node_path.join)(utils.getAbsoluteInstanceDataDir(this), "inventory-v1.json"));
      this.restoreInventories(await this.store.load());
      await ((_b = (_a = this.port).waitUntilListening) == null ? void 0 : _b.call(_a, clampInteger(this.config.apduTimeoutMs, 1e3, 6e4, 3e3)));
      await this.pruneUnselectedObjectTree();
      await Promise.all([
        this.setStateAsync("info.connection", true, true),
        this.setStateAsync("info.socketReady", true, true),
        this.setStateAsync("info.importedDevices", this.inventories.size, true),
        this.setStateAsync(
          "info.importedObjects",
          [...this.inventories.values()].reduce((total, inventory) => total + inventory.objects.length, 0),
          true
        )
      ]);
      void this.reconcileRestoredInventories().catch((error) => this.recordError("restore selections", error));
      if (this.config.pollingEnabled) {
        this.scheduler = new import_scheduler.NonOverlappingScheduler(
          () => this.pollImportedPoints(),
          clampInteger(this.config.pollIntervalMs, 1e3, 864e5, 3e4),
          (error) => this.recordError("poll", error),
          this.timer
        );
        this.scheduler.start();
      }
      this.log.info(
        `BACnet/IP socket configured on ${this.config.bindAddress || "0.0.0.0"}:${this.config.port || 47808}`
      );
    } catch (error) {
      await this.recordError("startup", error);
    }
  }
  onMessage(message) {
    try {
      this.handleMessage(message);
    } catch (error) {
      void this.recordError(`command ${message.command}`, error);
      this.respond(message, { ok: false, error: errorText(error) });
    }
  }
  handleMessage(message) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    switch (message.command) {
      case "startDiscovery": {
        const job = this.startDiscovery();
        this.respond(message, { ok: true, job: job.progress });
        return;
      }
      case "cancelDiscovery":
        this.respond(message, { ok: true, cancelled: (_b = (_a = this.discovery) == null ? void 0 : _a.cancel()) != null ? _b : false });
        return;
      case "getDiscoveryStatus":
        this.respond(message, { ok: true, job: (_d = (_c = this.discovery) == null ? void 0 : _c.status) != null ? _d : null });
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
        this.respond(message, { ok: true, job: (_f = (_e = this.activeImport) == null ? void 0 : _e.progress) != null ? _f : null });
        return;
      case "getDiagnostics":
        this.respond(message, {
          ok: true,
          diagnostics: {
            socketReady: Boolean(this.port),
            bindAddress: this.config.bindAddress,
            port: this.config.port,
            discovery: (_h = (_g = this.discovery) == null ? void 0 : _g.status) != null ? _h : null,
            import: (_j = (_i = this.activeImport) == null ? void 0 : _i.progress) != null ? _j : null,
            discoveredDevices: this.discovered.size,
            importedDevices: this.inventories.size,
            importedObjects: [...this.inventories.values()].reduce(
              (total, inventory) => total + inventory.objects.length,
              0
            )
          }
        });
        return;
      default:
        throw new Error(`Unsupported command: ${message.command}`);
    }
  }
  startDiscovery() {
    var _a;
    if (!this.discovery) {
      throw new Error("BACnet socket is not ready");
    }
    const targets = parseTargets((_a = this.config.additionalTargets) != null ? _a : [], this.config.port || 47808);
    const job = this.discovery.start({
      durationMs: clampInteger(this.config.discoveryTimeoutMs, 500, 12e4, 5e3),
      lowLimit: nullableInteger(this.config.lowLimit),
      highLimit: nullableInteger(this.config.highLimit),
      targets
    });
    void this.setStateAsync("info.discoveryRunning", true, true);
    void job.done.then(async (devices) => {
      const enriched = await this.enrichDevices(devices);
      this.discovered = new Map(enriched.map((device) => [device.deviceInstance, device]));
      await Promise.all([
        this.setStateAsync("info.discoveryRunning", false, true),
        this.setStateAsync("info.discoveryProgress", 100, true),
        this.setStateAsync("info.lastDiscovery", Date.now(), true),
        this.setStateAsync("info.discoveredDevices", enriched.length, true)
      ]);
      if (this.config.autoImportAll) {
        this.startImport(enriched.filter((device) => !device.conflict).map((device) => device.deviceInstance));
      }
    }).catch((error) => this.recordError("discovery", error));
    return job;
  }
  async enrichDevices(devices) {
    if (!this.inventoryReader) {
      return devices;
    }
    const queue = new import_queue.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
    return queue.map(devices, async (device) => {
      if (device.conflict) {
        return device;
      }
      const objectId = { type: import_client.ObjectType.DEVICE, instance: device.deviceInstance };
      const fields = [
        ["objectName", import_client.PropertyIdentifier.OBJECT_NAME],
        ["vendorName", import_client.PropertyIdentifier.VENDOR_NAME],
        ["modelName", import_client.PropertyIdentifier.MODEL_NAME],
        ["firmwareRevision", import_client.PropertyIdentifier.FIRMWARE_REVISION],
        ["applicationSoftwareVersion", import_client.PropertyIdentifier.APPLICATION_SOFTWARE_VERSION],
        ["location", import_client.PropertyIdentifier.LOCATION],
        ["description", import_client.PropertyIdentifier.DESCRIPTION]
      ];
      await queue.map(fields, async ([key, propertyId]) => {
        var _a;
        try {
          const values = await this.inventoryReader.readValue(device.address, objectId, propertyId);
          const value = (_a = values[0]) == null ? void 0 : _a.value;
          if (value != null) {
            device[key] = String(value);
          }
        } catch {
        }
      });
      return device;
    });
  }
  startImport(instances) {
    var _a;
    if (!this.inventoryReader || !this.store) {
      throw new Error("Inventory subsystem is not ready");
    }
    if (((_a = this.activeImport) == null ? void 0 : _a.progress.status) === "running") {
      return this.activeImport;
    }
    const progress = {
      jobId: `import-${Date.now()}`,
      kind: "import",
      status: "running",
      startedAt: Date.now(),
      processed: 0,
      total: instances.length,
      errors: []
    };
    const active = { progress, cancelled: false };
    this.activeImport = active;
    void this.runImport(active, instances);
    return active;
  }
  async runImport(active, instances) {
    const queue = new import_queue.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
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
        } catch (error) {
          active.progress.errors.push(`Device ${instance}: ${errorText(error)}`);
        } finally {
          active.progress.processed++;
        }
      });
      active.progress.status = active.cancelled ? "cancelled" : "completed";
      await this.pruneUnselectedObjectTree();
      await this.persistInventories();
      await Promise.all([
        this.setStateAsync("info.importedDevices", this.inventories.size, true),
        this.setStateAsync(
          "info.importedObjects",
          [...this.inventories.values()].reduce((total, inventory) => total + inventory.objects.length, 0),
          true
        )
      ]);
    } catch (error) {
      active.progress.status = "failed";
      active.progress.errors.push(errorText(error));
      await this.recordError("import", error);
    } finally {
      active.progress.finishedAt = Date.now();
    }
  }
  async reconcileInventory(inventory, refreshMissingValues) {
    var _a, _b, _c, _d;
    const selectedPoints = this.selectedPointIds();
    const selectedObjects = inventory.objects.map((object) => ({
      object,
      properties: [...object.properties.entries()].filter(
        ([propertyId]) => selectedPoints.has(
          (0, import_ids.pointId)(
            inventory.device.deviceInstance,
            object.objectId.type,
            object.objectId.instance,
            propertyId
          )
        )
      )
    })).filter((entry) => entry.properties.length > 0);
    if (selectedObjects.length === 0) {
      return;
    }
    const deviceBase = `devices.${(0, import_ids.deviceSegment)(inventory.device.deviceInstance)}`;
    const configuredDescription = (_a = (0, import_selection.selectionForDevice)(
      this.config.deviceSelections,
      inventory.device.deviceInstance
    )) == null ? void 0 : _a.description;
    await this.extendObjectAsync(deviceBase, {
      type: "device",
      common: {
        name: inventory.device.objectName || `BACnet device ${inventory.device.deviceInstance}`,
        desc: configuredDescription != null ? configuredDescription : ""
      },
      native: {
        deviceInstance: inventory.device.deviceInstance,
        address: inventory.device.address,
        vendorId: inventory.device.vendorId,
        vendorName: inventory.device.vendorName,
        modelName: inventory.device.modelName,
        scanCompleteness: inventory.completeness
      }
    });
    await this.extendObjectAsync(`${deviceBase}.info`, {
      type: "channel",
      common: { name: "Device information" },
      native: {}
    });
    await this.extendObjectAsync(`${deviceBase}.types`, {
      type: "folder",
      common: { name: "BACnet object types" },
      native: {}
    });
    for (const { object, properties } of selectedObjects) {
      const typeBase = `${deviceBase}.types.${(0, import_ids.objectTypeSegment)(object.objectId.type)}`;
      const objectBase = `${typeBase}.${(0, import_ids.objectSegment)(object.objectId.instance)}`;
      await this.extendObjectAsync(typeBase, {
        type: "channel",
        common: { name: (0, import_ids.objectTypeSegment)(object.objectId.type) },
        native: { objectType: object.objectId.type }
      });
      await this.extendObjectAsync(objectBase, {
        type: "channel",
        common: {
          name: (_c = (_b = readString(object.properties.get(import_client.PropertyIdentifier.OBJECT_NAME))) != null ? _b : object.objectName) != null ? _c : (0, import_ids.objectSegment)(object.objectId.instance)
        },
        native: {
          deviceInstance: inventory.device.deviceInstance,
          objectType: object.objectId.type,
          objectInstance: object.objectId.instance,
          partial: object.partial
        }
      });
      for (const [propertyId, cachedValues] of properties) {
        let values = cachedValues;
        if (refreshMissingValues && values.length === 0) {
          try {
            values = await this.inventoryReader.readValue(
              inventory.device.address,
              object.objectId,
              propertyId
            );
            object.properties.set(propertyId, values);
          } catch (error) {
            this.log.debug(
              `Initial read failed for selected point ${(0, import_ids.pointId)(
                inventory.device.deviceInstance,
                object.objectId.type,
                object.objectId.instance,
                propertyId
              )}: ${errorText(error)}`
            );
            continue;
          }
        }
        if (values.length > 0) {
          await this.upsertProperty(inventory.device, object.objectId, propertyId, values);
        }
      }
      if (this.config.covEnabled && properties.some(([propertyId]) => propertyId === import_client.PropertyIdentifier.PRESENT_VALUE) && isCovCandidate(object.objectId.type)) {
        await ((_d = this.cov) == null ? void 0 : _d.start(
          {
            subscriberId: subscriberId(inventory.device.deviceInstance, object.objectId),
            deviceInstance: inventory.device.deviceInstance,
            address: inventory.device.address,
            objectId: object.objectId
          },
          300
        ));
      }
    }
  }
  async upsertProperty(device, objectId, propertyId, values, ensureObject = true) {
    var _a;
    const id = (0, import_ids.pointId)(device.deviceInstance, objectId.type, objectId.instance, propertyId);
    if (!this.selectedPointIds().has(id)) {
      return;
    }
    const mapped = (0, import_mapper.mapApplicationData)(values, objectId.type, propertyId);
    const writable = this.config.writeEnabled && ((_a = this.config.writeAllowlist) != null ? _a : []).includes(id) && propertyId === import_client.PropertyIdentifier.PRESENT_VALUE && isSupportedWritableType(objectId.type);
    const common = {
      name: (0, import_ids.propertySegment)(propertyId),
      type: mapped.commonType,
      role: mapped.role,
      read: true,
      write: writable
    };
    if (mapped.unit) {
      common.unit = mapped.unit;
    }
    if (mapped.states) {
      common.states = mapped.states;
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
          arrayIndex: 4294967295,
          applicationTag: mapped.applicationTag,
          importSource: "bacnet",
          rawFallback: mapped.rawFallback
        }
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
        commonType: mapped.commonType === "boolean" ? "boolean" : "number"
      });
    }
  }
  async pollImportedPoints() {
    if (!this.inventoryReader || this.unloading) {
      return;
    }
    const queue = new import_queue.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
    const tasks = [];
    const selectedPoints = this.selectedPointIds();
    for (const inventory of this.inventories.values()) {
      for (const object of inventory.objects) {
        if (object.properties.has(import_client.PropertyIdentifier.PRESENT_VALUE) && selectedPoints.has(
          (0, import_ids.pointId)(
            inventory.device.deviceInstance,
            object.objectId.type,
            object.objectId.instance,
            import_client.PropertyIdentifier.PRESENT_VALUE
          )
        )) {
          tasks.push({
            device: inventory.device,
            objectId: object.objectId,
            propertyId: import_client.PropertyIdentifier.PRESENT_VALUE
          });
        }
      }
    }
    await queue.map(tasks, async (task) => {
      try {
        const values = await this.inventoryReader.readValue(
          task.device.address,
          task.objectId,
          task.propertyId
        );
        await this.upsertProperty(task.device, task.objectId, task.propertyId, values, false);
      } catch (error) {
        this.log.debug(
          `Poll failed for device ${task.device.deviceInstance}, object ${task.objectId.type}:${task.objectId.instance}: ${errorText(error)}`
        );
      }
    });
  }
  onStateChange(id, state) {
    if (!state || state.ack || this.unloading) {
      return;
    }
    void this.handleWrite(id, state.val).catch((error) => this.recordError(`write ${id}`, error));
  }
  async handleWrite(fullId, value) {
    var _a;
    if (!this.port || !this.inventoryReader) {
      throw new Error("BACnet socket is not ready");
    }
    const id = fullId.startsWith(`${this.namespace}.`) ? fullId.slice(this.namespace.length + 1) : fullId;
    const target = this.writeTargets.get(id);
    if (!target) {
      throw new Error(`Write target is not configured: ${id}`);
    }
    const previous = this.lastConfirmed.get(id);
    const writer = new import_write.SafeWriter(this.port, {
      enabled: this.config.writeEnabled,
      allowlist: new Set((_a = this.config.writeAllowlist) != null ? _a : []),
      priority: clampInteger(this.config.writePriority, 1, 16, 16)
    });
    try {
      const relinquish = value === null;
      await writer.write(target, value, relinquish);
      const readback = await this.inventoryReader.readValue(
        target.address,
        { type: target.objectType, instance: target.objectInstance },
        target.propertyId
      );
      const mapped = (0, import_mapper.mapApplicationData)(readback, target.objectType, target.propertyId);
      await this.setStateAsync(id, mapped.value, true);
      this.lastConfirmed.set(id, mapped.value);
    } catch (error) {
      if (previous !== void 0) {
        await this.setStateAsync(id, previous, true);
      }
      throw error;
    }
  }
  selectedPointIds() {
    return (0, import_selection.selectedPointSet)(this.config.deviceSelections);
  }
  restoreInventories(file) {
    var _a, _b, _c;
    this.inventories.clear();
    for (const persisted of file.devices) {
      if (!Number.isInteger(persisted.deviceInstance) || persisted.deviceInstance < 0 || !persisted.address || typeof persisted.address !== "object" || !Array.isArray(persisted.objects)) {
        continue;
      }
      const device = {
        deviceInstance: persisted.deviceInstance,
        address: persisted.address,
        addressKey: (0, import_ids.addressKey)(persisted.address),
        maxApdu: (_a = persisted.maxApdu) != null ? _a : 1476,
        segmentation: (_b = persisted.segmentation) != null ? _b : 0,
        vendorId: (_c = persisted.vendorId) != null ? _c : 0,
        lastSeen: persisted.lastSeen,
        conflict: false,
        conflictingAddresses: [],
        objectName: persisted.objectName,
        vendorName: persisted.vendorName,
        modelName: persisted.modelName,
        firmwareRevision: persisted.firmwareRevision,
        applicationSoftwareVersion: persisted.applicationSoftwareVersion,
        location: persisted.location,
        description: persisted.description
      };
      this.inventories.set(persisted.deviceInstance, {
        schemaVersion: 1,
        device,
        objects: persisted.objects.filter(
          (object) => Number.isInteger(object.objectType) && object.objectType >= 0 && Number.isInteger(object.objectInstance) && object.objectInstance >= 0 && Array.isArray(object.propertyIds)
        ).map((object) => ({
          objectId: { type: object.objectType, instance: object.objectInstance },
          properties: new Map(
            object.propertyIds.filter((propertyId) => Number.isInteger(propertyId) && propertyId >= 0).map((propertyId) => [propertyId, []])
          ),
          propertySource: object.partial ? "fallback" : "property-list",
          partial: object.partial,
          objectName: object.objectName
        })),
        importedAt: file.updatedAt,
        completeness: persisted.objects.some((object) => object.partial) ? "partial" : "complete",
        errors: []
      });
    }
  }
  async reconcileRestoredInventories() {
    if (!this.inventoryReader || this.inventories.size === 0) {
      return;
    }
    const queue = new import_queue.BoundedQueue(clampInteger(this.config.requestConcurrency, 1, 32, 4));
    await queue.map(
      [...this.inventories.values()],
      (inventory) => this.reconcileInventory(inventory, true).catch((error) => {
        this.log.warn(
          `Could not restore selected points for device ${inventory.device.deviceInstance}: ${errorText(error)}`
        );
      })
    );
  }
  getDeviceCatalog() {
    const selectedPoints = this.selectedPointIds();
    const instances = /* @__PURE__ */ new Set([...this.discovered.keys(), ...this.inventories.keys()]);
    return [...instances].sort((a, b) => a - b).map((deviceInstance) => {
      var _a, _b, _c, _d, _e, _f, _g;
      const liveDevice = this.discovered.get(deviceInstance);
      const inventory = this.inventories.get(deviceInstance);
      const device = liveDevice != null ? liveDevice : inventory == null ? void 0 : inventory.device;
      if (!device) {
        return void 0;
      }
      const selection = (0, import_selection.selectionForDevice)(this.config.deviceSelections, deviceInstance);
      return {
        deviceInstance,
        active: Boolean(liveDevice && !liveDevice.conflict),
        imported: Boolean(inventory),
        conflict: device.conflict,
        address: device.address,
        lastSeen: device.lastSeen,
        objectName: (_a = device.objectName) != null ? _a : `BACnet device ${deviceInstance}`,
        vendorName: (_b = device.vendorName) != null ? _b : "",
        modelName: (_c = device.modelName) != null ? _c : "",
        location: (_d = device.location) != null ? _d : "",
        deviceDescription: (_e = device.description) != null ? _e : "",
        userDescription: (_f = selection == null ? void 0 : selection.description) != null ? _f : "",
        points: (_g = inventory == null ? void 0 : inventory.objects.flatMap((object) => {
          var _a2, _b2;
          const objectName = (_b2 = (_a2 = readString(object.properties.get(import_client.PropertyIdentifier.OBJECT_NAME))) != null ? _a2 : object.objectName) != null ? _b2 : (0, import_ids.objectSegment)(object.objectId.instance);
          return [...object.properties.keys()].map((propertyId) => {
            const id = (0, import_ids.pointId)(
              deviceInstance,
              object.objectId.type,
              object.objectId.instance,
              propertyId
            );
            return {
              id,
              deviceInstance,
              objectType: object.objectId.type,
              objectTypeName: (0, import_ids.objectTypeSegment)(object.objectId.type),
              objectInstance: object.objectId.instance,
              objectName,
              propertyId,
              propertyName: (0, import_ids.propertySegment)(propertyId),
              selected: selectedPoints.has(id)
            };
          });
        }).sort((a, b) => a.id.localeCompare(b.id))) != null ? _g : []
      };
    }).filter((device) => Boolean(device));
  }
  async pruneUnselectedObjectTree() {
    const selectedPoints = this.selectedPointIds();
    const selectedObjects = (0, import_selection.selectedObjectSet)(selectedPoints);
    const startkey = `${this.namespace}.devices.`;
    const endkey = `${this.namespace}.devices.\u9999`;
    const params = { startkey, endkey, include_docs: true };
    const [states, channels, devices] = await Promise.all([
      this.getObjectViewAsync("system", "state", params),
      this.getObjectViewAsync("system", "channel", params),
      this.getObjectViewAsync("system", "device", params)
    ]);
    const entries = [
      ...states.rows.map((row) => ({ id: row.id, state: true })),
      ...channels.rows.map((row) => ({ id: row.id, state: false })),
      ...devices.rows.map((row) => ({ id: row.id, state: false }))
    ].sort((a, b) => b.id.length - a.id.length);
    for (const entry of entries) {
      const relativeId = entry.id.startsWith(`${this.namespace}.`) ? entry.id.slice(this.namespace.length + 1) : entry.id;
      if (selectedObjects.has(relativeId)) {
        continue;
      }
      if (entry.state) {
        await this.delStateAsync(relativeId).catch(() => void 0);
      }
      await this.delObjectAsync(relativeId).catch(() => void 0);
    }
    for (const inventory of this.inventories.values()) {
      const typesFolder = `devices.${(0, import_ids.deviceSegment)(inventory.device.deviceInstance)}.types`;
      if (!selectedObjects.has(typesFolder)) {
        await this.delObjectAsync(typesFolder).catch(() => void 0);
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
      devices: [...this.inventories.values()].map((inventory) => ({
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
        objects: inventory.objects.map((object) => {
          var _a;
          return {
            objectType: object.objectId.type,
            objectInstance: object.objectId.instance,
            propertyIds: [...object.properties.keys()],
            partial: object.partial,
            objectName: (_a = readString(object.properties.get(import_client.PropertyIdentifier.OBJECT_NAME))) != null ? _a : object.objectName
          };
        })
      }))
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
    var _a, _b, _c, _d;
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
      (_a = this.discovery) == null ? void 0 : _a.cancel();
      if (this.activeImport) {
        this.activeImport.cancelled = true;
      }
      (_b = this.scheduler) == null ? void 0 : _b.stop();
      const closePort = () => {
        var _a2;
        (_a2 = this.port) == null ? void 0 : _a2.close();
        this.port = void 0;
      };
      void ((_d = (_c = this.cov) == null ? void 0 : _c.stopAll()) != null ? _d : Promise.resolve()).catch((error) => this.log.debug(`COV cleanup failed: ${errorText(error)}`)).then(closePort).then(
        () => Promise.all([
          this.setStateAsync("info.connection", false, true),
          this.setStateAsync("info.socketReady", false, true),
          this.setStateAsync("info.discoveryRunning", false, true)
        ])
      ).finally(done);
    } catch (error) {
      this.log.error(`Unload failed: ${errorText(error)}`);
      done();
    }
  }
}
function parseDeviceInstances(message) {
  const value = message && typeof message === "object" && "deviceInstances" in message ? message.deviceInstances : [];
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry) => Number.isInteger(entry) && entry >= 0))];
}
function parseTargets(values, defaultPort) {
  return values.filter((value) => typeof value === "string" && value.trim()).map((value) => ({ address: value.includes(":") ? value.trim() : `${value.trim()}:${defaultPort}` }));
}
function nullableInteger(value) {
  return Number.isInteger(value) && value != null ? value : void 0;
}
function clampInteger(value, min, max, fallback) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function readString(values) {
  var _a;
  const value = (_a = values == null ? void 0 : values[0]) == null ? void 0 : _a.value;
  return value == null ? void 0 : String(value);
}
function isSupportedWritableType(objectType) {
  return [
    import_client.ObjectType.ANALOG_OUTPUT,
    import_client.ObjectType.ANALOG_VALUE,
    import_client.ObjectType.BINARY_OUTPUT,
    import_client.ObjectType.BINARY_VALUE,
    import_client.ObjectType.MULTI_STATE_OUTPUT,
    import_client.ObjectType.MULTI_STATE_VALUE
  ].includes(objectType);
}
function isCovCandidate(objectType) {
  return [
    import_client.ObjectType.ANALOG_INPUT,
    import_client.ObjectType.ANALOG_OUTPUT,
    import_client.ObjectType.ANALOG_VALUE,
    import_client.ObjectType.BINARY_INPUT,
    import_client.ObjectType.BINARY_OUTPUT,
    import_client.ObjectType.BINARY_VALUE,
    import_client.ObjectType.MULTI_STATE_INPUT,
    import_client.ObjectType.MULTI_STATE_OUTPUT,
    import_client.ObjectType.MULTI_STATE_VALUE
  ].includes(objectType);
}
function subscriberId(deviceInstance, objectId) {
  return deviceInstance * 4099 + objectId.type * 257 + objectId.instance >>> 0 || 1;
}
if (require.main !== module) {
  module.exports = (options) => new BacnetClientAdapter(options);
} else {
  (() => new BacnetClientAdapter())();
}
//# sourceMappingURL=main.js.map
