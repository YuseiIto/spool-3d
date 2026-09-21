import {
	derive,
	dowelCircleRadius,
	lighteningWindow,
	rootFilletRoom,
} from "~/params/derive";
import type { Issue } from "~/params/issue";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

/**
 * Printing constraints the rules are judged against.
 *
 * Defaults describe a 0.4 mm nozzle, by far the most common. These are separate from the spool's
 * own parameters because they describe the machine, not the part.
 */
export interface PrinterProfile {
	nozzleDiameter: number;
}

export const defaultPrinter: PrinterProfile = { nozzleDiameter: 0.4 };

/** Below two extrusions wide, a wall is not reliably solid. */
const minWallFactor = 2;

/** Material that must survive between a cut feature and anything else. */
const MIN_WEB_MM = 1.0;

/**
 * Checks a parameter combination for geometry that cannot be built or should not be printed.
 *
 * Separate from the zod schema on purpose. The schema's job is to turn untrusted input into a
 * `SpoolParams`; this decides whether that combination makes sense, which is a different
 * question with a different answer shape — warnings are not rejections, and the UI needs to know
 * which field to point at.
 *
 * A pure function of the parameters, so it can run in the form as the user types and again in
 * the worker before an export, without the two ever disagreeing.
 */
export function checkParams(
	params: SpoolParams,
	printer: PrinterProfile = defaultPrinter,
): Issue[] {
	const g = derive(params);
	const issues: Issue[] = [];
	const minWall = minWallFactor * printer.nozzleDiameter;

	if (g.flangeRadius - g.coreRadius < MIN_WEB_MM) {
		issues.push({
			code: "CORE_NOT_INSIDE_FLANGE",
			severity: "error",
			field: "coreDiameter",
			message:
				"The core is as wide as the flanges, so there is nowhere to wind.",
			suggestion: {
				field: "coreDiameter",
				value: params.flangeDiameter - 2 * MIN_WEB_MM - 10,
			},
		});
	}

	if (g.coreRadius - g.boreRadius < minWall) {
		issues.push({
			code: "BORE_NOT_INSIDE_CORE",
			severity: "error",
			field: "boreDiameter",
			message: `The bore leaves less than ${minWall} mm of core wall around it.`,
			suggestion: {
				field: "boreDiameter",
				value: params.coreDiameter - 2 * minWall,
			},
		});
	}

	if (params.flangeThickness < minWall) {
		issues.push({
			code: "FLANGE_TOO_THIN",
			severity: "error",
			field: "flangeThickness",
			message: `A flange thinner than ${minWall} mm will not print solid.`,
			suggestion: { field: "flangeThickness", value: minWall },
		});
	}

	const rootRoom = rootFilletRoom(g);
	if (params.rootFilletRadius > rootRoom) {
		issues.push({
			code: "ROOT_FILLET_TOO_LARGE",
			severity: "warning",
			field: "rootFilletRadius",
			message:
				"The root fillet is larger than the space it has, so it is being clamped.",
			suggestion: {
				field: "rootFilletRadius",
				value: Number(rootRoom.toFixed(1)),
			},
		});
	}

	issues.push(...lighteningHoleIssues(params, g));
	issues.push(...startHoleIssues(params, g, minWall));
	issues.push(...wireNotchIssues(params, g));
	if (params.split) issues.push(...jointIssues(params, g, minWall));

	return issues;
}

/**
 * Checks the seam of a split build.
 *
 * Two constraints recur: no joint feature may reach past the flanges, since beyond them the seam
 * would cut into a face the user winds against; and the seam only passes through material between
 * the bore and the core, because at the parting plane the flanges are a winding-width apart.
 */
function jointIssues(
	params: SpoolParams,
	g: ReturnType<typeof derive>,
	minWall: number,
): Issue[] {
	const issues: Issue[] = [];

	// A butt seam has no mating faces to hold apart, and `jointSolids` forces the clearance to
	// zero for it — so neither reading is worth remarking on there.
	if (params.joint !== "none") {
		const message =
			params.jointClearance > 0.5
				? "That much clearance will leave the halves visibly loose."
				: params.jointClearance < 0.05
					? "With almost no clearance the halves will not go together after printing."
					: null;
		if (message) {
			issues.push({
				code: "CLEARANCE_OUT_OF_RANGE",
				severity: "warning",
				field: "jointClearance",
				message,
				suggestion: {
					field: "jointClearance",
					value: defaultSpoolParams.jointClearance,
				},
			});
		}
	}

	const reach: Partial<
		Record<typeof params.joint, [number, keyof SpoolParams]>
	> = {
		wave: [params.waveAmplitude, "waveAmplitude"],
		tabs: [params.stepHeight / 2, "stepHeight"],
		// Half, because the overlap is split either side of the parting plane.
		sleeve: [params.lapLength / 2, "lapLength"],
		dowel: [params.dowelHeight, "dowelHeight"],
	};

	const entry = reach[params.joint];
	if (entry && entry[0] >= g.windingHalfWidth) {
		issues.push({
			code: "JOINT_TOO_TALL",
			severity: "error",
			field: entry[1],
			message: "The joint reaches past the flange, into the winding surface.",
			suggestion: {
				field: entry[1],
				value: Number((g.windingHalfWidth * 0.5).toFixed(1)),
			},
		});
	}

	if (params.joint === "dowel") issues.push(...dowelIssues(params, g, minWall));

	if (params.joint === "wave") {
		// Steepest where the seam crosses the smallest radius carrying material.
		const slope =
			(params.waveAmplitude * params.waveCount) / Math.max(g.boreRadius, 0.1);
		if (slope > 1) {
			issues.push({
				code: "WAVE_OVERHANG",
				severity: "warning",
				field: "waveCount",
				message:
					"The seam is steeper than 45 degrees near the bore, so it will need support.",
				suggestion: {
					field: "waveCount",
					value: Math.max(1, Math.floor(g.boreRadius / params.waveAmplitude)),
				},
			});
		}
	}

	return issues;
}

