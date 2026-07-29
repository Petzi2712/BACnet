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
          const device = this.discovered.get(target.deviceInstance);
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
      await this.store.load();
      await ((_b = (_a = this.port).waitUntilListening) == null ? void 0 : _b.call(_a, clampInteger(this.config.apduTimeoutMs, 1e3, 6e4, 3e3)));
      await Promise.all([
        this.setStateAsync("info.connection", true, true),
        this.setStateAsync("info.socketReady", true, true)
      ]);
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
          await this.reconcileInventory(inventory);
        } catch (error) {
          active.progress.errors.push(`Device ${instance}: ${errorText(error)}`);
        } finally {
          active.progress.processed++;
        }
      });
      active.progress.status = active.cancelled ? "cancelled" : "completed";
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
  async reconcileInventory(inventory) {
    var _a, _b;
    const deviceBase = `devices.${(0, import_ids.deviceSegment)(inventory.device.deviceInstance)}`;
    await this.extendObjectAsync(deviceBase, {
      type: "device",
      common: { name: inventory.device.objectName || `BACnet device ${inventory.device.deviceInstance}` },
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
    for (const object of inventory.objects) {
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
          name: (_a = readString(object.properties.get(import_client.PropertyIdentifier.OBJECT_NAME))) != null ? _a : (0, import_ids.objectSegment)(object.objectId.instance)
        },
        native: {
          deviceInstance: inventory.device.deviceInstance,
          objectType: object.objectId.type,
          objectInstance: object.objectId.instance,
          partial: object.partial
        }
      });
      for (const [propertyId, values] of object.properties) {
        await this.upsertProperty(inventory.device, object.objectId, propertyId, values);
      }
      if (this.config.covEnabled && object.properties.has(import_client.PropertyIdentifier.PRESENT_VALUE) && isCovCandidate(object.objectId.type)) {
        await ((_b = this.cov) == null ? void 0 : _b.start(
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
    for (const inventory of this.inventories.values()) {
      for (const object of inventory.objects) {
        if (object.properties.has(import_client.PropertyIdentifier.PRESENT_VALUE)) {
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
        objects: inventory.objects.map((object) => ({
          objectType: object.objectId.type,
          objectInstance: object.objectId.instance,
          propertyIds: [...object.properties.keys()],
          partial: object.partial
        }))
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
