import { describe, expect, it } from "vitest";
import { massOf, windingCapacityMetres } from "~/params/capacity";
import { derive } from "~/params/derive";
import { defaultSpoolParams } from "~/params/schema";

const capacity = (wireDiameter: number, overrides = {}) =>
	windingCapacityMetres({ ...defaultSpoolParams, ...overrides }, wireDiameter);

describe("windingCapacityMetres", () => {
	it("matches a hand-counted single layer", () => {
		// Sized so exactly one layer and a whole number of turns fit, making the answer
		// independent of how the layers are stacked.
		const params = {
			...defaultSpoolParams,
			coreDiameter: 20,
			flangeDiameter: 24,
			windingWidth: 10,
		};

		// Depth 2 mm holds one 2 mm layer; width 10 mm holds five turns; the layer's centreline
		// sits 1 mm above the core, at radius 11.
		const expected = (5 * 2 * Math.PI * 11) / 1000;
		expect(windingCapacityMetres(params, 2)).toBeCloseTo(expected, 6);
	});

	it("counts the outer layers as longer than the inner ones", () => {
		// Doubling the number of layers more than doubles the length, because each new layer
		// winds at a larger radius than the one under it.
		const one = capacity(2, { coreDiameter: 20, flangeDiameter: 24 });
		const two = capacity(2, { coreDiameter: 20, flangeDiameter: 28 });

		expect(two).toBeGreaterThan(2 * one);
	});

	it("grows when the spool does", () => {
		expect(capacity(1, { flangeDiameter: 120 })).toBeGreaterThan(capacity(1));
		expect(capacity(1, { windingWidth: 80 })).toBeGreaterThan(capacity(1));
	});

	it("holds less of a thicker wire", () => {
		expect(capacity(2)).toBeLessThan(capacity(1));
	});

	it("reports nothing when not even one turn fits", () => {
		const g = derive(defaultSpoolParams);
		const tooThick = (g.flangeRadius - g.coreRadius) * 2;

		expect(capacity(tooThick)).toBe(0);
		expect(capacity(0)).toBe(0);
		expect(capacity(-1)).toBe(0);
	});
});

describe("massOf", () => {
	it("converts a volume to grams of PLA", () => {
		// 1000 mm³ is 1 cm³, which is 1.24 g.
		expect(massOf(1000)).toBeCloseTo(1.24, 6);
	});
});