function dowelIssues(
	params: SpoolParams,
	g: ReturnType<typeof derive>,
	minWall: number,
): Issue[] {
	const issues: Issue[] = [];
	const ringRadius = dowelCircleRadius(params, g);
	const pinRadius = params.dowelDiameter / 2;
	const socketRadius = pinRadius + params.jointClearance;

	// At the parting plane the material is the core: everything between bore and winding surface.
	const fits =
		ringRadius - socketRadius >= g.boreRadius &&
		ringRadius + socketRadius <= g.coreRadius;
	if (!fits) {
		// Automatic placement centres the ring in the core wall, so it holds a socket of at most
		// half that wall — which is the widest pin the spool can carry wherever the ring sits.
		const widestPin = g.coreRadius - g.boreRadius - 2 * params.jointClearance;
		const placementIsTheProblem =
			params.dowelCircleDiameter > 0 && params.dowelDiameter <= widestPin;

		issues.push({
			code: "DOWEL_OFF_MATERIAL",
			severity: "error",
			field: placementIsTheProblem ? "dowelCircleDiameter" : "dowelDiameter",
			message: placementIsTheProblem
				? "The dowels fall outside the core, where the seam has no material."
				: "The core wall is too thin for dowels this wide.",
			suggestion: placementIsTheProblem
				? // Zero means automatic placement, which lands on material whenever any ring does.
					{ field: "dowelCircleDiameter", value: 0 }
				: {
						field: "dowelDiameter",
						value: Math.max(0.1, downTo(widestPin, 0.1)),
					},
		});
	}

	// Pins and sockets alternate, so consecutive features are half a step apart.
	const web = Math.max(minWall, MIN_WEB_MM);
	const gap =
		2 * ringRadius * Math.sin(Math.PI / (2 * params.dowelCount)) -
		(pinRadius + socketRadius);
	if (gap < web) {
		issues.push({
			code: "DOWELS_TOO_CLOSE",
			severity: "error",
			field: "dowelCount",
			message: "The dowels are packed too tightly around the seam.",
			suggestion: {
				field: "dowelCount",
				value: countThatFits(ringRadius, web + pinRadius + socketRadius, 2),
			},
		});
	}

	if (params.dowelDiameter < 2 * minWall) {
		issues.push({
			code: "THIN_WALL",
			severity: "warning",
			field: "dowelDiameter",
			message: "Pins this thin snap easily once printed.",
			suggestion: { field: "dowelDiameter", value: 2 * minWall },
		});
	}

	return issues;
}

function lighteningHoleIssues(
	params: SpoolParams,
	g: ReturnType<typeof derive>,
): Issue[] {
	if (params.lighteningHoleCount <= 0) return [];

	const issues: Issue[] = [];
	const margin = params.lighteningHoleMargin;
	const inner = g.coreRadius + margin;
	const outer = g.flangeRadius - margin;
	const depth = outer - inner;

	if (depth <= 0) {
		issues.push({
			code: "HOLE_NO_ROOM",
			severity: "error",
			field: "lighteningHoleMargin",
			message:
				"The margin leaves no room between the core and the rim for a window.",
			suggestion: {
				field: "lighteningHoleMargin",
				value: Number(
					Math.max(1, (g.flangeRadius - g.coreRadius) / 4).toFixed(1),
				),
			},
		});
		return issues;
	}

	// Webs between neighbours, measured along the inner arc where the gap is tightest.
	const pitch = (2 * Math.PI) / params.lighteningHoleCount;
	const span = pitch - 2 * Math.asin(Math.min(1, margin / (2 * inner)));
	if (span <= 0) {
		issues.push({
			code: "HOLES_TOO_CLOSE",
			severity: "error",
			field: "lighteningHoleCount",
			message:
				"There are too many windows for the webs between them to survive.",
			suggestion: {
				field: "lighteningHoleCount",
				value: Math.max(
					1,
					Math.floor(
						Math.PI / Math.asin(Math.min(0.999, margin / (2 * inner))) / 2,
					),
				),
			},
		});
		return issues;
	}

	// Past this the corner arcs meet each other and the window is as round as it can get, so the
	// builder stops there. Reported rather than left silent, since the slider carries on moving.
	const window = lighteningWindow(params, g);
	if (window && params.lighteningHoleCornerRadius > window.maxCornerRadius) {
		issues.push({
			code: "HOLE_CORNER_TOO_LARGE",
			severity: "warning",
			field: "lighteningHoleCornerRadius",
			message:
				"The corners are as round as this window can take, so the radius is being clamped.",
			suggestion: {
				field: "lighteningHoleCornerRadius",
				value: downTo(window.maxCornerRadius, 0.1),
			},
		});
	}

	return issues;
}

