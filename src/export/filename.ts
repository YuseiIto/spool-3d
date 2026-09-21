import type { SpoolParams } from "~/params/schema";

export type ExportFormat = "stl" | "3mf";

const round = (value: number) => Number(value.toFixed(1)).toString();

/**
 * Names the file after what distinguishes one download from another.
 *
 * Downloads folders fill up with indistinguishable `spool.stl` files otherwise. The four outer
 * dimensions are not enough on their own: a whole spool and the half that makes one when printed
 * twice share every one of them, and which of the two a file holds is the decision this tool
 * exists to offer — so the seam is named too, and a one-piece build says so.
 */
export function exportFilename(
	params: SpoolParams,
	format: ExportFormat,
): string {
	const parts = [
		`d${round(params.flangeDiameter)}`,
		`w${round(params.windingWidth)}`,
		`c${round(params.coreDiameter)}`,
		`b${round(params.boreDiameter)}`,
		params.split ? `split-${params.joint}` : "whole",
	];
	return `spool-${parts.join("-")}.${format}`;
}
