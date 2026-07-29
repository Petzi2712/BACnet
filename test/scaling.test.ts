import { expect } from "chai";
import { BoundedQueue } from "../src/lib/queue";

describe("large inventory scaling", () => {
	it("processes 10,000 entries with bounded concurrency and linear storage", async () => {
		const queue = new BoundedQueue(6);
		const input = Array.from({ length: 10_000 }, (_, index) => ({
			device: Math.floor(index / 1000),
			objectType: index % 60,
			objectInstance: index,
		}));
		const output = await queue.map(input, entry =>
			Promise.resolve(`${entry.device}:${entry.objectType}:${entry.objectInstance}`),
		);
		expect(output).to.have.length(10_000);
		expect(new Set(output).size).to.equal(10_000);
		expect(queue.maxObserved).to.equal(6);
	});
});
