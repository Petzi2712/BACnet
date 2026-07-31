"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonOverlappingScheduler = void 0;
const domain_1 = require("./domain");
class NonOverlappingScheduler {
    task;
    intervalMs;
    onError;
    timerApi;
    timer;
    running = false;
    stopped = true;
    constructor(task, intervalMs, onError, timerApi = domain_1.systemTimer) {
        this.task = task;
        this.intervalMs = intervalMs;
        this.onError = onError;
        this.timerApi = timerApi;
    }
    start() {
        if (!this.stopped) {
            return;
        }
        this.stopped = false;
        this.schedule(0);
    }
    stop() {
        this.stopped = true;
        if (this.timer) {
            this.timerApi.cancel(this.timer);
        }
        this.timer = undefined;
    }
    async runNow() {
        if (this.running || this.stopped) {
            return false;
        }
        this.running = true;
        try {
            await this.task();
        }
        catch (error) {
            this.onError(error);
        }
        finally {
            this.running = false;
        }
        return true;
    }
    schedule(delay) {
        this.timer = this.timerApi.schedule(async () => {
            await this.runNow();
            if (!this.stopped) {
                this.schedule(this.intervalMs);
            }
        }, delay);
    }
}
exports.NonOverlappingScheduler = NonOverlappingScheduler;
//# sourceMappingURL=scheduler.js.map