/** Holes bored through the core wall for the starting end of the wire. */
function startHoleIssues(
	params: SpoolParams,
	g: ReturnType<typeof derive>,
	minWall: number,
): Issue[] {
	if (params.startHoleCount <= 0) return [];

	const issues: Issue[] = [];
	const radius = params.startHoleDiameter / 2;

	// The hole runs radially, so what limits its size is the winding width it has to sit within,
	// not the thickness of the wall it passes through.
	if (radius + 0.5 >= g.windingHalfWidth) {
		issues.push({
			code: "START_HOLE_TOO_BIG",
			severity: "error",
			field: "startHoleDiameter",
			message: "The start hole is taller than the space between the flanges.",
			suggestion: {
				field: "startHoleDiameter",
				value: Number(Math.max(0.5, g.windingHalfWidth - 1).toFixed(1)),
			},
		});
	}

	// Measured at the winding surface, where the holes are furthest apart; any closer in and the
	// remaining web is thinner still.
	const gap =
		2 * g.coreRadius * Math.sin(Math.PI / params.startHoleCount) -
		params.startHoleDiameter;
	if (params.startHoleCount > 1 && gap < Math.max(minWall, MIN_WEB_MM)) {
		issues.push({
			code: "START_HOLES_TOO_CLOSE",
			severity: "error",
			field: "startHoleCount",
			message: "The start holes run into each other around the core.",
			suggestion: { field: "startHoleCount", value: 1 },
		});
	}

	return issues;
}

function wireNotchIssues(
	params: SpoolParams,
	g: ReturnType<typeof derive>,
): Issue[] {
	if (params.wireNotchCount <= 0) return [];

	const issues: Issue[] = [];
	const maxDepth = g.flangeRadius - g.coreRadius - MIN_WEB_MM;

	if (params.wireNotchDepth > maxDepth) {
		issues.push({
			code: "NOTCH_TOO_DEEP",
			severity: "error",
			field: "wireNotchDepth",
			message: "The wire notches cut as far as the winding surface.",
			suggestion: {
				field: "wireNotchDepth",
				value: Number(Math.max(0.5, maxDepth).toFixed(1)),
			},
		});
	}

	// Measured at the notch's inner end, where the remaining material is thinnest.
	const innerRadius = Math.max(
		g.coreRadius,
		g.flangeRadius - params.wireNotchDepth,
	);
	const gap =
		2 * innerRadius * Math.sin(Math.PI / params.wireNotchCount) -
		params.wireNotchWidth;
	if (params.wireNotchCount > 1 && gap < MIN_WEB_MM) {
		issues.push({
			code: "NOTCHES_TOO_CLOSE",
			severity: "error",
			field: "wireNotchCount",
			message: "The wire notches overlap each other.",
			suggestion: {
				field: "wireNotchCount",
				value: countThatFits(
					innerRadius,
					MIN_WEB_MM + params.wireNotchWidth,
					1,
				),
			},
		});
	}

	return issues;
}

/**
 * How many features of chord width `chord` fit evenly around a circle of radius `radius`.
 *
 * `perTurn` is how many sit in one full turn of the pattern: dowels alternate pins with sockets,
 * so a ring of n dowels carries 2n features and the spacing halves.
 *
 * Derived rather than suggested as a constant, because the smallest count a spacing rule can fire
 * at is often the constant itself — and a Fix button that sets a field to the value it already
 * holds leaves the user stuck behind an error with no way forward.
 */
function countThatFits(radius: number, chord: number, perTurn: number): number {
	const half = Math.asin(Math.min(1, chord / (2 * radius)));
	if (half <= 0) return 1;
	return Math.max(1, Math.floor(Math.PI / (perTurn * half)));
}

/** Rounds down to a whole number of `step`s, so a suggestion never lands back over the limit. */
function downTo(value: number, step: number): number {
	return Number((Math.max(0, Math.floor(value / step)) * step).toFixed(3));
}
