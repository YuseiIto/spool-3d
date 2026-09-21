import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { jointKinds } from "~/params/joints";
import {
	defaultSpoolParams,
	rimTreatments,
	type SpoolParams,
} from "~/params/schema";
import { decodeParams, encodeParams } from "~/params/url";

const roundTrip = (params: SpoolParams): SpoolParams =>
	decodeParams(encodeParams(params)).params;

/**
 * Generates parameters that are plausible rather than merely well-typed.
 *
 * Constructed to be in range instead of filtered down to it: rejecting most of what the generator
 * produces makes the property pass for the wrong reason, because the surviving cases cluster
 * around whatever the filter happened to allow.
 */
const arbitraryParams = fc
	.record({
		flangeDiameter: fc.double({ min: 10, max: 300, noNaN: true }),
		flangeThickness: fc.double({ min: 0.8, max: 20, noNaN: true }),
		coreDiameter: fc.double({ min: 5, max: 200, noNaN: true }),
		windingWidth: fc.double({ min: 2, max: 200, noNaN: true }),
		boreDiameter: fc.double({ min: 1, max: 100, noNaN: true }),
		rootFilletRadius: fc.double({ min: 0, max: 10, noNaN: true }),
		rimTreatment: fc.constantFrom(...rimTreatments),
		rimSize: fc.double({ min: 0, max: 5, noNaN: true }),
		boreChamfer: fc.double({ min: 0, max: 5, noNaN: true }),
		lighteningHoleCount: fc.integer({ min: 0, max: 24 }),
		lighteningHoleMargin: fc.double({ min: 0.5, max: 30, noNaN: true }),
		lighteningHoleCornerRadius: fc.double({ min: 0, max: 15, noNaN: true }),
		startHoleCount: fc.integer({ min: 0, max: 6 }),
		startHoleDiameter: fc.double({ min: 0.5, max: 12, noNaN: true }),
		wireNotchCount: fc.integer({ min: 0, max: 12 }),
		wireNotchWidth: fc.double({ min: 0.5, max: 10, noNaN: true }),
		wireNotchDepth: fc.double({ min: 0.5, max: 60, noNaN: true }),
		split: fc.boolean(),
		joint: fc.constantFrom(...jointKinds),
		jointClearance: fc.double({ min: 0, max: 0.8, noNaN: true }),
		dowelCount: fc.integer({ min: 1, max: 12 }),
		dowelDiameter: fc.double({ min: 1, max: 20, noNaN: true }),
		dowelHeight: fc.double({ min: 1, max: 30, noNaN: true }),
		dowelCircleDiameter: fc.double({ min: 0, max: 200, noNaN: true }),
		waveCount: fc.integer({ min: 1, max: 12 }),
		waveAmplitude: fc.double({ min: 0.5, max: 30, noNaN: true }),
		stepCount: fc.integer({ min: 1, max: 8 }),
		stepHeight: fc.double({ min: 0.5, max: 30, noNaN: true }),
		lapCount: fc.integer({ min: 1, max: 8 }),
		lapLength: fc.double({ min: 0.5, max: 30, noNaN: true }),
	})
	// The encoder rounds, so compare against values that survive that rounding.
	.map(
		(params) =>
			Object.fromEntries(
				Object.entries(params).map(([key, value]) => [
					key,
					typeof value === "number" ? Number(value.toFixed(3)) : value,
				]),
			) as SpoolParams,
	);

describe("URL encoding", () => {
	it("covers every parameter exactly once", () => {
		// A field with no key silently stops travelling in links, and a duplicate key makes two
		// fields overwrite each other. Neither shows up anywhere else.
		const encoded = new URLSearchParams(
			encodeParams({
				...defaultSpoolParams,
				// Nudge every field off its default so all of them have to be emitted.
				...Object.fromEntries(
					Object.entries(defaultSpoolParams).map(([key, value]) => [
						key,
						typeof value === "number"
							? value + 1
							: typeof value === "boolean"
								? !value
								: "round",
					]),
				),
			} as SpoolParams),
		);

		expect([...encoded.keys()]).toHaveLength(
			Object.keys(defaultSpoolParams).length,
		);
		expect(new Set(encoded.keys()).size).toBe(
			Object.keys(defaultSpoolParams).length,
		);
	});

	it("emits nothing for the default spool", () => {
		// So the tool's own front page has a clean address.
		expect(encodeParams(defaultSpoolParams)).toBe("");
	});

	it("omits fields left at their defaults", () => {
		const encoded = encodeParams({
			...defaultSpoolParams,
			flangeDiameter: 120,
		});
		expect(encoded).toBe("fd=120");
	});

	it("survives a round trip", () => {
		fc.assert(
			fc.property(arbitraryParams, (params) => {
				expect(roundTrip(params)).toEqual(params);
			}),
			{ numRuns: 300 },
		);
	});

	it("does not write float noise into the link", () => {
		const encoded = encodeParams({
			...defaultSpoolParams,
			jointClearance: 0.1 + 0.2,
		});
		expect(encoded).toContain("clr=0.3");
	});

	describe("a link that cannot be read in full", () => {
		it("ignores keys it does not recognise", () => {
			// Links written by a future version must keep working, minus what they added.
			const { params, issues } = decodeParams("fd=120&somethingNew=7");
			expect(params.flangeDiameter).toBe(120);
			expect(issues).toEqual([]);
		});

		it("falls back per field rather than discarding the link", () => {
			const { params, issues } = decodeParams("fd=120&ww=not-a-number");

			expect(params.flangeDiameter).toBe(120);
			expect(params.windingWidth).toBe(defaultSpoolParams.windingWidth);
			expect(issues.map((issue) => issue.code)).toEqual(["LINK_FIELD_IGNORED"]);
		});

		it("rejects values the schema will not accept", () => {
			// Negative dimensions parse as numbers but cannot describe a spool.
			const { params, issues } = decodeParams("fd=-5");

			expect(params.flangeDiameter).toBe(defaultSpoolParams.flangeDiameter);
			expect(issues).toHaveLength(1);
		});

		it("rejects an unknown joint name", () => {
			const { params } = decodeParams("j=telepathy");
			expect(params.joint).toBe(defaultSpoolParams.joint);
		});

		it("names each unreadable field once, however many ways it is wrong", () => {
			// Zod can raise more than one issue for a value; the reader's account of what it
			// dropped should still read as a list of fields.
			const { issues } = decodeParams("fd=-5&ww=-5");
			const message = issues[0]?.message ?? "";

			expect(message.match(/fd/g)).toHaveLength(1);
			expect(message.match(/ww/g)).toHaveLength(1);
		});

		it("never throws, whatever the query says", () => {
			// This runs during the first render, so an exception here is a blank page — which is
			// the one outcome the forgiving reader exists to avoid.
			const nonsense = [
				"fd=-5&ww=0&cd=NaN&bd=&j=&sp=maybe",
				"fd=Infinity",
				"clr=-1&dn=0&vn=-3",
				"%%%",
				"=&=&=",
			];

			for (const search of nonsense) {
				expect(() => decodeParams(search), search).not.toThrow();
			}
		});

		it("reads an empty query as the defaults", () => {
			expect(decodeParams("")).toEqual({
				params: defaultSpoolParams,
				issues: [],
			});
		});
	});
});
