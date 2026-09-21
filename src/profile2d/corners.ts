import type {
	ProfileContour,
	ProfilePoint,
	ProfileVertex,
} from "~/profile2d/types";

/** Corners shallower than this are treated as straight; easing them would do nothing. */
const MIN_TURN_RADIANS = 1e-6;

/**
 * Fraction of an adjacent edge a corner may consume.
 *
 * Two corners share an edge, so letting each take half is the most that can never make them
 * overlap. Oversized values are clamped to this rather than rejected: sizes are driven by
 * sliders, and a corner that silently stops growing reads far better than a preview that
 * vanishes mid-drag.
 */
const MAX_EDGE_FRACTION = 0.5;

/**
 * Largest size a corner will actually take, given the lengths of the two edges meeting there.
 *
 * Exported so the rules can tell the user when a value is being clamped without restating the
 * arithmetic — restating it is how they came to disagree, with the rules calling a radius twice
 * the real limit acceptable and the corner quietly stopping halfway.
 *
 * Holds as a radius as well as a leg length because every corner of the spool's profile is a right
 * angle, where the two are equal.
 */
export function maxCornerSize(previousEdge: number, nextEdge: number): number {
	return MAX_EDGE_FRACTION * Math.min(previousEdge, nextEdge);
}

/**
 * Segments used for a quarter turn. The spool's corners are all right angles, so this is the
 * resolution a fillet actually gets.
 *
 * Exported because an arc sampled this coarsely differs measurably in area from the ideal one,
 * so tests asserting against closed-form areas have to correct for it.
 */
export const SEGMENTS_PER_QUARTER_TURN = 8;

/**
 * Expands per-vertex fillets and chamfers into a plain polygon.
 *
 * Works for convex and concave corners alike, because the construction is the same in both
 * cases: the arc centre sits on the bisector of the wedge between the two edges. At a convex
 * corner that wedge is the interior, so the arc cuts material away; at a concave one it is the
 * notch, so the arc fills material in — which is exactly a root fillet.
 */
export function expandCorners(
	vertices: readonly ProfileVertex[],
): ProfileContour {
	const out: ProfilePoint[] = [];

	for (let i = 0; i < vertices.length; i++) {
		const current = vertices[i];
		const previous = vertices[(i - 1 + vertices.length) % vertices.length];
		const next = vertices[(i + 1) % vertices.length];
		if (!current || !previous || !next) continue;

		out.push(...expandCorner(previous.point, current, next.point));
	}

	return out;
}

function expandCorner(
	previous: ProfilePoint,
	vertex: ProfileVertex,
	next: ProfilePoint,
): ProfilePoint[] {
	const [vx, vy] = vertex.point;
	if (vertex.treatment === "sharp" || vertex.size <= 0) return [vertex.point];

	const toPrevious = direction(vertex.point, previous);
	const toNext = direction(vertex.point, next);
	if (!toPrevious || !toNext) return [vertex.point];

	// Unsigned angle of the wedge between the two edges, always in (0, pi).
	const half = Math.acos(clamp(dot(toPrevious, toNext), -1, 1)) / 2;
	if (half < MIN_TURN_RADIANS || Math.PI / 2 - half < MIN_TURN_RADIANS) {
		return [vertex.point];
	}

	const maxLeg = maxCornerSize(
		distance(vertex.point, previous),
		distance(vertex.point, next),
	);

	if (vertex.treatment === "chamfer") {
		const leg = Math.min(vertex.size, maxLeg);
		return [
			along(vertex.point, toPrevious, leg),
			along(vertex.point, toNext, leg),
		];
	}

	// Tangent length of a fillet of this radius at this angle.
	const leg = Math.min(vertex.size / Math.tan(half), maxLeg);
	const radius = leg * Math.tan(half);

	const start = along(vertex.point, toPrevious, leg);
	const end = along(vertex.point, toNext, leg);

	const bisector = normalise([
		toPrevious[0] + toNext[0],
		toPrevious[1] + toNext[1],
	]);
	if (!bisector) return [vertex.point];

	const centre: ProfilePoint = [
		vx + (bisector[0] * radius) / Math.sin(half),
		vy + (bisector[1] * radius) / Math.sin(half),
	];

	return arc(centre, start, end, radius);
}

/**
 * Samples the arc from `start` to `end` about `centre`, always taking the shorter sweep.
 *
 * A corner fillet never turns more than half a circle — the arc angle is pi minus the interior
 * angle — so the shorter sweep is the right one at convex and concave corners alike, and picking
 * it removes any need to reason about winding direction here.
 */
function arc(
	centre: ProfilePoint,
	start: ProfilePoint,
	end: ProfilePoint,
	radius: number,
): ProfilePoint[] {
	const from = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
	const to = Math.atan2(end[1] - centre[1], end[0] - centre[0]);

	let sweep = to - from;
	while (sweep > Math.PI) sweep -= 2 * Math.PI;
	while (sweep < -Math.PI) sweep += 2 * Math.PI;

	const steps = Math.max(
		1,
		Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * SEGMENTS_PER_QUARTER_TURN),
	);

	const points: ProfilePoint[] = [];
	for (let step = 0; step <= steps; step++) {
		const angle = from + (sweep * step) / steps;
		points.push([
			centre[0] + radius * Math.cos(angle),
			centre[1] + radius * Math.sin(angle),
		]);
	}
	return points;
}

type Vector = readonly [number, number];

function direction(from: ProfilePoint, to: ProfilePoint): Vector | null {
	return normalise([to[0] - from[0], to[1] - from[1]]);
}

function normalise(vector: Vector): Vector | null {
	const length = Math.hypot(vector[0], vector[1]);
	return length === 0 ? null : [vector[0] / length, vector[1] / length];
}

function dot(a: Vector, b: Vector): number {
	return a[0] * b[0] + a[1] * b[1];
}

function distance(a: ProfilePoint, b: ProfilePoint): number {
	return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function along(from: ProfilePoint, unit: Vector, length: number): ProfilePoint {
	return [from[0] + unit[0] * length, from[1] + unit[1] * length];
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}
