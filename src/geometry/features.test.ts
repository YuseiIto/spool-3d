import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSpool } from "~/geometry/build";
import { initManifold } from "~/geometry/runtime";
import { derive, lighteningWindow } from "~/params/derive";
import { checkParams } from "~/params/rules";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

const SEGMENTS = 128;

/** Corner radii spanning the slider's whole range, well past what any window can take. */
const RADII = [0, 0.5, 1, 2, 3, 4, 4.5, 5, 6, 8, 12, 15];

describe("lightening windows", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	const volumeOf = (params: SpoolParams): number => {
		const spool = buildSpool(mf, params, SEGMENTS);
		try {
			expect(spool.status()).toBe("NoError");
			return spool.volume();
		} finally {
			spool.delete();
		}
	};

	const windowed = (cornerRadius: number): SpoolParams => ({
		...defaultSpoolParams,
		split: false,
		lighteningHoleCount: 6,
		lighteningHoleCornerRadius: cornerRadius,
	});

	/*
	 * The failure this guards against is not a wrong shape but an inverted one.
	 *
	 * The corner rounding used to be a morphological opening, which turns into its own complement
	 * once the radius outgrows the window — so the cutter became larger than the spool and
	 * subtracting it left nothing at all. Nothing about that reads as a bug from inside the
	 * builder: the result is a perfectly valid empty manifold.
	 */
	it("never lets the corner radius cut away the spool", () => {
		const solid = volumeOf({ ...defaultSpoolParams, split: false });

		for (const radius of RADII) {
			const volume = volumeOf(windowed(radius));
			expect(volume, `radius ${radius}`).toBeGreaterThan(solid / 2);
			expect(volume, `radius ${radius}`).toBeLessThan(solid);
		}
	});

	// Rounding a corner puts material back, so the spool can only get heavier — and once the arcs
	// meet, further radius has nothing left to round and the shape stops changing.
	it("rounds the corners monotonically, then stops", () => {
		const volumes = RADII.map((radius) => volumeOf(windowed(radius)));

		for (let i = 1; i < volumes.length; i++) {
			expect(volumes[i] ?? 0, `radius ${RADII[i]}`).toBeGreaterThanOrEqual(
				(volumes[i - 1] ?? 0) - 1e-6,
			);
		}
		expect(volumes.at(-1)).toBeCloseTo(volumes.at(-2) ?? 0, 6);
	});

	// The rules exist to say when a value stops having an effect, which is only true if they agree
	// with the builder about where that is. They did not, and nothing pointed it out.
	it("warns exactly when the builder is clamping the radius", () => {
		const window = lighteningWindow(windowed(0), derive(windowed(0)));
		const limit = window?.maxCornerRadius ?? 0;
		expect(limit).toBeGreaterThan(0);

		const warns = (radius: number) =>
			checkParams(windowed(radius)).some(
				(issue) => issue.code === "HOLE_CORNER_TOO_LARGE",
			);

		expect(warns(limit * 0.99)).toBe(false);
		expect(warns(limit * 1.01)).toBe(true);

		// Under the limit the radius still moves the shape; over it, it does not.
		expect(volumeOf(windowed(limit * 0.9))).toBeLessThan(
			volumeOf(windowed(limit)),
		);
		expect(volumeOf(windowed(limit * 4))).toBeCloseTo(
			volumeOf(windowed(limit)),
			6,
		);
	});
});
