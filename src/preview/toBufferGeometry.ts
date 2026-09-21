import {
	BufferAttribute,
	BufferGeometry,
	InterleavedBuffer,
	InterleavedBufferAttribute,
} from "three";
import type { MeshData } from "~/mesh/types";

/**
 * Wraps a mesh from the worker in a `BufferGeometry` without copying it.
 *
 * Manifold's interleaved layout is already what three.js wants, so the typed arrays are handed
 * straight to the GPU upload path. The arrays arrive transferred from the worker, which means
 * the geometry owns them outright — `dispose()` is the only thing keeping memory flat while a
 * slider is being dragged.
 */
export function toBufferGeometry(mesh: MeshData): BufferGeometry {
	const geometry = new BufferGeometry();
	const { numProp, vertProperties, triVerts } = mesh;

	if (numProp === 3) {
		geometry.setAttribute(
			"position",
			new BufferAttribute(vertProperties, 3, false),
		);
	} else {
		const interleaved = new InterleavedBuffer(vertProperties, numProp);
		geometry.setAttribute(
			"position",
			new InterleavedBufferAttribute(interleaved, 3, 0, false),
		);
		// Manifold writes the normal into the channel right after the position.
		geometry.setAttribute(
			"normal",
			new InterleavedBufferAttribute(interleaved, 3, 3, false),
		);
	}

	geometry.setIndex(new BufferAttribute(triVerts, 1, false));
	geometry.computeBoundingSphere();

	return geometry;
}
