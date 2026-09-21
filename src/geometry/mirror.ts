import type { Manifold, Vec3 } from "manifold-3d";

/**
 * Turning a part over to mate it with a copy of itself: a half turn about the X axis,
 * `(x, y, z) -> (x, -y, -z)`.
 *
 * This is the one assumption the whole split design rests on, so it lives in exactly one place.
 * Every joint has to interlock under *this* transform; a joint designed against "rotate it 180
 * degrees" — which in the plane is a rotation, not a reflection — will look right on paper and
 * refuse to go together in the hand.
 *
 * The consequence worth remembering: turning the part over reverses the sense of the angle,
 * `theta -> -theta`. So a joint mates with itself exactly when its parting surface is unchanged
 * by that reversal, which for a surface written as a height `f(theta)` means `f` must be odd.
 * Patterns that merely repeat every `2 pi / n` are not enough, and the dowel ring is the case
 * where the difference bites.
 */
export const ASSEMBLY_ROTATION: Vec3 = [180, 0, 0];

/** The mating part: this one, turned over. Split builds only ever produce a single shape. */
export function turnedOver(part: Manifold): Manifold {
	return part.rotate(ASSEMBLY_ROTATION);
}
