import { describe, expect, it } from "vitest";
import { initManifold } from "~/geometry/runtime";

/**
 * A revolved circle is a regular K-gon inscribed in it, so the solid is smaller than the ideal
 * one by a fixed factor. Every analytic volume assertion in the geometry suite has to be scaled
 * by this, otherwise it is really asserting the segment count.
 */
const inscribedPolygonAreaRatio = (segments: number) =>
	(segments / (2 * Math.PI)) * Math.sin((2 * Math.PI) / segments);

describe("manifold runtime", () => {
	it("revolves a cross-section about its Y axis and yields Z as the solid's axis", async () => {
		const { CrossSection } = await initManifold();

		// A cross-section point is read as [radius, height]: the whole geometry layer depends on
		// this, so it is pinned by measurement rather than by trusting the documentation.
		const innerRadius = 4;
		const outerRadius = 10;
		const bottom = -3;
		const top = 7;
		const segments = 128;

		const tube = new CrossSection([
			[
				[innerRadius, bottom],
				[outerRadius, bottom],
				[outerRadius, top],
				[innerRadius, top],
			],
		]).revolve(segments);

		const { min, max } = tube.boundingBox();

		expect(max[2]).toBeCloseTo(top, 6);
		expect(min[2]).toBeCloseTo(bottom, 6);
		expect(max[0]).toBeCloseTo(outerRadius, 3);
		expect(min[0]).toBeCloseTo(-outerRadius, 3);
		expect(max[1]).toBeCloseTo(outerRadius, 3);

		const ratio = inscribedPolygonAreaRatio(segments);
		const expectedVolume =
			Math.PI * (outerRadius ** 2 - innerRadius ** 2) * (top - bottom) * ratio;
		expect(tube.volume()).toBeCloseTo(expectedVolume, 1);

		// A tube is a torus topologically: one through-hole.
		expect(tube.genus()).toBe(1);

		tube.delete();
	});
});
