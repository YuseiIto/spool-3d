import { z } from "zod";

export const jointKinds = ["none", "dowel", "wave", "tabs", "sleeve"] as const;

/*
 * A note on vocabulary: the two step joints are named here for what they are — interlocking tabs
 * and a sleeve — while the geometry module and the parameters underneath still speak of steps
 * and laps, which is what the shapes are in machining terms. Each tab is formed by a step in the
 * seam, and the sleeve is a lap on a cylindrical face, so the two vocabularies describe the same
 * thing at different granularity.
 */

export type JointKind = (typeof jointKinds)[number];

/**
 * What each seam is called.
 *
 * `short` is what fits on a tile when all five sit side by side; `name` is the full term, which
 * the tooltip carries so the shortened ones stay findable. They differ only where the full name
 * needs two words to say which way the step runs — and the drawing on the tile says that anyway.
 */
export const jointLabels: Record<
	JointKind,
	{ short: string; name: string; note: string }
> = {
	none: { short: "Flat", name: "Flat", note: "Butt joint. Glue only." },
	dowel: {
		short: "Dowels",
		name: "Dowels",
		note: "Pins and sockets. Locates the halves and resists twisting.",
	},
	wave: {
		short: "Wave",
		name: "Wave",
		note: "A sine seam. Large glue area, nothing small to break.",
	},
	tabs: {
		short: "Tabs",
		name: "Interlocking tabs",
		note: "Tabs drop into notches around the seam. Resists twisting, and prints flat with nothing small to snap.",
	},
	sleeve: {
		short: "Sleeve",
		name: "Sleeve",
		note: "The core wall steps between inner and outer, so one half slides inside the other. Resists twisting and keeps the halves concentric.",
	},
};

/**
 * Parameters of the split build.
 *
 * Split spools are made of one part printed twice, so there is no "part A" and "part B" to
 * configure separately — every setting here describes the single shape and the seam it mates
 * itself along.
 */
export const splitParamsSchema = z.object({
	split: z.boolean().default(true),
	joint: z.enum(jointKinds).default("wave"),

	/**
	 * Gap left between the mating faces, total across the joint.
	 *
	 * 0.1 mm suits a well-tuned FDM printer with a 0.4 mm nozzle. It is the first thing to
	 * change when parts come out too tight or too loose, which is why it is exposed rather than
	 * derived — and why the rules point back here rather than at a figure of their own.
	 */
	jointClearance: z.number().min(0).default(0.1),

	/** Pins and sockets alternate, so the ring holds twice this many features. */
	dowelCount: z.number().int().min(1).default(3),
	dowelDiameter: z.number().positive().default(2),
	dowelHeight: z.number().positive().default(4),
	/** Zero places the ring automatically, midway through the material at the seam. */
	dowelCircleDiameter: z.number().min(0).default(0),

	waveCount: z.number().int().min(1).default(3),
	waveAmplitude: z.number().positive().default(3),

	stepCount: z.number().int().min(1).default(1),
	stepHeight: z.number().positive().default(3),

	lapCount: z.number().int().min(1).default(1),
	/**
	 * Total depth the two halves engage, split either side of the parting plane.
	 *
	 * Stated as the whole depth rather than the reach in each direction, so it means the same
	 * kind of thing as the tab height beside it.
	 */
	lapLength: z.number().positive().default(2.5),
});

export type SplitParams = z.infer<typeof splitParamsSchema>;
