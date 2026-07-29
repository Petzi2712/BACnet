export class NonOverlappingScheduler {
	private timer?: ReturnType<typeof setTimeout>;
	private running = false;
	private stopped = true;
	public constructor(
		private readonly task: () => Promise<void>,
		private readonly intervalMs: number,
		private readonly onError: (error: unknown) => void,
	) {}
	public start(): void {
		if (!this.stopped) {
			return;
		}
		this.stopped = false;
		this.schedule(0);
	}
	public stop(): void {
		this.stopped = true;
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = undefined;
	}
	public async runNow(): Promise<boolean> {
		if (this.running || this.stopped) {
			return false;
		}
		this.running = true;
		try {
			await this.task();
		} catch (error) {
			this.onError(error);
		} finally {
			this.running = false;
		}
		return true;
	}

	private schedule(delay: number): void {
		this.timer = setTimeout(async () => {
			await this.runNow();
			if (!this.stopped) {
				this.schedule(this.intervalMs);
			}
		}, delay);
	}
}
