import { expect } from "chai";
import { keepObjectForSelection, normalizeDeviceSelections, selectedPointSet, selectionForDevice } from "./selection";

describe("device point selections", () => {
	const point = "devices.d_1234.types.analog_input.o_7.present_value";

	it("normalizes, deduplicates and sorts configured devices and points", () => {
		const normalized = normalizeDeviceSelections([
			{
				deviceInstance: 1234,
				description: "  AHU  ",
				selectedPoints: [point, point, "devices.d_4321.types.analog_input.o_7.present_value", "invalid"],
			},
			{ deviceInstance: -1, description: "invalid", selectedPoints: [] },
		]);
		expect(normalized).to.deep.equal([{ deviceInstance: 1234, description: "AHU", selectedPoints: [point] }]);
		expect([...selectedPointSet(normalized)]).to.deep.equal([point]);
		expect(selectionForDevice(normalized, 1234)?.description).to.equal("AHU");
	});

	it("keeps only selected states and their structural parents", () => {
		const selected = new Set([point]);
		expect(keepObjectForSelection(point, selected)).to.equal(true);
		expect(keepObjectForSelection("devices.d_1234.types.analog_input.o_7", selected)).to.equal(true);
		expect(keepObjectForSelection("devices.d_1234.types", selected)).to.equal(true);
		expect(keepObjectForSelection("devices.d_1234.info", selected)).to.equal(true);
		expect(keepObjectForSelection("devices.d_1234.types.analog_input.o_8.present_value", selected)).to.equal(false);
		expect(keepObjectForSelection("devices.d_4321", selected)).to.equal(false);
	});
});
