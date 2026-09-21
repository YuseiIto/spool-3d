import { describe, expect, it } from "vitest";
import headersFile from "../../public/_headers?raw";

/**
 * Checks the deployed response headers by reading the file the deployment actually uses.
 *
 * Cloudflare applies every rule whose pattern matches and returns a repeated header twice rather
 * than letting the later one win. For Content-Security-Policy that is not a merge but a
 * conjunction: the browser enforces each policy separately and permits only what all of them
 * permit, so a permissive rule cannot loosen a strict one — it can only be swallowed by it.
 *
 * That is how the CAD kernel's `'unsafe-eval'` reached production and did nothing. A local server
 * that set the headers with `setHeader` looked correct, because overwriting is the one thing
 * Cloudflare does not do.
 */

/** Headers whose repetition tightens rather than replaces, so a path may only receive one. */
const AT_MOST_ONCE = ["content-security-policy"];

/** Paths standing for each kind of response the site serves. */
const PATHS = [
	"/",
	"/index.html",
	"/workers/spool.worker-CIErYryV.js",
	"/assets/index-gi92iHAn.js",
	"/assets/index-DZ8RPNB7.css",
	"/assets/manifold-BE4c7gO-.wasm",
	"/assets/ibm-plex-mono-latin-400-normal-DMJ8VG8y.woff2",
	"/favicon.ico",
];

interface Rule {
	pattern: string;
	headers: [string, string][];
}

function parseRules(file: string): Rule[] {
	const rules: Rule[] = [];

	for (const line of file.split("\n")) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;

		if (!/^\s/.test(line)) {
			rules.push({ pattern: line.trim(), headers: [] });
			continue;
		}

		const rule = rules.at(-1);
		const at = line.indexOf(":");
		if (!rule || at < 0) throw new Error(`stray header line: ${line}`);
		rule.headers.push([
			line.slice(0, at).trim().toLowerCase(),
			line.slice(at + 1).trim(),
		]);
	}

	return rules;
}

function matches(pattern: string, path: string): boolean {
	// Placeholders would need their own matching; nothing here uses them, and quietly treating one
	// as a literal would make this test agree with a file it no longer models.
	if (pattern.includes(":")) throw new Error(`unsupported pattern: ${pattern}`);

	const escaped = pattern
		.split("*")
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${escaped}$`).test(path);
}

const RULES = parseRules(headersFile);

const headersFor = (path: string): [string, string][] =>
	RULES.filter((rule) => matches(rule.pattern, path)).flatMap(
		(rule) => rule.headers,
	);

const valuesOf = (path: string, name: string): string[] =>
	headersFor(path)
		.filter(([header]) => header === name)
		.map(([, value]) => value);

describe("the deployed response headers", () => {
	it.each(PATHS)("sends at most one conjunctive header to %s", (path) => {
		for (const name of AT_MOST_ONCE) {
			expect(
				valuesOf(path, name).length,
				`${name} on ${path}`,
			).toBeLessThanOrEqual(1);
		}
	});

	it("gives the document a policy that withholds unsafe-eval", () => {
		for (const path of ["/", "/index.html"]) {
			const [policy] = valuesOf(path, "content-security-policy");
			expect(policy, path).toContain("'wasm-unsafe-eval'");
			expect(policy, path).not.toContain("'unsafe-eval'");
			expect(policy, path).toContain("frame-ancestors 'none'");
		}
	});

	it("gives the worker a policy that grants it", () => {
		// Emscripten's embind glue builds its invokers with `new Function`, and only the thread
		// running the kernel has any business doing that.
		const [policy] = valuesOf(
			"/workers/spool.worker-CIErYryV.js",
			"content-security-policy",
		);
		expect(policy).toContain("'unsafe-eval'");
	});

	it("protects every response from content sniffing", () => {
		for (const path of PATHS) {
			expect(valuesOf(path, "x-content-type-options"), path).toEqual([
				"nosniff",
			]);
		}
	});
});
