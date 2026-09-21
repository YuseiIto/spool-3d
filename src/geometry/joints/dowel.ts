import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { Scratch } from "~/geometry/scratch";

export interface DowelOptions {
	/** Pins; there are this many sockets too, alternating between them. */
	count: number;
	pinRadius: number;
	pinHeight: number;
	circleRadius: number;
	clearance: number;
	circularSegments: number;
}

export interface DowelFeatures {
	/** Added above the parting plane. */
	pins: Manifold;
	/** Cut below the parting plane. */
	sockets: Manifold;
}

/**
 * Angle of slot `index`, in degrees, for a ring of `count` pins and `count` sockets.
 *
 * The half-step offset is the whole trick. Turning the part over reverses the sense of the angle,
 * so slot `i` has to land on a slot of the opposite kind at angle `-theta_i`. Laying the slots out
 * at multiples of `180 / count` puts a slot at angle zero and maps index `i` to index `-i`, which
 * has the same parity — pins meet pins and the halves will not go together. Shifting the whole
 * ring by half a step maps index `i` to `-i - 1` instead, whose parity is always opposite.
 *
 * Geometrically: the axis the part turns about must pass *between* a pin and a socket, never
 * through one.
 */
export function slotAngleDegrees(index: number, count: number): number {
	return (index + 0.5) * (180 / count);
}

/**
 * Pins and sockets that alternate around the seam.
 *
 * All the clearance goes on the socket, leaving the pin at its nominal size. That matches how the
 * parts actually come off a printer — holes shrink, posts grow — and it means the diameter the
 * user sets is the diameter of the feature that has to be strong.
 */
export function dowelFeatures(
	mf: ManifoldToplevel,
	options: DowelOptions,
): DowelFeatures {
	const scratch = new Scratch();
	try {
		const features = layOut(mf, scratch, options);
		scratch.releaseAll(features.pins, features.sockets);
		return features;
	} catch (cause) {
		scratch.releaseAll();
		throw cause;
	}
}

function layOut(
	mf: ManifoldToplevel,
	scratch: Scratch,
	options: DowelOptions,
): DowelFeatures {
	const { count, pinRadius, pinHeight, circleRadius, clearance } = options;
	const segments = options.circularSegments;

	const pin = scratch.hold(
		mf.Manifold.cylinder(pinHeight, pinRadius, pinRadius, segments, false),
	);

	// Deeper than the pin is tall, so the pin never bottoms out before the faces meet.
	const socketDepth = pinHeight + clearance;
	const bore = scratch.hold(
		mf.Manifold.cylinder(
			socketDepth,
			pinRadius + clearance,
			pinRadius + clearance,
			segments,
			false,
		),
	);
	const socket = scratch.hold(bore.translate([0, 0, -socketDepth]));

	const place = (solid: Manifold, index: number) => {
		const out = scratch.hold(solid.translate([circleRadius, 0, 0]));
		return scratch.hold(out.rotate([0, 0, slotAngleDegrees(index, count)]));
	};

	const pins: Manifold[] = [];
	const sockets: Manifold[] = [];
	for (let index = 0; index < 2 * count; index++) {
		if (index % 2 === 0) pins.push(place(pin, index));
		else sockets.push(place(socket, index));
	}

	return {
		pins: mf.Manifold.union(pins),
		sockets: mf.Manifold.union(sockets),
	};
}
