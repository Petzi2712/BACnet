"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var bacnet_port_exports = {};
__export(bacnet_port_exports, {
  BacnetJsPort: () => BacnetJsPort
});
module.exports = __toCommonJS(bacnet_port_exports);
var import_client = __toESM(require("@bacnet-js/client"));
class BacnetJsPort {
  client;
  listening;
  covListeners = /* @__PURE__ */ new Map();
  constructor(options, onError = () => void 0) {
    this.client = new import_client.default(options);
    this.client.on("error", onError);
    this.listening = new Promise((resolve, reject) => {
      this.client.once("listening", resolve);
      this.client.once("error", reject);
    });
  }
  on(event, listener) {
    this.client.on(event, listener);
  }
  off(event, listener) {
    this.client.off(event, listener);
  }
  onCov(listener) {
    const wrappers = { confirmed: listener, unconfirmed: listener };
    this.covListeners.set(listener, wrappers);
    this.client.on("covNotify", wrappers.confirmed);
    this.client.on("covNotifyUnconfirmed", wrappers.unconfirmed);
  }
  offCov(listener) {
    const wrappers = this.covListeners.get(listener);
    if (!wrappers) {
      return;
    }
    this.client.off("covNotify", wrappers.confirmed);
    this.client.off("covNotifyUnconfirmed", wrappers.unconfirmed);
    this.covListeners.delete(listener);
  }
  waitUntilListening(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("BACnet UDP socket did not start listening in time")),
        timeoutMs
      );
      this.listening.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (error) => {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });
  }
  whoIs(receiver, options) {
    this.client.whoIs(receiver, options);
  }
  readProperty(receiver, objectId, propertyId, options) {
    return this.client.readProperty(receiver, objectId, propertyId, options);
  }
  readPropertyMultiple(receiver, properties, options) {
    return this.client.readPropertyMultiple(receiver, properties, options);
  }
  writeProperty(receiver, objectId, propertyId, values, options) {
    return this.client.writeProperty(receiver, objectId, propertyId, values, options);
  }
  subscribeCov(receiver, objectId, subscribeId, cancel, confirmed, lifetime, options) {
    return this.client.subscribeCov(receiver, objectId, subscribeId, cancel, confirmed, lifetime, options);
  }
  close() {
    for (const listener of this.covListeners.keys()) {
      this.offCov(listener);
    }
    this.client.close();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BacnetJsPort
});
//# sourceMappingURL=bacnet-port.js.map
