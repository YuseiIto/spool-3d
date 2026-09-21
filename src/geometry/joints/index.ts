import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { dowelFeatures } from "~/geometry/joints/dowel";
import {
	alternatingSectors,
	radialLapRegion,
	slabParting,
} from "~/geometry/joints/partingRegion";
import { waveParting } from "~/geometry/joints/wave";
import { Scratch } from "~/geometry/scratch";
import type { SpoolGeometry } from "~/params/derive";
import { dowelCircleRadius } from "~/params/derive";
import type { SpoolParams } from "~/params/schema";

/**
 * How one half of a split spool is carved out of the whole.
 *
 * `keep` is intersected with the spool, then `add` is unioned on and `remove` subtracted. A joint
 * only has to supply shapes that are unchanged by the assembly mirror — see `~/geometry/mirror`
 * — and the single-part property follows.
 */
export interface JointSolids {
	keep: Manifold;
	add?: Manifold;
	remove?: Manifold;
}

export function jointSolids(
	mf: ManifoldToplevel,
	params: SpoolParams,
	g: SpoolGeometry,
	circularSegments: number,
): JointSolids {
	const scratch = new Scratch();
	try {
		const solids = carve(mf, scratch, params, g, circularSegments);
		scratch.releaseAll(solids.keep, solids.add, solids.remove);
		return solids;
	} catch (cause) {
		scratch.releaseAll();
		throw cause;
	}
}

function carve(
	mf: ManifoldToplevel,
	scratch: Scratch,
	params: SpoolParams,
	g: SpoolGeometry,
	circularSegments: number,
): JointSolids {
	// Comfortably larger than the spool in every direction, so half-space stand-ins never clip it.
	const extent = 4 * (g.flangeRadius + g.totalHeight);
	const clearance = params.joint === "none" ? 0 : params.jointClearance;

	switch (params.joint) {
		case "none":
			return { keep: flatParting(mf, scratch, extent) };

		case "tabs":
			return {
				keep: slabParting(
					mf,
					scratch,
					scratch.hold(
						alternatingSectors(
							mf,
							scratch,
							params.stepCount,
							g.flangeRadius + 1,
						),
					),
					params.stepHeight / 2,
					clearance,
					extent,
				),
			};

		case "sleeve":
			return {
				keep: slabParting(
					mf,
					scratch,
					scratch.hold(
						radialLapRegion(
							mf,
							scratch,
							params.lapCount,
							lapSplitRadius(g),
							g.flangeRadius + 1,
							circularSegments,
						),
					),
					// Half, because the seam reaches this far either side of the parting plane
					// and the parameter is the total depth the halves engage.
					params.lapLength / 2,
					clearance,
					extent,
				),
			};

		case "wave":
			return {
				keep: waveParting(mf, {
					count: params.waveCount,
					amplitude: params.waveAmplitude,
					clearance,
					// Inside the bore, where there is no material to get wrong.
					innerRadius: g.boreRadius / 2,
					outerRadius: g.flangeRadius + 1,
					depth: extent,
					circularSegments,
				}),
			};

		case "dowel": {
			const features = dowelFeatures(mf, {
				count: params.dowelCount,
				pinRadius: params.dowelDiameter / 2,
				pinHeight: params.dowelHeight,
				circleRadius: dowelCircleRadius(params, g),
				clearance,
				circularSegments,
			});
			return {
				keep: flatParting(mf, scratch, extent),
				add: features.pins,
				remove: features.sockets,
			};
		}
	}
}

/** Everything below the parting plane. The region is a stand-in; only the half-space matters. */
function flatParting(
	mf: ManifoldToplevel,
	scratch: Scratch,
	extent: number,
): Manifold {
	const stub = scratch.hold(mf.CrossSection.circle(1, 8));
	return slabParting(mf, scratch, stub, 0, 0, extent);
}

/** Radius of the cylindrical mating face of a radial lap: halfway through the core. */
function lapSplitRadius(g: SpoolGeometry): number {
	return (g.boreRadius + g.coreRadius) / 2;
}
