import { derive } from "~/params/derive";
import type { SpoolParams } from "~/params/schema";

/**
 * Oracles for the geometry tests. Kept out of the test files themselves so every suite compares
 * against the same closed-form model, and deliberately derived from the parameters rather than
 * from anything in the build pipeline — an oracle that reuses the implementation proves nothing.
 *
 * Nothing in the application imports this module.
 */

/**
 * Revolving a contour produces a prism over a regular K-gon inscribed in the circle, whose area
 * falls short of the ideal by this factor. Any assertion comparing a revolved volume against a
 * closed-form one has to apply it, or it is really asserting the segment count.
 */
export function inscribedPolygonAreaRatio(segments: number): number {
	return (segments / (2 * Math.PI)) * Math.sin((2 * Math.PI) / segments);
}

/**
 * Strips everything whose contribution to the volume has no simple closed form, leaving the bare
 * I-beam that `analyticSpoolVolume` describes.
 *
 * Fillets, chamfers and cut features are each verified by their own targeted assertions; mixing
 * them into the volume oracle would turn it into a second implementation of the builder, which
 * would then agree with the builder's bugs.
 */
export function withoutEasingOrFeatures(params: SpoolParams): SpoolParams {
	return {
		...params,
		rootFilletRadius: 0,
		rimTreatment: "sharp",
		rimSize: 0,
		boreChamfer: 0,
		lighteningHoleCount: 0,
		wireNotchCount: 0,
		startHoleCount: 0,
	};
}

/** Closed-form volume of the plain spool: two flange annuli plus the core annulus. */
export function analyticSpoolVolume(
	params: SpoolParams,
	segments: number,
): number {
	const g = derive(params);
	const annulus = (outer: number, inner: number) =>
		Math.PI * (outer ** 2 - inner ** 2);

	const flanges = 2 * annulus(g.flangeRadius, g.boreRadius) * g.flangeThickness;
	const core = annulus(g.coreRadius, g.boreRadius) * (2 * g.windingHalfWidth);

	return (flanges + core) * inscribedPolygonAreaRatio(segments);
}
