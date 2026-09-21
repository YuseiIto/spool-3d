import type { SpoolParams } from "~/params/schema";
import { maxCornerSize } from "~/profile2d/corners";

/**
 * The spool expressed the way the geometry layer needs it: radii, and z coordinates in a frame
 * centred on the parting plane.
 *
 * Centring on z = 0 is what makes the split mode work — the two halves are related by a mirror
 * through this plane, so any frame that does not put it at the origin turns that symmetry into
 * an offset every joint would have to carry.
 */
export interface SpoolGeometry {
	boreRadius: number;
	coreRadius: number;
	flangeRadius: number;
	flangeThickness: number;
	/** Inner faces of the flanges sit at ±this. */
	windingHalfWidth: number;
	/** Outer faces of the flanges sit at ±this. */
	halfHeight: number;
	totalHeight: number;
}

/**
 * Where the ring of dowels sits, radially.
 *
 * Zero means "choose for me", which puts the ring midway through the material available at the
 * parting plane.
 */
export function dowelCircleRadius(
	params: SpoolParams,
	g: SpoolGeometry,
): number {
	if (params.dowelCircleDiameter > 0) return params.dowelCircleDiameter / 2;
	return (g.boreRadius + g.coreRadius) / 2;
}

/**
 * Largest root fillet the profile will actually take.
 *
 * The root corner sits between the core surface and the inner face of a flange, so its two edges
 * are the winding depth and the distance to the opposite root — and a corner may consume half of
 * the shorter one. Sizes past this are clamped by `expandCorners` rather than rejected, so this is
 * what the rules use to say so.
 */
export function rootFilletRoom(g: SpoolGeometry): number {
	return maxCornerSize(g.flangeRadius - g.coreRadius, 2 * g.windingHalfWidth);
}

/** Where one lightening window sits, and how far its corners may be rounded. */
export interface WindowGeometry {
	/** Radii of the two arcs that bound the window. */
	inner: number;
	outer: number;
	/** Angular half-width, in radians. */
	halfSpan: number;
	/**
	 * Largest corner radius the window can carry.
	 *
	 * The rounding is built by dilating the region the corner arcs' centres sweep, so the limit is
	 * whatever keeps that region from collapsing: the centres must fit between the two arcs, and
	 * they must stay clear of the radial edges by the radius itself.
	 */
	maxCornerRadius: number;
}

/**
 * Places the lightening windows, or reports that the margins leave no room for one.
 *
 * Shared between the builder and the rules rather than worked out twice. They did disagree, and
 * the disagreement was not visible as a wrong number anywhere: the rules called an oversized
 * corner radius merely excessive while the builder, given the same radius, turned the cutter
 * inside out and erased the spool.
 */
export function lighteningWindow(
	params: SpoolParams,
	g: SpoolGeometry,
): WindowGeometry | null {
	if (params.lighteningHoleCount <= 0) return null;

	const margin = params.lighteningHoleMargin;
	const inner = g.coreRadius + margin;
	const outer = g.flangeRadius - margin;
	if (outer - inner <= 0) return null;

	// The webs between neighbours are kept to the same margin, measured along the inner arc where
	// the gap is tightest.
	const pitch = (2 * Math.PI) / params.lighteningHoleCount;
	const halfSpan = pitch / 2 - Math.asin(Math.min(1, margin / (2 * inner)));
	if (halfSpan <= 0) return null;

	return {
		inner,
		outer,
		halfSpan,
		maxCornerRadius: cornerRoom(inner, outer, halfSpan),
	};
}

/**
 * Slack left in the region the corner arcs' centres sweep.
 *
 * At the largest radius a window can physically take, arcs from opposite corners meet and that
 * region collapses to a curve — and a closed path enclosing no area has no meaningful outward
 * offset, so the cap is drawn just short of it. A micron is orders of magnitude below what any
 * printer resolves, and the shape it yields is the fully rounded one the limit describes.
 */
const CENTRES_SLACK_MM = 0.001;

function cornerRoom(inner: number, outer: number, halfSpan: number): number {
	const betweenArcs = (outer - inner) / 2;

	// Clearing a radial edge by `r` costs a turn of asin(r / rho), which is steepest at the inner
	// arc. Past a quarter turn the edges no longer bound the window from the front, so only the
	// arcs limit it.
	const sin = Math.sin(halfSpan);
	const besideEdges =
		halfSpan >= Math.PI / 2
			? Number.POSITIVE_INFINITY
			: (inner * sin) / (1 - sin);

	return Math.max(0, Math.min(betweenArcs, besideEdges) - CENTRES_SLACK_MM);
}

export function derive(params: SpoolParams): SpoolGeometry {
	const { flangeThickness, windingWidth } = params;
	const totalHeight = 2 * flangeThickness + windingWidth;

	return {
		boreRadius: params.boreDiameter / 2,
		coreRadius: params.coreDiameter / 2,
		flangeRadius: params.flangeDiameter / 2,
		flangeThickness,
		windingHalfWidth: windingWidth / 2,
		halfHeight: totalHeight / 2,
		totalHeight,
	};
}
