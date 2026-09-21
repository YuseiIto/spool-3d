import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { buildSpool } from "~/geometry/build";
import { jointSolids } from "~/geometry/joints";
import { derive } from "~/params/derive";
import type { SpoolParams } from "~/params/schema";

/**
 * Builds what the user actually prints: the whole spool, or the single part that makes one when
 * printed twice.
 *
 * There is deliberately no "other half". A split spool is one shape that mates with its own
 * mirror image, so this returns one solid and the caller prints two of it. Everything that makes
 * that possible is in the joint's parting solids and in `~/geometry/mirror`.
 *
 * Coordinates keep the parting plane at z = 0. The mirror symmetry the joints depend on is only
 * simple in that frame, so moving the part onto a build plate is left to whoever is about to
 * display or export it.
 */
export function buildPart(
	mf: ManifoldToplevel,
	params: SpoolParams,
	circularSegments: number,
): Manifold {
	const whole = buildSpool(mf, params, circularSegments);
	if (!params.split) return whole;

	const joint = jointSolids(mf, params, derive(params), circularSegments);
	const scratch: Manifold[] = [whole, joint.keep];

	let part = whole.intersect(joint.keep);

	if (joint.add) {
		scratch.push(joint.add, part);
		part = part.add(joint.add);
	}
	if (joint.remove) {
		scratch.push(joint.remove, part);
		part = part.subtract(joint.remove);
	}

	for (const solid of scratch) solid.delete();
	return part;
}

export interface LaidOut {
	solid: Manifold;
	/**
	 * Where the parting plane ended up.
	 *
	 * Reported rather than left to be inferred from the bounding box: a joint with material above
	 * the seam — dowel pins, a raised step — puts the top of the box at the tip of that material,
	 * not at the seam, and anything that assembles two halves by their extremes then holds them
	 * apart by twice the protrusion.
	 */
	seamZ: number;
}

/** Drops the solid onto z = 0, the way a slicer expects to receive it. */
export function layOnBuildPlate(solid: Manifold): LaidOut {
	const lift = -solid.boundingBox().min[2];
	return { solid: solid.translate([0, 0, lift]), seamZ: lift };
}
