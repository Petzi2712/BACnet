export class BoundedQueue {
	private active = 0;
	private readonly waiting: Array<() => void> = [];
	public maxObserved = 0;
	public constructor(public readonly concurrency: number) {
		if (!Number.isInteger(concurrency) || concurrency < 1) {
			throw new Error("Concurrency must be a positive integer");
		}
	}
	public get pending(): number {
		return this.waiting.length;
	}
	public async run<T>(task: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await task();
		} finally {
			this.release();
		}
	}
	public async map<T, R>(values: readonly T[], task: (value: T, index: number) => Promise<R>): Promise<R[]> {
		return Promise.all(values.map((value, index) => this.run(() => task(value, index))));
	}

	private async acquire(): Promise<void> {
		if (this.active >= this.concurrency) {
			await new Promise<void>(resolve => this.waiting.push(resolve));
		}
		this.active++;
		this.maxObserved = Math.max(this.maxObserved, this.active);
	}

	private release(): void {
		this.active--;
		this.waiting.shift()?.();
	}
}
export interface RetryOptions {
	retries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	random?: () => number;
	delay: (milliseconds: number) => Promise<void>;
}
export async function withRetry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
	const random = options.random ?? Math.random;
	let lastError: unknown;
	for (let attempt = 0; attempt <= options.retries; attempt++) {
		try {
			return await operation(attempt);
		} catch (error) {
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
export function chunks<T>(values: readonly T[], size: number): T[][] {
	if (!Number.isInteger(size) || size < 1) {
		throw new Error("Chunk size must be positive");
	}
	const result: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		result.push(values.slice(index, index + size));
	}
	return result;
}
