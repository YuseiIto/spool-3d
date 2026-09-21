import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSpool } from "~/geometry/build";
import { turnedOver } from "~/geometry/mirror";
import { initManifold } from "~/geometry/runtime";
import { buildPart } from "~/geometry/split";
import { withoutEasingOrFeatures } from "~/geometry/testSupport";
import { jointKinds } from "~/params/joints";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

const SEGMENTS = 96;

const split = (overrides: Partial<SpoolParams> = {}): SpoolParams => ({
	...withoutEasingOrFeatures(defaultSpoolParams),
	split: true,
	...overrides,
});

/** Interlocking joints only; `none` has no features and answers most questions trivially. */
const interlocking = jointKinds.filter((kind) => kind !== "none");

describe("buildPart", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	const part = (overrides: Partial<SpoolParams> = {}) =>
		buildPart(mf, split(overrides), SEGMENTS);

	it("returns the whole spool when the split is off", () => {
		const whole = buildPart(
			mf,
			{ ...defaultSpoolParams, split: false },
			SEGMENTS,
		);
		const reference = buildSpool(mf, defaultSpoolParams, SEGMENTS);

		expect(whole.volume()).toBeCloseTo(reference.volume(), 6);

		whole.delete();
		reference.delete();
	});

	describe.each(jointKinds)("the %s joint", (joint) => {
		/**
		 * The property the whole design rests on: a part must not collide with a copy of itself
		 * turned over. Every way of getting a joint wrong — the dowel ring half a step out of
		 * phase, an even function where an odd one was needed, a seam triangulated asymmetrically
		 * — shows up here and essentially nowhere else, because each of those still produces a
		 * perfectly valid-looking solid on its own.
		 */
		it("does not collide with its own turned-over copy", () => {
			const a = part({ joint });
			const b = turnedOver(a);
			const overlap = a.intersect(b);

			// Scaled against the part, so the tolerance means the same thing at any size.
			expect(overlap.volume() / a.volume()).toBeLessThan(1e-6);

			for (const solid of [a, b, overlap]) solid.delete();
		});

		it("is congruent to its own mate", () => {
			// Restates "there is only one part to print": the turned-over copy has to be the same
			// shape, not merely a compatible one.
			const a = part({ joint });
			const b = turnedOver(a);

			expect(b.volume()).toBeCloseTo(a.volume(), 6);
			expect(b.boundingBox().max[2]).toBeCloseTo(-a.boundingBox().min[2], 6);
			expect(b.boundingBox().min[2]).toBeCloseTo(-a.boundingBox().max[2], 6);

			for (const solid of [a, b]) solid.delete();
		});

		it("reassembles into the whole spool", () => {
			const a = part({ joint });
			const b = turnedOver(a);
			const assembled = a.add(b);
			const whole = buildSpool(mf, split({ joint }), SEGMENTS);

			// The assembly is the whole spool less the clearance kerf, so it is a little smaller
			// but never larger, and never by much.
			const ratio = assembled.volume() / whole.volume();
			expect(ratio).toBeLessThanOrEqual(1.0001);
			expect(ratio).toBeGreaterThan(0.98);

			expect(assembled.boundingBox().max[0]).toBeCloseTo(
				whole.boundingBox().max[0],
				3,
			);

			for (const solid of [a, b, assembled, whole]) solid.delete();
		});

		it("is about half the spool", () => {
			const a = part({ joint });
			const whole = buildSpool(mf, split({ joint }), SEGMENTS);

			// Joint features shift this a little either way, but a part that came out a quarter
			// or three quarters of the spool means the seam is in the wrong place.
			expect(a.volume() / whole.volume()).toBeGreaterThan(0.4);
			expect(a.volume() / whole.volume()).toBeLessThan(0.6);

			for (const solid of [a, whole]) solid.delete();
		});

		it("is a single connected body", () => {
			// A pin placed off the material, or a seam that cut a flange loose, would show up as
			// a second component here.
			const a = part({ joint });
			expect(a.status()).toBe("NoError");
			expect(a.decompose()).toHaveLength(1);
			a.delete();
		});
	});

	describe.each(interlocking)("clearance of the %s joint", (joint) => {
		const clearance = 0.4;

		/**
		 * Direction the two halves can shift relative to each other before the joint stops them.
		 *
		 * It is not the same for every joint, and assuming it is axial gets the wrong answer for
		 * three of the four. Only the wave seam leaves an axial gap; the others deliberately let
		 * their flat faces seat — that is what keeps the assembled winding width exact — and put
		 * the clearance on the surfaces that have to slide past each other instead.
		 *
		 * The step joints are bounded by radial walls, so their play is tangential. It is
		 * measured at the core radius because the seam only passes through material there: at the
		 * parting plane the flanges are far away on either side.
		 */
		const displace = (mate: Manifold, gap: number): Manifold => {
			switch (joint) {
				case "wave":
					return mate.translate([0, 0, -gap]);
				case "dowel":
					// Sockets are cut oversize, so the pins have room to move across the seam.
					return mate.translate([gap, 0, 0]);
				default: {
					const radius = defaultSpoolParams.coreDiameter / 2;
					return mate.rotate([0, 0, (180 * gap) / (Math.PI * radius)]);
				}
			}
		};

		/**
		 * Brackets the gap instead of assuming it. Moving the parts together by well under the
		 * clearance must not make them touch; by well over it, it must. That catches both
		 * failures a plain "they do not overlap" check cannot: clearance never applied, and
		 * clearance applied on both halves so the joint comes out twice as loose.
		 */
		it("leaves a gap of about the requested size", () => {
			const a = part({ joint, jointClearance: clearance });
			const b = turnedOver(a);

			const overlapAfter = (gap: number): number => {
				const moved = displace(b, gap);
				const overlap = a.intersect(moved);
				const volume = overlap.volume();
				moved.delete();
				overlap.delete();
				return volume;
			};

			expect(overlapAfter(clearance * 0.4) / a.volume()).toBeLessThan(1e-6);
			expect(overlapAfter(clearance * 3)).toBeGreaterThan(0);

			for (const solid of [a, b]) solid.delete();
		});

		it("gets tighter as the clearance is reduced", () => {
			const loose = part({ joint, jointClearance: 0.6 });
			const tight = part({ joint, jointClearance: 0.1 });

			// Less clearance means less material removed at the seam.
			expect(tight.volume()).toBeGreaterThan(loose.volume());

			for (const solid of [loose, tight]) solid.delete();
		});
	});

	describe("the dowel joint", () => {
		it("needs the half-step offset to mate at all", () => {
			// Guards the reasoning rather than the code: with pins and sockets on a plain
			// 180/count grid the mirror maps index i to -i, which has the same parity, so pins
			// would land on pins. The offset makes it -i-1 instead.
			const count = 3;
			const slots = 2 * count;
			for (let index = 0; index < slots; index++) {
				const mirrored = (-index - 1 + 2 * slots) % slots;
				expect(mirrored % 2).not.toBe(index % 2);
			}
		});
	});

	describe("with every feature enabled", () => {
		const loaded: Partial<SpoolParams> = {
			rootFilletRadius: 1.5,
			rimTreatment: "chamfer",
			rimSize: 0.8,
			boreChamfer: 0.5,
			lighteningHoleCount: 6,
			wireNotchCount: 2,
		};

		it.each(jointKinds)("still mates cleanly with the %s joint", (joint) => {
			const a = part({ ...loaded, joint });
			const b = turnedOver(a);
			const overlap: Manifold = a.intersect(b);

			expect(a.status()).toBe("NoError");
			expect(overlap.volume() / a.volume()).toBeLessThan(1e-6);

			for (const solid of [a, b, overlap]) solid.delete();
		});
	});
});
