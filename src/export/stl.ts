import type { MeshData } from "~/mesh/types";

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;
const LITTLE_ENDIAN = true;

/**
 * Writes a binary STL.
 *
 * Manifold deliberately has no STL writer — the format cannot carry units, and it repeats every
 * vertex once per triangle instead of indexing them. It is still what most of the 3D printing
 * world reads, so this exists; 3MF is the better default.
 *
 * The facet normal is recomputed per triangle rather than taken from the vertex normals: STL
 * stores one normal for the whole facet, and averaged vertex normals would disagree with the
 * geometry the facet actually describes.
 */
export function writeBinaryStl(mesh: MeshData, header: string): Uint8Array {
	const triangleCount = mesh.triVerts.length / 3;
	const bytes = new Uint8Array(
		HEADER_BYTES + 4 + triangleCount * TRIANGLE_BYTES,
	);
	const view = new DataView(bytes.buffer);

	writeHeader(bytes, header);
	view.setUint32(HEADER_BYTES, triangleCount, LITTLE_ENDIAN);

	const { numProp, vertProperties, triVerts } = mesh;
	const position = (vertex: number, axis: number) =>
		vertProperties[vertex * numProp + axis] ?? 0;

	let offset = HEADER_BYTES + 4;
	for (let triangle = 0; triangle < triangleCount; triangle++) {
		const a = triVerts[triangle * 3] ?? 0;
		const b = triVerts[triangle * 3 + 1] ?? 0;
		const c = triVerts[triangle * 3 + 2] ?? 0;

		const ax = position(a, 0);
		const ay = position(a, 1);
		const az = position(a, 2);
		const bx = position(b, 0);
		const by = position(b, 1);
		const bz = position(b, 2);
		const cx = position(c, 0);
		const cy = position(c, 1);
		const cz = position(c, 2);

		const ux = bx - ax;
		const uy = by - ay;
		const uz = bz - az;
		const vx = cx - ax;
		const vy = cy - ay;
		const vz = cz - az;

		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const length = Math.hypot(nx, ny, nz);
		if (length > 0) {
			nx /= length;
			ny /= length;
			nz /= length;
		}

		for (const value of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) {
			view.setFloat32(offset, value, LITTLE_ENDIAN);
			offset += 4;
		}

		// Attribute byte count: unused, and non-zero values confuse some slicers.
		view.setUint16(offset, 0, LITTLE_ENDIAN);
		offset += 2;
	}

	return bytes;
}

/**
 * A binary STL whose header starts with "solid" is routinely misread as an ASCII one, so the
 * header is prefixed and truncated to fit rather than written verbatim.
 */
function writeHeader(bytes: Uint8Array, header: string): void {
	const text = `spool-3d ${header}`.slice(0, HEADER_BYTES);
	for (let i = 0; i < text.length; i++) {
		bytes[i] = text.charCodeAt(i) & 0x7f;
	}
}
