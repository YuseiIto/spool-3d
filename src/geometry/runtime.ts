import Module, { type ManifoldToplevel } from "manifold-3d";

let instance: Promise<ManifoldToplevel> | undefined;

/**
 * Loads and memoises the Manifold WASM module.
 *
 * `locateFile` is the single seam that keeps this layer runnable in both environments: under
 * Node the default resolution finds `manifold.wasm` next to the JS, while the browser build has
 * to hand over the URL Vite emitted for the hashed asset. Without it the geometry layer could
 * only be exercised in a browser.
 */
export function initManifold(
	locateFile?: () => string,
): Promise<ManifoldToplevel> {
	instance ??= Module(locateFile ? { locateFile } : undefined).then((wasm) => {
		wasm.setup();
		return wasm;
	});
	return instance;
}
