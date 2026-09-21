import type {
	CrossSection,
	Manifold,
	ManifoldToplevel,
	Vec2,
} from "manifold-3d";
import type { Scratch } from "~/geometry/scratch";

/**
 * Builds the plan-view region that one half of an interlocking seam occupies.
 *
 * The seam lives in a slab of thickness `2 * reach` centred on z = 0. Within that slab the part
 * keeps the material over a region R of the xy-plane, and its mate — the same part turned over —
 * keeps the material over the complement of R. For that to work R must satisfy
 * `mirrorInY(R) = complement(R)`, which is the plan-view form of the odd-function condition in
 * `~/geometry/mirror`.
 *
 * Both step joints reduce to a choice of R, which is why they share this module rather than each
 * carrying their own solid modelling.
 *
 * Every function here takes the caller's `Scratch`, because each one builds several kernel objects
 * on the way to the one it returns and none of them are freed by going out of scope.
 */

/** Half-angle, in degrees, of one alternating sector when there are `count` of them. */
const sectorSpan = (count: number) => 180 / count;

/**
 * Wedges that alternate around the axis, the first starting at angle zero.
 *
 * Mirroring in Y maps the wedge spanning `(0, s)` onto `(-s, 0)`, which is the gap beside it, and
 * so on around the circle — so the complement condition holds for any count.
 */
export function alternatingSectors(
	mf: ManifoldToplevel,
	scratch: Scratch,
	count: number,
	radius: number,
): CrossSection {
	const span = sectorSpan(count);
	const wedges = scratch.holdAll(
		Array.from({ length: count }, (_, index) =>
			pie(mf, radius, index * 2 * span, span),
		),
	);
	return mf.CrossSection.union(wedges);
}

/**
 * A radial lap: the outer part of the wall in one set of sectors, the inner part in the others.
 *
 * Mirroring swaps which sectors are which, so each part presents outer wall where its mate
 * presents inner. Unlike the axial step, the mating faces are cylindrical, so the joint also
 * locates the two halves concentrically.
 */
export function radialLapRegion(
	mf: ManifoldToplevel,
	scratch: Scratch,
	count: number,
	splitRadius: number,
	outerRadius: number,
	circularSegments: number,
): CrossSection {
	const inner = scratch.hold(
		mf.CrossSection.circle(splitRadius, circularSegments),
	);
	const outer = scratch.hold(
		mf.CrossSection.circle(outerRadius, circularSegments),
	);
	const sectors = scratch.hold(
		alternatingSectors(mf, scratch, count, outerRadius),
	);

	// Outer ring where the sectors are, inner disc where they are not.
	const ring = scratch.hold(outer.subtract(inner));
	const outerPart = scratch.hold(ring.intersect(sectors));
	const innerPart = scratch.hold(inner.subtract(sectors));
	return outerPart.add(innerPart);
}

/**
 * Turns a plan-view region into the solid one part occupies.
 *
 * `reach` is how far the seam departs from z = 0 in each direction; the part is everything below
 * the slab, plus the region inside it.
 *
 * The clearance is taken off R in the plane rather than off the finished solid. That keeps the
 * horizontal faces at `±reach` meeting flush — so the flanges seat and the winding width is
 * unchanged — while opening a gap of exactly `clearance` between the vertical faces that have to
 * slide past each other. Eroding the solid in 3D would thin those horizontal faces too and leave
 * the assembled spool loose along its axis.
 */
export function slabParting(
	mf: ManifoldToplevel,
	scratch: Scratch,
	region: CrossSection,
	reach: number,
	clearance: number,
	extent: number,
): Manifold {
	const box = scratch.hold(
		mf.Manifold.cube([2 * extent, 2 * extent, extent], true),
	);
	const below = scratch.hold(box.translate([0, 0, -reach - extent / 2]));

	if (reach === 0) return below;

	const kept =
		clearance > 0
			? scratch.hold(region.offset(-clearance / 2, "Miter"))
			: region;
	const slab = scratch.hold(kept.extrude(2 * reach));
	const seated = scratch.hold(slab.translate([0, 0, -reach]));

	return below.add(seated);
}

/** Circular sector starting at `startDegrees` and spanning `spanDegrees`. */
function pie(
	mf: ManifoldToplevel,
	radius: number,
	startDegrees: number,
	spanDegrees: number,
): CrossSection {
	// Enough facets that the straight edges of the fan never cut inside the radius that matters.
	const steps = Math.max(2, Math.ceil(spanDegrees / 5));
	const reach = radius / Math.cos((Math.PI * spanDegrees) / (180 * steps) / 2);

	const points: Vec2[] = [[0, 0]];
	for (let step = 0; step <= steps; step++) {
		const degrees = startDegrees + (spanDegrees * step) / steps;
		const radians = (Math.PI * degrees) / 180;
		points.push([reach * Math.cos(radians), reach * Math.sin(radians)]);
	}

	return new mf.CrossSection([points]);
}
