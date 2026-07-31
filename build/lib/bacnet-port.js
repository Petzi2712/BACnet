"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacnetJsPort = void 0;
const client_1 = __importDefault(require("@bacnet-js/client"));
const domain_1 = require("./domain");
class BacnetJsPort {
    timer;
    client;
    listening;
    covListeners = new Map();
    constructor(options, onError = () => undefined, timer = domain_1.systemTimer) {
        this.timer = timer;
        this.client = new client_1.default(options);
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
            const timeout = this.timer.schedule(() => reject(new Error("BACnet UDP socket did not start listening in time")), timeoutMs);
            this.listening.then(() => {
                this.timer.cancel(timeout);
                resolve();
            }, error => {
                this.timer.cancel(timeout);
                reject(error instanceof Error ? error : new Error(String(error)));
            });
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
exports.BacnetJsPort = BacnetJsPort;
//# sourceMappingURL=bacnet-port.js.map