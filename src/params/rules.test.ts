import { describe, expect, it } from "vitest";
import type { IssueCode } from "~/params/issue";
import { checkParams } from "~/params/rules";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

const codesFor = (overrides: Partial<SpoolParams>): IssueCode[] =>
	checkParams({ ...defaultSpoolParams, ...overrides }).map((i) => i.code);

const errorCodesFor = (overrides: Partial<SpoolParams>): IssueCode[] =>
	checkParams({ ...defaultSpoolParams, ...overrides })
		.filter((i) => i.severity === "error")
		.map((i) => i.code);

describe("checkParams", () => {
	it("passes the defaults", () => {
		expect(checkParams(defaultSpoolParams)).toEqual([]);
	});

	// Asserted by code rather than by message, so the wording stays free to change.
	it.each<[string, Partial<SpoolParams>, IssueCode]>([
		[
			"a core as wide as the flange",
			{ coreDiameter: 80 },
			"CORE_NOT_INSIDE_FLANGE",
		],
		[
			"a bore as wide as the core",
			{ boreDiameter: 30 },
			"BORE_NOT_INSIDE_CORE",
		],
		[
			"a flange thinner than two extrusions",
			{ flangeThickness: 0.5 },
			"FLANGE_TOO_THIN",
		],
		[
			"a margin that leaves no room for a window",
			{ lighteningHoleCount: 6, lighteningHoleMargin: 40 },
			"HOLE_NO_ROOM",
		],
		[
			"too many windows for the webs between them",
			{ lighteningHoleCount: 24, lighteningHoleMargin: 6 },
			"HOLES_TOO_CLOSE",
		],
		[
			"a start hole too big for the flange",
			{ startHoleCount: 1, startHoleDiameter: 30 },
			"START_HOLE_TOO_BIG",
		],
		[
			"start holes running into each other",
			{ startHoleCount: 24, startHoleDiameter: 4 },
			"START_HOLES_TOO_CLOSE",
		],
		[
			"notches cutting to the winding surface",
			{ wireNotchCount: 2, wireNotchDepth: 30 },
			"NOTCH_TOO_DEEP",
		],
		[
			"too many notches to fit",
			{ wireNotchCount: 200, wireNotchDepth: 5 },
			"NOTCHES_TOO_CLOSE",
		],
	])("rejects %s", (_name, overrides, code) => {
		expect(errorCodesFor(overrides)).toContain(code);
	});

	it("warns when an oversized root fillet is being clamped", () => {
		expect(codesFor({ rootFilletRadius: 500 })).toContain(
			"ROOT_FILLET_TOO_LARGE",
		);
		expect(errorCodesFor({ rootFilletRadius: 500 })).toEqual([]);
	});

	it("says nothing about the clearance of a butt seam", () => {
		// `jointSolids` forces the clearance to zero for a flat seam, so any reading of it is
		// remarking on a number the build does not use.
		for (const jointClearance of [0, 0.6]) {
			expect(
				codesFor({ split: true, joint: "none", jointClearance }),
			).not.toContain("CLEARANCE_OUT_OF_RANGE");
		}
	});

	it("says nothing about features that are switched off", () => {
		// Count zero means disabled, so an otherwise impossible hole size must stay silent.
		expect(
			codesFor({
				lighteningHoleCount: 0,
				lighteningHoleMargin: 500,
				startHoleCount: 0,
				startHoleDiameter: 500,
				wireNotchCount: 0,
				wireNotchDepth: 500,
			}),
		).toEqual([]);
	});

	it("scales the wall minimum to the nozzle", () => {
		const params = { ...defaultSpoolParams, flangeThickness: 1.0 };

		expect(checkParams(params, { nozzleDiameter: 0.4 })).toEqual([]);
		expect(
			checkParams(params, { nozzleDiameter: 0.8 }).map((i) => i.code),
		).toContain("FLANGE_TOO_THIN");
	});

	describe("suggestions", () => {
		/** Parameter sets that break something, covering every rule that offers a fix. */
		const BROKEN: [string, Partial<SpoolParams>][] = [
			["an oversized core", { coreDiameter: 80 }],
			["an oversized bore", { boreDiameter: 30 }],
			["a thin flange", { flangeThickness: 0.5 }],
			["an oversized root fillet", { rootFilletRadius: 500 }],
			[
				"a margin with no room",
				{ lighteningHoleCount: 6, lighteningHoleMargin: 40 },
			],
			["crowded windows", { lighteningHoleCount: 24, lighteningHoleMargin: 6 }],
			[
				"an oversized corner radius",
				{ lighteningHoleCount: 6, lighteningHoleCornerRadius: 15 },
			],
			["an oversized start hole", { startHoleCount: 1, startHoleDiameter: 30 }],
			["crowded start holes", { startHoleCount: 24, startHoleDiameter: 4 }],
			["over-deep notches", { wireNotchCount: 2, wireNotchDepth: 30 }],
			["crowded notches", { wireNotchCount: 200, wireNotchDepth: 5 }],
			[
				"dowels too wide for the core wall",
				{ joint: "dowel", dowelDiameter: 5 },
			],
			[
				"dowels on a ring off the material",
				{ joint: "dowel", dowelCircleDiameter: 60 },
			],
			["crowded dowels", { joint: "dowel", dowelCount: 12 }],
			[
				"a seam taller than the flange gap",
				{ joint: "wave", waveAmplitude: 20 },
			],
			["a slack seam", { joint: "wave", jointClearance: 0.7 }],
		];

		/*
		 * A suggestion that offers the value the field already holds is worse than none: the Fix
		 * button appears to work, nothing changes, and on a blocking error there is no way forward
		 * from the panel at all. It is an easy shape to write, because a sensible-looking constant
		 * is often exactly the value at which the rule starts firing.
		 */
		it.each(BROKEN)("moves the field it names, for %s", (_name, overrides) => {
			const params = { ...defaultSpoolParams, split: true, ...overrides };
			const suggestions = checkParams(params)
				.map((issue) => issue.suggestion)
				.filter((suggestion) => suggestion !== undefined);

			expect(suggestions.length).toBeGreaterThan(0);
			for (const suggestion of suggestions) {
				expect(suggestion.value, suggestion.field).not.toBe(
					params[suggestion.field],
				);
			}
		});

		const applied = (overrides: Partial<SpoolParams>): SpoolParams => {
			const params = { ...defaultSpoolParams, split: true, ...overrides };
			let fixed = params;
			for (const issue of checkParams(params)) {
				if (issue.suggestion) {
					fixed = {
						...fixed,
						[issue.suggestion.field]: issue.suggestion.value,
					};
				}
			}
			return fixed;
		};

		// The point of a suggestion is that taking it actually resolves the issue; otherwise the
		// one-click fix sends the user in circles.
		it.each<[string, Partial<SpoolParams>]>([
			["an oversized core", { coreDiameter: 80 }],
			["an oversized bore", { boreDiameter: 30 }],
			["a thin flange", { flangeThickness: 0.5 }],
			[
				"a margin with no room",
				{ lighteningHoleCount: 6, lighteningHoleMargin: 40 },
			],
			["crowded windows", { lighteningHoleCount: 24, lighteningHoleMargin: 6 }],
			["an oversized start hole", { startHoleCount: 1, startHoleDiameter: 30 }],
			["crowded start holes", { startHoleCount: 24, startHoleDiameter: 4 }],
			["over-deep notches", { wireNotchCount: 2, wireNotchDepth: 30 }],
			["crowded notches", { wireNotchCount: 200, wireNotchDepth: 5 }],
			[
				"dowels too wide for the core wall",
				{ joint: "dowel", dowelDiameter: 5 },
			],
			[
				"dowels on a ring off the material",
				{ joint: "dowel", dowelCircleDiameter: 60 },
			],
			["crowded dowels", { joint: "dowel", dowelCount: 12 }],
		])("clears the errors for %s", (_name, overrides) => {
			expect(
				checkParams(applied(overrides)).filter((i) => i.severity === "error"),
			).toEqual([]);
		});
	});
});
