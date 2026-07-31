"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CovManager = void 0;
const queue_1 = require("./queue");
class CovManager {
    client;
    timer;
    onNotification;
    onFallback;
    active = new Map();
    stopped = false;
    listener = (message) => {
        const subscription = this.active.get(message.payload.subscriberProcessId);
        if (subscription) {
            this.onNotification(subscription.target, message);
        }
    };
    constructor(client, timer, onNotification, onFallback) {
        this.client = client;
        this.timer = timer;
        this.onNotification = onNotification;
        this.onFallback = onFallback;
        this.client.onCov(this.listener);
    }
    async start(target, lifetimeSeconds) {
        if (this.stopped) {
            return false;
        }
        const subscription = { target, lifetimeSeconds };
        this.active.set(target.subscriberId, subscription);
        try {
            await this.subscribe(subscription);
            return true;
        }
        catch (error) {
            this.active.delete(target.subscriberId);
            this.onFallback(target, error);
            return false;
        }
    }
    async stopAll() {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        this.client.offCov(this.listener);
        const subscriptions = [...this.active.values()];
        this.active.clear();
        await new queue_1.BoundedQueue(4).map(subscriptions, async (subscription) => {
            if (subscription.timer) {
                this.timer.cancel(subscription.timer);
            }
            try {
                await this.client.subscribeCov(subscription.target.address, subscription.target.objectId, subscription.target.subscriberId, true, false, 0);
            }
            catch {
                // Closing the socket is the final cleanup fallback.
            }
        });
    }
    async subscribe(subscription) {
        await this.client.subscribeCov(subscription.target.address, subscription.target.objectId, subscription.target.subscriberId, false, false, subscription.lifetimeSeconds);
        subscription.timer = this.timer.schedule(() => {
            void this.renew(subscription);
        }, Math.max(1000, subscription.lifetimeSeconds * 800));
    }
    async renew(subscription) {
        if (this.stopped || !this.active.has(subscription.target.subscriberId)) {
            return;
        }
        try {
            await this.subscribe(subscription);
        }
        catch (error) {
            this.active.delete(subscription.target.subscriberId);
            this.onFallback(subscription.target, error);
        }
    }
}
exports.CovManager = CovManager;
//# sourceMappingURL=cov.js.map