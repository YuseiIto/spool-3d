import type { SpoolGeometry } from "~/params/derive";
import type { SpoolParams } from "~/params/schema";
import { expandCorners } from "~/profile2d/corners";
import type {
	ProfileContour,
	ProfilePoint,
	ProfileVertex,
} from "~/profile2d/types";

/**
 * The revolved cross-section of the spool: the classic I-beam.
 *
 * The bore is the inner edge of this contour rather than a cylinder subtracted afterwards. That
 * saves a boolean, and more usefully it puts the bore's corners on the same footing as every
 * other corner, so the same chamfer machinery reaches them.
 */
export function spoolCrossSection(
	params: SpoolParams,
	g: SpoolGeometry,
): ProfileContour {
	const { boreRadius: rb, coreRadius: rc, flangeRadius: rf } = g;
	const { windingHalfWidth: w, halfHeight: h } = g;

	const rim = (point: ProfilePoint): ProfileVertex => ({
		point,
		treatment: params.rimTreatment,
		size: params.rimSize,
	});
	const bore = (point: ProfilePoint): ProfileVertex => ({
		point,
		treatment: "chamfer",
		size: params.boreChamfer,
	});
	const root = (point: ProfilePoint): ProfileVertex => ({
		point,
		treatment: "round",
		size: params.rootFilletRadius,
	});
	const sharp = (point: ProfilePoint): ProfileVertex => ({
		point,
		treatment: "sharp",
		size: 0,
	});

	return expandCorners([
		bore([rb, -h]),
		rim([rf, -h]),
		sharp([rf, -w]),
		root([rc, -w]),
		root([rc, w]),
		sharp([rf, w]),
		rim([rf, h]),
		bore([rb, h]),
	]);
}
