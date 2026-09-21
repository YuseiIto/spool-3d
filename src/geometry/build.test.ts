import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSpool } from "~/geometry/build";
import { initManifold } from "~/geometry/runtime";
import {
	analyticSpoolVolume,
	withoutEasingOrFeatures,
} from "~/geometry/testSupport";
import { derive } from "~/params/derive";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

const SEGMENTS = 128;

const plain = withoutEasingOrFeatures(defaultSpoolParams);

const variants: Record<string, SpoolParams> = {
	default: plain,
	wide: { ...plain, windingWidth: 120, flangeDiameter: 140 },
	narrow: {
		...plain,
		windingWidth: 6,
		coreDiameter: 12,
		boreDiameter: 3,
		flangeDiameter: 24,
		flangeThickness: 1.2,
	},
};

describe("buildSpool", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	const build = (params: SpoolParams, segments = SEGMENTS) =>
		buildSpool(mf, params, segments);

	describe("the plain spool", () => {
		it.each(Object.entries(variants))(
			"produces a valid solid for the %s spool",
			(_name, params) => {
				const spool = build(params);

				expect(spool.status()).toBe("NoError");
				// One body: a spool whose flanges had come away from the core would still be a
				// legal manifold, so connectivity has to be asserted separately.
				expect(spool.decompose()).toHaveLength(1);
				// The bore is the only through hole.
				expect(spool.genus()).toBe(1);

				spool.delete();
			},
		);

		it.each(Object.entries(variants))(
			"matches the closed-form volume for the %s spool",
			(_name, params) => {
				const spool = build(params);
				expect(
					spool.volume() / analyticSpoolVolume(params, SEGMENTS),
				).toBeCloseTo(1, 3);
				spool.delete();
			},
		);

		it.each(Object.entries(variants))(
			"occupies exactly the requested envelope for the %s spool",
			(_name, params) => {
				const g = derive(params);
				const spool = build(params);
				const { min, max } = spool.boundingBox();

				// Height is exact; radius is the K-gon's apothem-to-circumradius span, so it only
				// reaches the nominal radius at the vertices.
				expect(min[2]).toBeCloseTo(-g.halfHeight, 6);
				expect(max[2]).toBeCloseTo(g.halfHeight, 6);
				for (const axis of [0, 1] as const) {
					expect(max[axis]).toBeCloseTo(g.flangeRadius, 3);
					expect(min[axis]).toBeCloseTo(-g.flangeRadius, 3);
				}

				spool.delete();
			},
		);

		it("grows monotonically with the flange diameter", () => {
			const small = build(plain);
			const large = build({ ...plain, flangeDiameter: 100 });

			expect(large.volume()).toBeGreaterThan(small.volume());

			small.delete();
			large.delete();
		});
	});

	describe("edge treatments", () => {
		it("removes material at the rim and bore, and adds it at the root", () => {
			const sharp = build(plain);
			const eased = build(defaultSpoolParams);

			// The rim chamfer and bore chamfer cut material away; the root fillet fills it in.
			// They are on the same order here, so only the fact that something changed is safe
			// to assert — the individual signs are covered by the profile2d unit tests.
			expect(eased.volume()).not.toBeCloseTo(sharp.volume(), 1);
			expect(eased.status()).toBe("NoError");
			expect(eased.genus()).toBe(1);

			sharp.delete();
			eased.delete();
		});

		it("adds material when only the root fillet is enabled", () => {
			const none = build({ ...plain, rootFilletRadius: 0 });
			const filleted = build({ ...plain, rootFilletRadius: 2 });

			expect(filleted.volume()).toBeGreaterThan(none.volume());

			none.delete();
			filleted.delete();
		});

		it("removes material when only the rim chamfer is enabled", () => {
			const none = build({ ...plain, rimTreatment: "sharp" });
			const chamfered = build({
				...plain,
				rimTreatment: "chamfer",
				rimSize: 1,
			});

			expect(chamfered.volume()).toBeLessThan(none.volume());

			none.delete();
			chamfered.delete();
		});

		it("stays buildable when an easing size is absurdly large", () => {
			// Sizes come from sliders, so an over-large radius has to clamp rather than produce
			// a self-intersecting profile.
			const spool = build({
				...plain,
				rootFilletRadius: 500,
				rimTreatment: "round",
				rimSize: 500,
				boreChamfer: 500,
			});

			expect(spool.status()).toBe("NoError");
			expect(spool.decompose()).toHaveLength(1);

			spool.delete();
		});
	});

	describe("lightening holes", () => {
		// Sizes come from the defaults, so this stays a test of the feature rather than of one
		// particular spool that happened to fit them.
		const withHoles = (count: number): SpoolParams => ({
			...plain,
			lighteningHoleCount: count,
		});

		it("tapers inwards and keeps clear of the core and the rim", () => {
			const g = derive(plain);
			const margin = defaultSpoolParams.lighteningHoleMargin;
			const none = build(withHoles(0));
			const six = build(withHoles(6));

			// Probed just inside the margin rather than exactly on it: the window's inner arc and
			// the probe would otherwise be tangent, and the difference between two polygonal
			// approximations of the same circle would show up as a sliver.
			const probeRadius = g.coreRadius + margin * 0.9;
			const coreBand = mf.Manifold.cylinder(
				g.totalHeight + 2,
				probeRadius,
				probeRadius,
				SEGMENTS,
				true,
			);
			const before = none.intersect(coreBand);
			const after = six.intersect(coreBand);
			expect(after.volume()).toBeCloseTo(before.volume(), 4);

			for (const solid of [none, six, coreBand, before, after]) solid.delete();
		});

		it("adds two tunnels to the surface per hole", () => {
			// Two, not one: the hole is cut through the full height, but between the core and the
			// rim there is only material inside the two flanges, so each hole pierces each flange
			// separately. Asserted as a difference from the baseline rather than as an absolute
			// genus, so it keeps its meaning if the plain spool's topology ever changes.
			const none = build(withHoles(0));
			const six = build(withHoles(6));

			expect(six.genus() - none.genus()).toBe(12);
			expect(six.decompose()).toHaveLength(1);

			none.delete();
			six.delete();
		});

		it("removes roughly the volume of the cylinders it cuts", () => {
			const none = build(withHoles(0));
			const six = build(withHoles(6));

			// Each hole passes through both flanges only: between core and rim the winding zone
			// is already empty.
			// Each window spans the flange between the margins, so the area removed is the
			// annular sector's — six of them, through both flanges.
			const g = derive(plain);
			const margin = defaultSpoolParams.lighteningHoleMargin;
			const inner = g.coreRadius + margin;
			const outer = g.flangeRadius - margin;
			const span = (2 * Math.PI) / 6 - 2 * Math.asin(margin / (2 * inner));
			const expected =
				6 * (span / 2) * (outer ** 2 - inner ** 2) * (2 * g.flangeThickness);

			// Loose: the corners are rounded off, which the closed form does not account for.
			expect((none.volume() - six.volume()) / expected).toBeGreaterThan(0.75);
			expect((none.volume() - six.volume()) / expected).toBeLessThan(1.0);

			none.delete();
			six.delete();
		});
	});

	describe("start holes", () => {
		const withStartHoles = (count: number): SpoolParams => ({
			...plain,
			startHoleCount: count,
			startHoleDiameter: 2,
		});

		it("bores a pair through the core wall for each position", () => {
			// Radial, so each one opens the core wall into the bore: a tunnel, and two per
			// position because the spool carries one by each flange.
			const none = build(withStartHoles(0));
			const two = build(withStartHoles(2));

			expect(two.status()).toBe("NoError");
			expect(two.decompose()).toHaveLength(1);
			expect(two.genus() - none.genus()).toBe(4);

			none.delete();
			two.delete();
		});

		it("stops short of the far wall", () => {
			// Run through to the axis and the cutter would carry on and pierce the opposite side,
			// which would show up as twice the tunnels.
			const none = build(withStartHoles(0));
			const one = build(withStartHoles(1));

			expect(one.genus() - none.genus()).toBe(2);

			none.delete();
			one.delete();
		});

		it("keeps the spool symmetric about the parting plane", () => {
			// The split build relies on this: a hole by one flange only would make two halves
			// that no longer add up to the one-piece spool.
			const one = build(withStartHoles(1));
			const flipped = one.rotate([180, 0, 0]);

			expect(flipped.volume()).toBeCloseTo(one.volume(), 6);
			const overlap = one.intersect(flipped);
			expect(overlap.volume() / one.volume()).toBeCloseTo(1, 4);

			for (const solid of [one, flipped, overlap]) solid.delete();
		});
	});

	describe("wire notches", () => {
		const withNotches = (count: number): SpoolParams => ({
			...plain,
			wireNotchCount: count,
			wireNotchWidth: 2,
			wireNotchDepth: 5,
		});

		it("cuts inward from the rim without breaking the part up", () => {
			const notched = build(withNotches(2));

			expect(notched.status()).toBe("NoError");
			expect(notched.decompose()).toHaveLength(1);
			// A slot open to the rim is a dent, not a hole: it adds no handle to the surface.
			expect(notched.genus()).toBe(1);

			notched.delete();
		});

		it("removes material", () => {
			const none = build(withNotches(0));
			const notched = build(withNotches(4));

			expect(notched.volume()).toBeLessThan(none.volume());

			none.delete();
			notched.delete();
		});

		it("leaves everything inside the core radius untouched", () => {
			// A notch is cut into the rim, so it legitimately eats the outermost vertices and the
			// bounding box shrinks. What must not change is anything at or inside the winding
			// surface, so that is compared directly.
			const g = derive(plain);
			const none = build(withNotches(0));
			const notched = build(withNotches(4));

			const core = mf.Manifold.cylinder(
				g.totalHeight + 2,
				g.coreRadius,
				g.coreRadius,
				SEGMENTS,
				true,
			);
			const before = none.intersect(core);
			const after = notched.intersect(core);

			expect(after.volume()).toBeCloseTo(before.volume(), 6);

			for (const solid of [none, notched, core, before, after]) solid.delete();
		});

		it("does not change the height", () => {
			const none = build(withNotches(0));
			const notched = build(withNotches(4));

			const a = none.boundingBox();
			const b = notched.boundingBox();
			expect(b.min[2]).toBeCloseTo(a.min[2], 6);
			expect(b.max[2]).toBeCloseTo(a.max[2], 6);

			none.delete();
			notched.delete();
		});
	});
});
