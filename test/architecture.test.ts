import { expect } from "chai";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = join(__dirname, "..");
const excludedDocumentation = new Set([
	"README.md",
	"docs/de/README.md",
	"docs/ARCHITECTURE.md",
	"test/architecture.test.ts",
]);

describe("architecture boundary", () => {
	it("contains no technical dependency or import from the external GLT adapter", async () => {
		const files = await collect(root);
		const offenders: string[] = [];
		for (const filename of files) {
			const path = relative(root, filename).replaceAll("\\", "/");
			if (excludedDocumentation.has(path) || path.startsWith(".git/") || path.startsWith("node_modules/")) {
				continue;
			}
			if (!/\.(?:json|json5|ts|tsx|js|mjs|cjs|ya?ml)$/.test(path)) {
				continue;
			}
			const content = await readFile(filename, "utf8");
			if (/iot-glt|iobroker\.iot-glt/i.test(content)) {
				offenders.push(path);
			}
		}
		expect(offenders).to.deep.equal([]);
	});
});

async function collect(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const filename = join(directory, entry.name);
		if (entry.isDirectory() && [".git", "node_modules", "build"].includes(entry.name)) {
			continue;
		}
		if (entry.isDirectory()) {
			files.push(...(await collect(filename)));
		} else {
			files.push(filename);
		}
	}
	return files;
}
