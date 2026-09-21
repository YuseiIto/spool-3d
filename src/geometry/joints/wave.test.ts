import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { waveParting } from "~/geometry/joints/wave";
import { turnedOver } from "~/geometry/mirror";
import { initManifold } from "~/geometry/runtime";
import { inscribedPolygonAreaRatio } from "~/geometry/testSupport";

const base = {
	count: 3,
	amplitude: 3,
	clearance: 0,
	innerRadius: 2,
	outerRadius: 20,
	depth: 50,
	circularSegments: 96,
};

describe("waveParting", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	/**
	 * The flat case first. `Manifold.ofMesh` throws on a mesh that is not an oriented
	 * two-manifold, so getting the winding wrong anywhere fails loudly — but a *consistently*
	 * inverted solid would not, and its volume would come out negative. Checking the degenerate
	 * case against a closed form pins both before the sine is allowed to complicate things.
	 */
	it("is a correctly oriented tube when the wave is flat", () => {
		const flat = waveParting(mf, { ...base, amplitude: 0, count: 1 });
		const samples = base.circularSegments;

		expect(flat.status()).toBe("NoError");
		expect(flat.genus()).toBe(1);

		const expected =
			Math.PI *
			(base.outerRadius ** 2 - base.innerRadius ** 2) *
			base.depth *
			inscribedPolygonAreaRatio(samples);
		expect(flat.volume() / expected).toBeCloseTo(1, 2);

		flat.delete();
	});

	it("builds a valid solid with the wave enabled", () => {
		const wave = waveParting(mf, base);

		expect(wave.status()).toBe("NoError");
		expect(wave.genus()).toBe(1);
		expect(wave.volume()).toBeGreaterThan(0);

		wave.delete();
	});

	it("keeps the mean height at the undisturbed level", () => {
		// A sine averages to zero over whole periods, so the wave must not add or remove volume
		// relative to a flat seam at the same level.
		const flat = waveParting(mf, { ...base, amplitude: 0 });
		const wave = waveParting(mf, base);

		expect(wave.volume() / flat.volume()).toBeCloseTo(1, 3);

		flat.delete();
		wave.delete();
	});

	it("partitions space with its own turned-over copy", () => {
		// The property the whole split design rests on, checked on the seam solid alone: the
		// region below the seam and the region below the mirrored seam must not overlap, and
		// together they must fill the slab.
		const part = waveParting(mf, base);
		const mate = turnedOver(part);

		const overlap = part.intersect(mate);
		expect(overlap.volume()).toBeCloseTo(0, 4);

		const total = part.add(mate);
		const slab = mf.Manifold.cylinder(
			2 * base.depth,
			base.outerRadius,
			base.outerRadius,
			96,
			true,
		);
		const bore = mf.Manifold.cylinder(
			4 * base.depth,
			base.innerRadius,
			base.innerRadius,
			96,
			true,
		);
		const expected = slab.subtract(bore);

		// Same volume means the two halves leave nothing behind between them.
		expect(total.volume() / expected.volume()).toBeCloseTo(1, 2);

		for (const solid of [part, mate, overlap, total, slab, bore, expected]) {
			solid.delete();
		}
	});

	it("opens a gap of the requested clearance", () => {
		const clearance = 0.4;
		const part = waveParting(mf, { ...base, clearance });
		const mate = turnedOver(part);

		expect(part.intersect(mate).volume()).toBeCloseTo(0, 4);

		// Closing the parts by slightly less than the clearance must still not make them touch;
		// by slightly more, it must. That brackets the gap rather than assuming it.
		const nearlyClosed = mate.translate([0, 0, -clearance * 0.8]);
		const overClosed = mate.translate([0, 0, -clearance * 1.5]);

		expect(part.intersect(nearlyClosed).volume()).toBeCloseTo(0, 4);
		expect(part.intersect(overClosed).volume()).toBeGreaterThan(0);

		for (const solid of [part, mate, nearlyClosed, overClosed]) solid.delete();
	});
});
