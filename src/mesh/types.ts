/**
 * A triangle mesh in the layout Manifold hands out and three.js can read without copying.
 *
 * This is the only type that crosses the worker boundary, which is why it lives in its own
 * dependency-free module: the geometry side must not have to know about three.js to produce it,
 * and the preview side must not have to load the CAD kernel to consume it.
 */
export interface MeshData {
	/** Floats per vertex. 3 is position only; 6 means a normal follows each position. */
	numProp: number;
	/** Interleaved vertex properties; the first three of each stride are x, y, z. */
	vertProperties: Float32Array;
	/** Triangle indices, wound counter-clockwise when seen from outside. */
	triVerts: Uint32Array;
}

export interface MeshStats {
	/** Cubic millimetres of material. */
	volume: number;
	/** Axis-aligned extent in millimetres, as `[x, y, z]`. */
	size: readonly [number, number, number];
	triangleCount: number;
}
