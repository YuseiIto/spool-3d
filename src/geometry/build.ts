import type { Manifold, ManifoldToplevel, Vec2 } from "manifold-3d";
import { featureCutters } from "~/geometry/features";
import { derive } from "~/params/derive";
import type { SpoolParams } from "~/params/schema";
import { spoolCrossSection } from "~/profile2d/spoolProfile";
import type { ProfileContour } from "~/profile2d/types";

/**
 * Builds the one-piece spool.
 *
 * The Manifold toplevel is passed in rather than reached for, so callers control when the WASM
 * module is instantiated and tests can hold a single instance across a whole suite.
 *
 * `circularSegments` is passed explicitly instead of going through Manifold's global circular
 * defaults: global resolution state makes concurrent builds in the worker interfere with each
 * other and makes test results depend on execution order.
 */
export function buildSpool(
	mf: ManifoldToplevel,
	params: SpoolParams,
	circularSegments: number,
): Manifold {
	const geometry = derive(params);
	const section = new mf.CrossSection([
		toPolygon(spoolCrossSection(params, geometry)),
	]);
	const body = section.revolve(circularSegments);
	section.delete();

	const cutters = featureCutters(mf, params, geometry, circularSegments);
	if (!cutters) return body;

	try {
		return body.subtract(cutters);
	} finally {
		cutters.delete();
		body.delete();
	}
}

const toPolygon = (contour: ProfileContour): Vec2[] =>
	contour.map(([radius, height]) => [radius, height] as Vec2);
