import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { InventoryFile } from "./domain";

export const EMPTY_INVENTORY: InventoryFile = { schemaVersion: 1, updatedAt: 0, devices: [] };
export class InventoryStore {
	public constructor(private readonly filename: string) {}
	public async load(): Promise<InventoryFile> {
		try {
			const parsed = JSON.parse(await readFile(this.filename, "utf8")) as unknown;
			return migrateInventory(parsed);
		} catch {
			return structuredClone(EMPTY_INVENTORY);
		}
	}
	public async save(inventory: InventoryFile): Promise<void> {
		await mkdir(dirname(this.filename), { recursive: true });
		const temporary = `${this.filename}.${process.pid}.tmp`;
		await writeFile(temporary, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
		await rename(temporary, this.filename);
	}
}
export function migrateInventory(value: unknown): InventoryFile {
	if (!value || typeof value !== "object") {
		return structuredClone(EMPTY_INVENTORY);
	}
	const candidate = value as Partial<InventoryFile>;
	if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.devices)) {
		return structuredClone(EMPTY_INVENTORY);
	}
	return {
		schemaVersion: 1,
		updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
		devices: candidate.devices,
	};
}
