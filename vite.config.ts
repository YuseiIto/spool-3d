import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],

	// Relative asset URLs so a build works from any path (subdirectory previews, local file serving).
	base: "./",

	resolve: {
		// Honours the `~/*` alias declared in tsconfig.json.
		tsconfigPaths: true,
	},

	worker: {
		// manifold-3d ships an ES module (built with -sEXPORT_ES6=1); a classic worker cannot load it.
		format: "es",
		rollupOptions: {
			output: {
				// Its own directory, so the deployment can give the worker a Content-Security-Policy
				// of its own. Emscripten's embind glue builds its invokers with `new Function`, so
				// the thread running the CAD kernel needs 'unsafe-eval' — and nothing else does.
				entryFileNames: "workers/[name]-[hash].js",
				chunkFileNames: "workers/[name]-[hash].js",
			},
		},
	},

	build: {
		// The Manifold WASM module is awaited at the top level of the worker.
		target: "esnext",
	},

	test: {
		include: ["src/**/*.test.ts"],
		// Geometry tests instantiate the Manifold WASM module, which is slow to warm up.
		testTimeout: 30_000,
	},
});
