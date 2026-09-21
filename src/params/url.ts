import type { Issue } from "~/params/issue";
import {
	defaultSpoolParams,
	type SpoolParams,
	spoolParamsSchema,
} from "~/params/schema";

/**
 * Short, stable keys for the query string.
 *
 * Written out rather than derived from the field names. A shared link is a permanent artefact —
 * it ends up in a README, an issue, a bookmark — so renaming a field in TypeScript must not
 * silently invalidate every link anyone has saved. Adding a field here is a deliberate act, and
 * the test that every field appears exactly once is what keeps it from being forgotten.
 */
const KEYS = {
	flangeDiameter: "fd",
	flangeThickness: "ft",
	coreDiameter: "cd",
	windingWidth: "ww",
	boreDiameter: "bd",

	rootFilletRadius: "rf",
	rimTreatment: "rt",
	rimSize: "rs",
	boreChamfer: "bc",

	lighteningHoleCount: "lhn",
	lighteningHoleMargin: "lhm",
	lighteningHoleCornerRadius: "lhr",

	startHoleCount: "shn",
	startHoleDiameter: "shd",

	wireNotchCount: "wnn",
	wireNotchWidth: "wnw",
	wireNotchDepth: "wnd",

	split: "sp",
	joint: "j",
	jointClearance: "clr",
	dowelCount: "dn",
	dowelDiameter: "dd",
	dowelHeight: "dh",
	dowelCircleDiameter: "dc",
	waveCount: "vn",
	waveAmplitude: "va",
	stepCount: "sn",
	stepHeight: "sh",
	lapCount: "ln",
	lapLength: "ll",
} as const satisfies Record<keyof SpoolParams, string>;

const FIELDS = Object.keys(KEYS) as (keyof SpoolParams)[];
const FIELD_BY_KEY = new Map(
	FIELDS.map((field) => [KEYS[field] as string, field]),
);

/** Enough for a printer that resolves microns; beyond this is float noise from the kernel. */
const DECIMALS = 3;

/**
 * Encodes the parameters that differ from the defaults.
 *
 * Omitting the defaults keeps a link to a stock spool empty and a link to a lightly tweaked one
 * short enough to read, which matters because these links are meant to be looked at and edited by
 * hand as much as clicked.
 */
export function encodeParams(params: SpoolParams): string {
	const query = new URLSearchParams();

	for (const field of FIELDS) {
		const value = params[field];
		if (value === defaultSpoolParams[field]) continue;

		query.set(
			KEYS[field],
			typeof value === "number"
				? String(Number(value.toFixed(DECIMALS)))
				: String(value),
		);
	}

	return query.toString();
}

export interface DecodedParams {
	params: SpoolParams;
	issues: Issue[];
}

/**
 * Reads parameters back from a query string, one field at a time.
 *
 * Deliberately forgiving. A link may have been written against an older version, hand-edited into
 * something impossible, or truncated by a chat client — and in every one of those cases showing a
 * spool with one field reset beats showing an error page. Unknown keys are ignored outright,
 * since they are what an older build's links look like.
 */
export function decodeParams(search: string): DecodedParams {
	const query = new URLSearchParams(search);
	const raw: Record<string, unknown> = {};
	const rejected: string[] = [];

	for (const [key, value] of query) {
		const field = FIELD_BY_KEY.get(key);
		if (!field) continue;

		const parsed = coerce(field, value);
		if (parsed === undefined) rejected.push(key);
		else raw[field] = parsed;
	}

	const result = spoolParamsSchema.safeParse(raw);
	if (result.success) {
		return { params: result.data, issues: issuesFor(rejected) };
	}

	// Drop only the fields zod objected to, rather than the whole link.
	for (const problem of result.error.issues) {
		const field = problem.path[0];
		if (typeof field !== "string" || !(field in raw)) continue;
		delete raw[field];
		const key = KEYS[field as keyof SpoolParams] ?? field;
		if (!rejected.includes(key)) rejected.push(key);
	}

	/*
	 * Second pass, and the last one.
	 *
	 * Not every objection names a field that can be dropped — an issue with an empty path, from a
	 * refinement over the object as a whole, leaves `raw` exactly as it was. Parsing again
	 * unguarded would then throw, and this runs during the first render, so the tool's answer to a
	 * malformed link would be a blank page. The whole contract here is that a spool with one field
	 * reset beats an error, so an objection that survives drops the link entirely.
	 */
	const retry = spoolParamsSchema.safeParse(raw);
	if (retry.success) return { params: retry.data, issues: issuesFor(rejected) };

	return {
		params: defaultSpoolParams,
		issues: [
			{
				code: "LINK_FIELD_IGNORED",
				severity: "warning",
				field: "flangeDiameter",
				message:
					"This link could not be read, so every setting is at its default.",
			},
		],
	};
}

function coerce(field: keyof SpoolParams, value: string): unknown {
	const fallback = defaultSpoolParams[field];

	if (typeof fallback === "boolean") {
		if (value === "true") return true;
		if (value === "false") return false;
		return undefined;
	}
	if (typeof fallback === "number") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return value;
}

function issuesFor(rejected: readonly string[]): Issue[] {
	if (rejected.length === 0) return [];
	return [
		{
			code: "LINK_FIELD_IGNORED",
			severity: "warning",
			field: "flangeDiameter",
			message: `This link had values that could not be read (${rejected.join(", ")}), so those settings are at their defaults.`,
		},
	];
}
