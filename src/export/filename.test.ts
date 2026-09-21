import { describe, expect, it } from "vitest";
import { exportFilename } from "~/export/filename";
import { jointKinds } from "~/params/joints";
import { defaultSpoolParams } from "~/params/schema";

describe("exportFilename", () => {
	it("carries the dimensions and the extension", () => {
		expect(exportFilename(defaultSpoolParams, "stl")).toMatch(
			/^spool-d55-w25-c25-b20-.+\.stl$/,
		);
	});

	/*
	 * A whole spool and the half that makes one when printed twice share every outer dimension,
	 * so naming a file by those alone puts two completely different objects under one name — and
	 * the browser answers that by appending "(1)", which says nothing about which is which.
	 */
	it("tells a whole spool apart from a split one", () => {
		const whole = exportFilename(
			{ ...defaultSpoolParams, split: false },
			"3mf",
		);
		const split = exportFilename({ ...defaultSpoolParams, split: true }, "3mf");

		expect(whole).not.toBe(split);
	});

	it("tells the seams apart", () => {
		const names = jointKinds.map((joint) =>
			exportFilename({ ...defaultSpoolParams, split: true, joint }, "3mf"),
		);

		expect(new Set(names).size).toBe(jointKinds.length);
	});

	it("says nothing about the seam of a one-piece spool", () => {
		// There is no seam to name, and naming one would suggest the file holds a half.
		const name = exportFilename(
			{ ...defaultSpoolParams, split: false, joint: "dowel" },
			"stl",
		);
		expect(name).not.toContain("dowel");
	});
});
