import type { Manifold, ManifoldToplevel } from "manifold-3d";

/** Angular samples per wave period, before the model's own resolution is taken into account. */
const MIN_SAMPLES_PER_PERIOD = 24;

/**
 * The solid below a seam that rises and falls as `amplitude * sin(count * theta)`.
 *
 * Built as an explicit mesh rather than by warping a primitive. The surface has to hold the same
 * height at every radius along a given ray, and no triangulation Manifold would choose for a disc
 * does that — a fan from a centre vertex interpolates the height radially and turns the seam into
 * a cone. Laying the mesh out by hand keeps every radial edge flat.
 *
 * It is a tube, not a disc: the inner radius sits inside the bore, where the spool has no
 * material, which avoids having to close the surface over the axis at all.
 *
 * A sine is an odd function of theta, so this seam already satisfies the mating condition in
 * `~/geometry/mirror` with no phase to choose. Dropping the whole surface by half the clearance
 * leaves the two halves a clearance apart along the axis once assembled.
 */
export function waveParting(
	mf: ManifoldToplevel,
	options: {
		count: number;
		amplitude: number;
		clearance: number;
		innerRadius: number;
		outerRadius: number;
		depth: number;
		/** Resolution of the rest of the model, so the seam is no coarser than the surfaces it cuts. */
		circularSegments: number;
	},
): Manifold {
	const { count, amplitude, clearance, innerRadius, outerRadius, depth } =
		options;

	// Rounded up to an even number: the diagonal rule below pairs sample k with sample
	// samples-1-k, and an odd count would leave the middle one paired with itself.
	const samples =
		2 *
		Math.ceil(
			Math.max(MIN_SAMPLES_PER_PERIOD * count, options.circularSegments) / 2,
		);
	const bottom = -depth;
	const height = (angle: number) =>
		amplitude * Math.sin(count * angle) - clearance / 2;

	// Four vertices per angular sample: inner and outer, bottom and top.
	const positions: number[] = [];
	for (let sample = 0; sample < samples; sample++) {
		const angle = (2 * Math.PI * sample) / samples;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const top = height(angle);

		positions.push(innerRadius * cos, innerRadius * sin, bottom);
		positions.push(outerRadius * cos, outerRadius * sin, bottom);
		positions.push(innerRadius * cos, innerRadius * sin, top);
		positions.push(outerRadius * cos, outerRadius * sin, top);
	}

	const INNER_BOTTOM = 0;
	const OUTER_BOTTOM = 1;
	const INNER_TOP = 2;
	const OUTER_TOP = 3;
	const at = (sample: number, corner: number) =>
		((sample % samples) * 4 + corner) >>> 0;

	const triangles: number[] = [];
	/** Quad wound so that (b - a) x (c - a) points out of the solid. */
	const quad = (a: number, b: number, c: number, d: number) => {
		triangles.push(a, b, c, a, c, d);
	};

	/**
	 * Splits a quad of the seam surface, choosing the diagonal so the whole surface is unchanged
	 * by the assembly mirror.
	 *
	 * These quads are not planar — their two edges lie on different rays at different heights —
	 * so the diagonal decides which of two slightly different surfaces gets built. Splitting them
	 * all the same way looks harmless but is not: turning the part over reverses the sense of the
	 * angle, which flips every diagonal, and the part then overlaps its own mate along a thin
	 * sliver at each quad.
	 *
	 * Mirroring maps quad `k` onto quad `samples - 1 - k` and maps one diagonal onto the *other*
	 * one, so pairing the two halves of the circle with opposite diagonals makes the surface
	 * mirror-invariant exactly.
	 */
	const topFace = (
		innerHere: number,
		outerHere: number,
		outerNext: number,
		innerNext: number,
		sample: number,
	) => {
		if (sample * 2 < samples) {
			triangles.push(innerHere, outerHere, outerNext);
			triangles.push(innerHere, outerNext, innerNext);
		} else {
			triangles.push(innerHere, outerHere, innerNext);
			triangles.push(outerHere, outerNext, innerNext);
		}
	};

	for (let sample = 0; sample < samples; sample++) {
		const next = sample + 1;

		quad(
			at(sample, OUTER_BOTTOM),
			at(next, OUTER_BOTTOM),
			at(next, OUTER_TOP),
			at(sample, OUTER_TOP),
		);
		quad(
			at(sample, INNER_BOTTOM),
			at(sample, INNER_TOP),
			at(next, INNER_TOP),
			at(next, INNER_BOTTOM),
		);
		quad(
			at(sample, INNER_BOTTOM),
			at(next, INNER_BOTTOM),
			at(next, OUTER_BOTTOM),
			at(sample, OUTER_BOTTOM),
		);
		topFace(
			at(sample, INNER_TOP),
			at(sample, OUTER_TOP),
			at(next, OUTER_TOP),
			at(next, INNER_TOP),
			sample,
		);
	}

	return mf.Manifold.ofMesh(
		new mf.Mesh({
			numProp: 3,
			vertProperties: new Float32Array(positions),
			triVerts: new Uint32Array(triangles),
		}),
	);
}
