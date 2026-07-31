"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoundedQueue = void 0;
exports.withRetry = withRetry;
exports.chunks = chunks;
class BoundedQueue {
    concurrency;
    active = 0;
    waiting = [];
    maxObserved = 0;
    constructor(concurrency) {
        this.concurrency = concurrency;
        if (!Number.isInteger(concurrency) || concurrency < 1) {
            throw new Error("Concurrency must be a positive integer");
        }
    }
    get pending() {
        return this.waiting.length;
    }
    async run(task) {
        await this.acquire();
        try {
            return await task();
        }
        finally {
            this.release();
        }
    }
    async map(values, task) {
        return Promise.all(values.map((value, index) => this.run(() => task(value, index))));
    }
    async acquire() {
        if (this.active >= this.concurrency) {
            await new Promise(resolve => this.waiting.push(resolve));
        }
        this.active++;
        this.maxObserved = Math.max(this.maxObserved, this.active);
    }
    release() {
        this.active--;
        this.waiting.shift()?.();
    }
}
exports.BoundedQueue = BoundedQueue;
async function withRetry(operation, options) {
    const random = options.random ?? Math.random;
    let lastError;
    for (let attempt = 0; attempt <= options.retries; attempt++) {
        try {
            return await operation(attempt);
        }
        catch (error) {
            lastError = error;
            if (attempt === options.retries) {
                break;
            }
            const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);
            const jittered = Math.max(0, Math.round(exponential * (0.8 + random() * 0.4)));
            await options.delay(jittered);
        }
    }
    throw lastError;
}
function chunks(values, size) {
    if (!Number.isInteger(size) || size < 1) {
        throw new Error("Chunk size must be positive");
    }
    const result = [];
    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size));
    }
    return result;
}
//# sourceMappingURL=queue.js.map