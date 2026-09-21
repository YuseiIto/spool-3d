import { describe, expect, it } from "vitest";
import { expandCorners, SEGMENTS_PER_QUARTER_TURN } from "~/profile2d/corners";
import type {
	CornerTreatment,
	ProfileContour,
	ProfilePoint,
	ProfileVertex,
} from "~/profile2d/types";

const signedArea = (contour: ProfileContour): number => {
	let total = 0;
	for (let i = 0; i < contour.length; i++) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		if (!a || !b) continue;
		total += a[0] * b[1] - b[0] * a[1];
	}
	return total / 2;
};

/**
 * Area between a quarter arc and the chords that approximate it.
 *
 * The expander samples arcs, so a filleted corner never has exactly the closed-form area. This
 * is the sum of the circular segments the chords cut off, and applying it is what makes the
 * assertions test the geometry rather than the sampling resolution.
 */
const quarterArcChordDeficit = (radius: number): number => {
	const step = Math.PI / 2 / SEGMENTS_PER_QUARTER_TURN;
	return (
		SEGMENTS_PER_QUARTER_TURN * (radius ** 2 / 2) * (step - Math.sin(step))
	);
};

const sharp = (point: ProfilePoint): ProfileVertex => ({
	point,
	treatment: "sharp",
	size: 0,
});

const eased = (
	point: ProfilePoint,
	treatment: CornerTreatment,
	size: number,
): ProfileVertex => ({ point, treatment, size });

/** 10 x 10 square, counter-clockwise. Every corner is a right angle, as the spool's are. */
const square = (first: ProfileVertex): ProfileVertex[] => [
	first,
	sharp([10, 0]),
	sharp([10, 10]),
	sharp([0, 10]),
];

describe("expandCorners", () => {
	it("leaves a sharp contour untouched", () => {
		const vertices = square(sharp([0, 0]));
		expect(expandCorners(vertices)).toEqual(vertices.map((v) => v.point));
	});

	it("removes the expected area when rounding a convex right angle", () => {
		const radius = 2;
		const rounded = expandCorners(square(eased([0, 0], "round", radius)));

		// A right-angle fillet removes the corner square minus the quarter disc it leaves behind;
		// the sampled chords cut just inside that disc, taking a little more.
		const removed = radius ** 2 - (Math.PI * radius ** 2) / 4;
		expect(signedArea(rounded)).toBeCloseTo(
			100 - removed - quarterArcChordDeficit(radius),
			6,
		);
	});

	it("removes the expected area when chamfering a convex right angle", () => {
		const leg = 3;
		const chamfered = expandCorners(square(eased([0, 0], "chamfer", leg)));

		expect(chamfered).toHaveLength(5);
		expect(signedArea(chamfered)).toBeCloseTo(100 - leg ** 2 / 2, 6);
	});

	it("adds area when rounding a concave right angle", () => {
		// An L: the vertex at (5, 5) turns the wrong way, so its wedge is the notch outside the
		// polygon and the fillet has to fill material in rather than cut it away.
		const radius = 1.5;
		const shape: ProfileVertex[] = [
			sharp([0, 0]),
			sharp([10, 0]),
			sharp([10, 5]),
			eased([5, 5], "round", radius),
			sharp([5, 10]),
			sharp([0, 10]),
		];

		const plain = signedArea(shape.map((v) => v.point));
		const filleted = signedArea(expandCorners(shape));

		// Mirror of the convex case: here the chords fall on the far side of the arc, so they
		// fill in slightly more than the ideal fillet would.
		const added = radius ** 2 - (Math.PI * radius ** 2) / 4;
		expect(filleted).toBeCloseTo(
			plain + added + quarterArcChordDeficit(radius),
			6,
		);
	});

	it("clamps a fillet to half the shortest adjacent edge", () => {
		// Two corners share an edge, so half is the largest either can take without overlapping.
		const huge = expandCorners(square(eased([0, 0], "round", 500)));
		const atLimit = expandCorners(square(eased([0, 0], "round", 5)));

		expect(signedArea(huge)).toBeCloseTo(signedArea(atLimit), 6);
		for (const [x, y] of huge) {
			expect(Number.isFinite(x)).toBe(true);
			expect(Number.isFinite(y)).toBe(true);
			expect(x).toBeGreaterThanOrEqual(-1e-9);
			expect(y).toBeGreaterThanOrEqual(-1e-9);
		}
	});

	it("keeps the contour counter-clockwise", () => {
		// Manifold's default fill rule reads a counter-clockwise outer contour as solid, so an
		// easing operation that flipped the winding would invert the whole solid.
		expect(
			signedArea(expandCorners(square(eased([0, 0], "round", 2)))),
		).toBeGreaterThan(0);
		expect(
			signedArea(expandCorners(square(eased([0, 0], "chamfer", 2)))),
		).toBeGreaterThan(0);
	});

	it("treats a zero size as sharp", () => {
		const vertices = square(eased([0, 0], "round", 0));
		expect(expandCorners(vertices)).toEqual(vertices.map((v) => v.point));
	});
});
