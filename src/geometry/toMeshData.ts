import type { Manifold } from "manifold-3d";
import type { MeshData, MeshStats } from "~/mesh/types";

/**
 * Angle above which an edge keeps a crease instead of being smoothed over.
 *
 * A spool is mostly flat faces meeting flat faces, so letting Manifold split the normals at
 * sharp edges renders the flange rims crisply, whereas three.js's own `computeVertexNormals`
 * would average across them and make the revolved facets read as a smooth blob.
 */
const SHARP_EDGE_DEGREES = 60;

/**
 * Manifold's "standard slot" for normals.
 *
 * Do not change this to 3 to mean "the channel after the position". Non-zero indices are a
 * deprecated compatibility path that leaves the standard slot zero-filled and appends the real
 * normals after it, producing `numProp === 9` with channels 3..5 all zero — which renders as an
 * unlit black model. Slot 0 is what makes `getMesh()` emit `numProp === 6` with the normals
 * directly after the position, the layout `toBufferGeometry` reads.
 */
const NORMAL_SLOT = 0;

export function toMeshData(solid: Manifold): MeshData {
	const withNormals = solid.calculateNormals(NORMAL_SLOT, SHARP_EDGE_DEGREES);
	try {
		const mesh = withNormals.getMesh();
		return {
			numProp: mesh.numProp,
			vertProperties: mesh.vertProperties,
			triVerts: mesh.triVerts,
		};
	} finally {
		withNormals.delete();
	}
}

export function measure(solid: Manifold): MeshStats {
	const { min, max } = solid.boundingBox();
	return {
		volume: solid.volume(),
		size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
		triangleCount: solid.numTri(),
	};
}
