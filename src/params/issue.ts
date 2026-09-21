import type { SpoolParams } from "~/params/schema";

/**
 * A problem with a parameter combination.
 *
 * `code` is the stable identity — tests and the UI key off it, never off `message`, so the
 * wording can be improved without breaking anything.
 */
export interface Issue {
	code: IssueCode;
	severity: "error" | "warning";
	/** Field the message should be shown against. */
	field: keyof SpoolParams;
	message: string;
	/** A value that would resolve the issue, offered as a one-click fix. */
	suggestion?: { field: keyof SpoolParams; value: number | boolean };
}

export type IssueCode =
	| "CORE_NOT_INSIDE_FLANGE"
	| "BORE_NOT_INSIDE_CORE"
	| "FLANGE_TOO_THIN"
	| "HOLE_NO_ROOM"
	| "HOLE_CORNER_TOO_LARGE"
	| "START_HOLE_TOO_BIG"
	| "START_HOLES_TOO_CLOSE"
	| "HOLES_TOO_CLOSE"
	| "NOTCH_TOO_DEEP"
	| "NOTCHES_TOO_CLOSE"
	| "ROOT_FILLET_TOO_LARGE"
	| "THIN_WALL"
	| "UNSUPPORTED_FLANGE"
	| "CLEARANCE_OUT_OF_RANGE"
	| "JOINT_TOO_TALL"
	| "DOWEL_OFF_MATERIAL"
	| "DOWELS_TOO_CLOSE"
	| "WAVE_OVERHANG"
	| "LINK_FIELD_IGNORED";

export const hasErrors = (issues: readonly Issue[]): boolean =>
	issues.some((issue) => issue.severity === "error");
