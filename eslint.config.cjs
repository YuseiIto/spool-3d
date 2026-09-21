const path = require("node:path");
const { includeIgnoreFile } = require("@eslint/compat");
const js = require("@eslint/js");
const typescript = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const jsxA11y = require("eslint-plugin-jsx-a11y");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

const gitignorePath = path.resolve(__dirname, ".gitignore");

/**
 * Enforces the one-way dependency direction `ui -> worker -> geometry -> manifold`.
 *
 * The geometry layer must stay runnable under plain Node so the headless Vitest suite can
 * exercise it, and the export layer must stay independent of the CAD kernel so its output can
 * be verified without instantiating WASM. Both properties are invisible at the type level, so
 * they are guarded here.
 */
const boundary = (groups, message) => ({
	"no-restricted-imports": [
		"error",
		{ patterns: [{ group: groups, message }] },
	],
});

module.exports = [
	includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),

	{
		files: ["**/*.{js,jsx,ts,tsx}"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			parserOptions: { ecmaFeatures: { jsx: true } },
			globals: { ...globals.browser, ...globals.node },
		},
		plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
		rules: { ...js.configs.recommended.rules },
	},

	{
		files: ["src/**/*.{jsx,tsx}"],
		settings: { react: { version: "detect" } },
		rules: {
			...react.configs.recommended.rules,
			...react.configs["jsx-runtime"].rules,
			...jsxA11y.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,
		},
	},

	{
		files: ["**/*.{ts,tsx}"],
		plugins: { "@typescript-eslint": typescript },
		languageOptions: { parser: typescriptParser },
		rules: {
			...typescript.configs.recommended.rules,
			// Biome owns formatting; its tab indentation trips this stylistic rule.
			"no-mixed-spaces-and-tabs": "off",
			// TypeScript resolves identifiers itself, and no-undef cannot see type-only names
			// such as `BlobPart`, so it only produces false positives here.
			"no-undef": "off",
		},
	},

	{
		files: ["src/params/**", "src/profile2d/**", "src/mesh/**"],
		rules: boundary(
			[
				"manifold-3d",
				"three",
				"three/*",
				"react",
				"react-dom",
				"~/geometry/*",
				"~/export/*",
				"~/worker/*",
				"~/preview/*",
				"~/ui/*",
			],
			"params, profile2d and mesh are dependency-free leaves. Move the logic that needs this import upward instead.",
		),
	},

	{
		files: ["src/geometry/**"],
		rules: boundary(
			[
				"three",
				"three/*",
				"react",
				"react-dom",
				"~/export/*",
				"~/worker/*",
				"~/preview/*",
				"~/ui/*",
			],
			"The geometry layer must stay runnable under plain Node so the headless geometry tests can exercise it.",
		),
	},

	{
		files: ["src/export/**"],
		rules: boundary(
			[
				"manifold-3d",
				"three",
				"three/*",
				"react",
				"react-dom",
				"~/geometry/*",
				"~/worker/*",
				"~/preview/*",
				"~/ui/*",
			],
			"Exporters consume MeshData only, so their output can be verified without instantiating the CAD kernel.",
		),
	},

	{
		files: ["src/preview/**", "src/ui/**"],
		// Only the serialisers are off limits, not the whole export directory: the UI legitimately
		// names the download and offers the format, it just must not do the work. Everything
		// expensive goes through ~/worker/client so it never blocks the main thread.
		rules: boundary(
			["manifold-3d", "~/geometry/*", "~/export/stl", "~/export/threemf"],
			"Run the CAD kernel and the serialisers through ~/worker/client, never on the main thread.",
		),
	},

	{
		files: ["*.config.ts", "eslint.config.cjs"],
		languageOptions: { globals: { ...globals.node } },
	},
];
