import type {
	CrossSection,
	Manifold,
	ManifoldToplevel,
	Vec2,
} from "manifold-3d";
import { type Scratch, withScratch } from "~/geometry/scratch";
import {
	lighteningWindow,
	type SpoolGeometry,
	type WindowGeometry,
} from "~/params/derive";
import type { SpoolParams } from "~/params/schema";

/**
 * How far a cutter is pushed past the surface it breaks through.
 *
 * Cutting exactly to the surface leaves coplanar faces, which is the classic way to get sliver
 * triangles and ambiguous booleans out of an otherwise sound model.
 */
const OVERSHOOT_MM = 0.5;

/** Points along each arc of a window. Enough that the curve reads as one at any spool size. */
const ARC_SAMPLES = 24;

/**
 * Builds the features that are not surfaces of revolution — windows through the flanges, slots
 * in the rim, holes by the core — as a single solid to subtract.
 *
 * They are unioned first and subtracted once rather than cut one at a time: each boolean is a
 * chance to produce degenerate geometry, and the cost grows with the number of them.
 *
 * Returns `null` when nothing is enabled, so the caller can skip the boolean entirely.
 */
export function featureCutters(
	mf: ManifoldToplevel,
	params: SpoolParams,
	g: SpoolGeometry,
	circularSegments: number,
): Manifold | null {
	return withScratch((scratch) => {
		const cutters = scratch.holdAll(
			[
				lighteningWindows(mf, scratch, params, g),
				wireNotches(mf, scratch, params, g, circularSegments),
				startHoles(mf, scratch, params, g, circularSegments),
			].filter((cutter): cutter is Manifold => cutter !== null),
		);

		const [only] = cutters;
		if (!only) return null;
		return cutters.length === 1 ? only : mf.Manifold.union(cutters);
	});
}

/**
 * Windows through both flanges: annular sectors, tapering inwards, with every corner rounded.
 *
 * Cut through the full height rather than through each flange separately. Between the core and
 * the rim there is no material in the winding zone anyway, so a single through-cut is equivalent
 * and halves the number of solids.
 */
function lighteningWindows(
	mf: ManifoldToplevel,
	scratch: Scratch,
	params: SpoolParams,
	g: SpoolGeometry,
): Manifold | null {
	const window = lighteningWindow(params, g);
	if (!window) return null;

	const height = g.totalHeight + 2 * OVERSHOOT_MM;
	const footprint = scratch.hold(
		roundedSector(mf, scratch, window, params.lighteningHoleCornerRadius),
	);

	return extrudeRing(
		mf,
		scratch,
		footprint,
		params.lighteningHoleCount,
		height,
	);
}

/**
 * One window, centred on the x axis: an annular sector with all four corners rounded.
 *
 * Built as the region swept by the centres of the four corner arcs, then dilated by the radius.
 * A dilation is a positive offset, which can only grow a shape.
 *
 * This replaced a morphological opening — `offset(-r, Round).offset(+r, Round)` — which is the
 * obvious way to round every convex corner at once and is also a trap. Once the radius passes half
 * the window's narrowest dimension the erosion collapses the sector, and Clipper grows its
 * complement back instead: the cutter becomes a solid larger than the spool, and subtracting it
 * leaves nothing. It is the same reason `~/profile2d/corners` expands corners vertex by vertex
 * rather than reaching for an offset pair.
 */
function roundedSector(
	mf: ManifoldToplevel,
	scratch: Scratch,
	window: WindowGeometry,
	cornerRadius: number,
): CrossSection {
	const { inner, outer, halfSpan } = window;
	const radius = Math.min(cornerRadius, window.maxCornerRadius);
	if (radius <= 0) {
		return new mf.CrossSection([
			sectorOutline(inner, outer, halfSpan, halfSpan),
		]);
	}

	// Clearing a radial edge by `radius` costs a turn of asin(radius / rho), and the two arcs are
	// at different radii, so the centres sweep a sector whose two arcs subtend different angles.
	const turn = (rho: number) => Math.asin(Math.min(1, radius / rho));
	const centres = scratch.hold(
		new mf.CrossSection([
			sectorOutline(
				inner + radius,
				outer - radius,
				halfSpan - turn(inner + radius),
				halfSpan - turn(outer - radius),
			),
		]),
	);

	return centres.offset(radius, "Round");
}

/**
 * Outline of an annular sector centred on the x axis, as a closed polygon.
 *
 * The two arcs carry their own half-spans so the same outline serves the window and the region its
 * corner arcs' centres sweep, where the sides are parallel to the radial edges rather than on
 * them.
 *
 * Outer arc first, then back along the inner one: that traversal is counter-clockwise, which is
 * what Manifold's positive fill rule reads as solid. Wound the other way the shape has negative
 * area, and rather than failing it quietly becomes nothing — or, once offset, its complement.
 */
