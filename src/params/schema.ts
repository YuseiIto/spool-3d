import { z } from "zod";
import { splitParamsSchema } from "~/params/joints";

export const rimTreatments = ["sharp", "round", "chamfer"] as const;
export type RimTreatment = (typeof rimTreatments)[number];

/**
 * How the rim treatments are written in the interface.
 *
 * "Round" rather than "fillet" is deliberate and is the stricter term: a fillet fills an interior
 * corner and adds material, a round breaks an exterior edge and removes it. The flange rim is an
 * exterior edge, so it is rounded; the core-to-flange junction, which this tool calls a root
 * fillet, is an interior one. Most CAD packages label both commands "Fillet", which is why the
 * distinction is worth keeping here.
 */
export const rimTreatmentLabels: Record<RimTreatment, string> = {
	sharp: "Sharp",
	round: "Round",
	chamfer: "Chamfer",
};

/**
 * All lengths are millimetres and all diameters — never radii — because that is how printed
 * parts are measured and how users think about them. `derive()` is the single place that
 * converts to the radii the geometry layer works in.
 *
 * The shape is flat rather than grouped. Grouping would only be cosmetic here: it is the UI's
 * field list that decides how controls are laid out, and a flat shape keeps the URL keys, the
 * form bindings and the validation rules all trivial.
 *
 * Optional features are switched off by a count or flag rather than by an absent field, so every
 * parameter always has a value and a shared link can never be ambiguous about one.
 */
const spoolShapeSchema = z.object({
	flangeDiameter: z.number().positive().default(55),
	flangeThickness: z.number().positive().default(2.5),
	coreDiameter: z.number().positive().default(25),
	/** Clear distance between the inner faces of the two flanges. */
	windingWidth: z.number().positive().default(25),
	/** Through hole for the axle. */
	boreDiameter: z.number().positive().default(20),

	/** Fillet where the core meets the flanges. Stops the first turns biting into the corner. */
	rootFilletRadius: z.number().min(0).default(1),
	rimTreatment: z.enum(rimTreatments).default("chamfer"),
	rimSize: z.number().min(0).default(0.5),
	boreChamfer: z.number().min(0).default(0.5),

	/** Windows through the flanges. Zero disables them. */
	lighteningHoleCount: z.number().int().min(0).default(0),
	/**
	 * Material left around each window — at the core, at the rim, and between neighbours.
	 *
	 * One number rather than a placement circle and a size: the windows then span whatever is
	 * left, so they cannot be positioned into the core or off the rim however the spool is
	 * resized.
	 */
	lighteningHoleMargin: z.number().positive().default(3),
	lighteningHoleCornerRadius: z.number().min(0).default(2),

	/**
	 * Holes near the core for anchoring the starting end of the wire. Zero disables them.
	 *
	 * Distinct from the rim notches, which hold the finished outer end: this one is threaded
	 * before winding starts, so the first turn has something to pull against.
	 */
	startHoleCount: z.number().int().min(0).default(0),
	startHoleDiameter: z.number().positive().default(2),

	/** Slots cut into the flange rim to anchor the end of the wire. Zero disables them. */
	wireNotchCount: z.number().int().min(0).default(0),
	wireNotchWidth: z.number().positive().default(2),
	wireNotchDepth: z.number().positive().default(5),
});

export const spoolParamsSchema = spoolShapeSchema.extend(
	splitParamsSchema.shape,
);

export type SpoolParams = z.infer<typeof spoolParamsSchema>;

export const defaultSpoolParams: SpoolParams = spoolParamsSchema.parse({});
