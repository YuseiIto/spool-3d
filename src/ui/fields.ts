import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

/** Keys whose value is a number, so a slider can drive them. */
export type NumericParam = {
	[K in keyof SpoolParams]: SpoolParams[K] extends number ? K : never;
}[keyof SpoolParams];

/** Everything a numeric control needs to render itself. */
export interface ControlSpec {
	label: string;
	min: number;
	max: number;
	step: number;
	/** Shown under the label when the number alone does not say what it does. */
	hint?: string;
	/** Unit shown beside the label. Most dimensions are millimetres; counts have none. */
	unit?: string;
}

/** A control bound to a parameter. Controls that drive local UI state are plain `ControlSpec`s. */
export interface FieldSpec extends ControlSpec {
	key: NumericParam;
	/**
	 * Hidden unless this reads true.
	 *
	 * Per field rather than per section: the detail settings of a feature are only meaningful
	 * once it is switched on.
	 */
	shownWhen?: (params: SpoolParams) => boolean;
}

export interface FieldGroup {
	title: string;
	fields: readonly FieldSpec[];
}

/**
 * The five measurements that define a spool.
 *
 * Slider bounds are ergonomic limits, not correctness ones: they keep the slider useful over the
 * range people actually print, while the reading stays free so an unusual spool is still
 * reachable by typing. Whether a combination is buildable is decided by `checkParams`, not here.
 */
export const BASIC_FIELDS: readonly FieldSpec[] = [
	{
		key: "flangeDiameter",
		label: "Flange diameter",
		min: 10,
		max: 300,
		step: 0.5,
	},
	{
		key: "flangeThickness",
		label: "Flange thickness",
		min: 0.8,
		max: 20,
		step: 0.1,
	},
	{ key: "coreDiameter", label: "Core diameter", min: 5, max: 200, step: 0.5 },
	{
		key: "windingWidth",
		label: "Winding width",
		min: 2,
		max: 200,
		step: 0.5,
		hint: "Clear space between the flanges",
	},
	{ key: "boreDiameter", label: "Bore diameter", min: 1, max: 100, step: 0.5 },
];

/**
 * Settings folded away behind the Advanced disclosure.
 *
 * Divided by how often a setting is touched rather than by how hard it is to understand: the
 * five dimensions above define the spool and get changed every time, while these refine one that
 * is already the right size. Keeping them out of the way is what lets the shape be settled
 * without scrolling past its chamfers.
 */
export const ADVANCED_GROUPS: readonly FieldGroup[] = [
	{
		title: "Edges",
		fields: [
			{
				key: "rootFilletRadius",
				label: "Root fillet",
				min: 0,
				max: 10,
				step: 0.1,
				hint: "Where the core meets the flanges",
			},
			{
				key: "rimSize",
				label: "Rim size",
				min: 0,
				max: 5,
				step: 0.1,
				hint: "Radius when rounded, leg when chamfered",
			},
			{ key: "boreChamfer", label: "Bore chamfer", min: 0, max: 5, step: 0.1 },
		],
	},
	{
		title: "Features",
		fields: [
			{
				key: "lighteningHoleCount",
				label: "Windows",
				min: 0,
				max: 16,
				step: 1,
				unit: "",
			},
			{
				key: "lighteningHoleMargin",
				label: "Margin",
				min: 0.5,
				max: 30,
				step: 0.5,
				hint: "Material kept around each window",
				shownWhen: (params) => params.lighteningHoleCount > 0,
			},
			{
				key: "lighteningHoleCornerRadius",
				label: "Corner radius",
				min: 0,
				max: 15,
				step: 0.5,
				shownWhen: (params) => params.lighteningHoleCount > 0,
			},
			{
				key: "startHoleCount",
				label: "Start holes",
				min: 0,
				max: 6,
				step: 1,
				unit: "",
				hint: "Through the core wall, one by each flange",
			},
			{
				key: "startHoleDiameter",
				label: "Start hole diameter",
				min: 0.5,
				max: 12,
				step: 0.5,
				shownWhen: (params) => params.startHoleCount > 0,
			},
			{
				key: "wireNotchCount",
				label: "Rim notches",
				min: 0,
				max: 12,
				step: 1,
				unit: "",
				hint: "Hooks the finished end",
			},
			{
				key: "wireNotchWidth",
				label: "Notch width",
				min: 0.5,
				max: 10,
				step: 0.1,
				shownWhen: (params) => params.wireNotchCount > 0,
			},
			{
				key: "wireNotchDepth",
				label: "Notch depth",
				min: 0.5,
				max: 60,
				step: 0.5,
				shownWhen: (params) => params.wireNotchCount > 0,
			},
		],
	},
];

/** Everything the Advanced disclosure owns, including the settings that are not sliders. */
const ADVANCED_KEYS: readonly (keyof SpoolParams)[] = [
	"rimTreatment",
	...ADVANCED_GROUPS.flatMap((group) => group.fields.map((field) => field.key)),
];

/**
 * Whether anything behind the Advanced disclosure has been moved off its default.
 *
 * Decides whether it starts open. A shared link can set any of these, and a spool that arrives
 * with lightening holes in it while the control that put them there is folded away is simply
 * confusing.
 */
export function hasAdvancedChanges(params: SpoolParams): boolean {
	return ADVANCED_KEYS.some((key) => params[key] !== defaultSpoolParams[key]);
}

/**
 * Extra controls shown for the chosen joint.
 *
 * Only the selected joint's fields appear: every joint shapes the seam differently, so showing
 * all of them at once would offer settings that do nothing.
 */
export const JOINT_FIELDS: Record<string, readonly FieldSpec[]> = {
	none: [],
	dowel: [
		{ key: "dowelCount", label: "Pins", min: 1, max: 12, step: 1, unit: "" },
		{ key: "dowelDiameter", label: "Pin diameter", min: 1, max: 20, step: 0.5 },
		{ key: "dowelHeight", label: "Pin length", min: 1, max: 30, step: 0.5 },
		{
			key: "dowelCircleDiameter",
			label: "Ring diameter",
			min: 0,
			max: 200,
			step: 0.5,
			hint: "Zero places the ring automatically",
		},
	],
	wave: [
		{ key: "waveCount", label: "Periods", min: 1, max: 12, step: 1, unit: "" },
		{
			key: "waveAmplitude",
			label: "Amplitude",
			min: 0.5,
			max: 30,
			step: 0.5,
			hint: "From the mid-plane, so the seam rises and falls twice this",
		},
	],
	tabs: [
		{ key: "stepCount", label: "Tabs", min: 1, max: 8, step: 1, unit: "" },
		{ key: "stepHeight", label: "Tab height", min: 0.5, max: 30, step: 0.5 },
	],
	sleeve: [
		{ key: "lapCount", label: "Segments", min: 1, max: 8, step: 1, unit: "" },
		{
			key: "lapLength",
			label: "Overlap",
			min: 0.5,
			max: 30,
			step: 0.5,
			hint: "Total depth the halves engage",
		},
	],
};

export const CLEARANCE_FIELD: FieldSpec = {
	key: "jointClearance",
	label: "Clearance",
	min: 0,
	max: 0.8,
	step: 0.05,
	hint: "Larger = looser fit",
};