function sectorOutline(
	inner: number,
	outer: number,
	innerHalfSpan: number,
	outerHalfSpan: number,
): Vec2[] {
	const at = (radius: number, angle: number): Vec2 => [
		radius * Math.cos(angle),
		radius * Math.sin(angle),
	];

	const points: Vec2[] = [];
	for (let i = 0; i <= ARC_SAMPLES; i++) {
		points.push(
			at(outer, -outerHalfSpan + (2 * outerHalfSpan * i) / ARC_SAMPLES),
		);
	}
	for (let i = 0; i <= ARC_SAMPLES; i++) {
		points.push(
			at(inner, innerHalfSpan - (2 * innerHalfSpan * i) / ARC_SAMPLES),
		);
	}
	return points;
}

/**
 * Radial slots in the flange rim, for hooking the finished end of the wire.
 *
 * The inner end is rounded rather than square: a square notch puts a stress riser right where
 * the wire pulls, and on a printed part that is where it splits along the layer lines.
 */
function wireNotches(
	mf: ManifoldToplevel,
	scratch: Scratch,
	params: SpoolParams,
	g: SpoolGeometry,
	circularSegments: number,
): Manifold | null {
	const count = params.wireNotchCount;
	if (count <= 0) return null;

	const height = g.totalHeight + 2 * OVERSHOOT_MM;
	const halfWidth = params.wireNotchWidth / 2;
	const innerRadius = g.flangeRadius - params.wireNotchDepth;
	const outerRadius = g.flangeRadius + OVERSHOOT_MM;

	const slot = scratch.hold(
		mf.CrossSection.square(
			[outerRadius - innerRadius, params.wireNotchWidth],
			false,
		),
	);
	const placed = scratch.hold(slot.translate([innerRadius, -halfWidth]));
	const disc = scratch.hold(
		mf.CrossSection.circle(halfWidth, circularSegments),
	);
	const end = scratch.hold(disc.translate([innerRadius, 0]));
	const footprint = scratch.hold(placed.add(end));

	return extrudeRing(mf, scratch, footprint, count, height);
}

/**
 * Holes bored through the core wall towards the axis, for the starting end of the wire.
 *
 * Radial rather than through a flange: the wire is pushed in from the winding surface and comes
 * out inside the bore, so the tail is held by the wall itself and the first turn starts flush
 * against the core instead of climbing over it.
 *
 * A pair is cut at each position, one by each flange. The spool is symmetric about its
 * mid-plane in every other respect, and it has to stay that way — a hole by one flange only
 * would mean the two halves of a split build no longer add up to the one-piece spool, so the
 * same parameters would describe two different objects depending on the build mode.
 *
 * The cutter stops short of the axis on purpose. Run through to the centre and it would carry on
 * and pierce the far wall as well.
 */
function startHoles(
	mf: ManifoldToplevel,
	scratch: Scratch,
	params: SpoolParams,
	g: SpoolGeometry,
	circularSegments: number,
): Manifold | null {
	const count = params.startHoleCount;
	if (count <= 0) return null;

	const radius = params.startHoleDiameter / 2;
	const from = g.boreRadius - OVERSHOOT_MM;
	const to = g.coreRadius + OVERSHOOT_MM;
	if (to <= from) return null;

	// Tucked against the flange, leaving a little material so it does not break into it.
	const height = g.windingHalfWidth - radius - 0.5;
	if (height <= 0) return null;

	// Built along Z, then laid down so it points at the axis.
	const upright = scratch.hold(
		mf.Manifold.cylinder(to - from, radius, radius, circularSegments, true),
	);
	const laid = scratch.hold(upright.rotate([0, 90, 0]));
	const bore = scratch.hold(laid.translate([(from + to) / 2, 0, 0]));
	const above = scratch.hold(bore.translate([0, 0, 2 * height]));
	const pair = scratch.hold(bore.add(above));
	const lowered = scratch.hold(pair.translate([0, 0, -height]));

	return mf.Manifold.union(
		scratch.holdAll(
			ringOf(count, (degrees) => lowered.rotate([0, 0, degrees])),
		),
	);
}

/** Extrudes a footprint through the spool's full height, once at each of `count` positions. */
function extrudeRing(
	mf: ManifoldToplevel,
	scratch: Scratch,
	footprint: CrossSection,
	count: number,
	height: number,
): Manifold {
	const solids = ringOf(count, (degrees) => {
		const turned = scratch.hold(footprint.rotate(degrees));
		const raised = scratch.hold(turned.extrude(height));
		return raised.translate([0, 0, -height / 2]);
	});
	return mf.Manifold.union(scratch.holdAll(solids));
}

/** Places `count` copies evenly around the axis. */
function ringOf<T>(count: number, at: (degrees: number) => T): T[] {
	return Array.from({ length: count }, (_, index) => at((360 * index) / count));
}
