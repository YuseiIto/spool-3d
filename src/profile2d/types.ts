/** A point on the revolved cross-section, read as `[radius, height]`. */
export type ProfilePoint = readonly [number, number];

/** A closed contour of the cross-section, wound counter-clockwise in the (radius, height) plane. */
export type ProfileContour = readonly ProfilePoint[];

export type CornerTreatment = "sharp" | "round" | "chamfer";

/**
 * A corner of the cross-section, with how it should be eased.
 *
 * Corners are described per vertex rather than by offsetting the whole contour. A morphological
 * opening (`offset(-r).offset(+r)`) only rounds convex corners and a closing only rounds concave
 * ones, and both apply one radius to every corner at once — so neither can express "round the
 * core-to-flange root at 2 mm and chamfer the bore at 0.5 mm", which is the whole point.
 */
export interface ProfileVertex {
	point: ProfilePoint;
	treatment: CornerTreatment;
	/** Fillet radius, or the leg length of the chamfer. Millimetres. */
	size: number;
}
