import { describe, expect, it } from "vitest";
import { writeBinaryStl } from "~/export/stl";
import type { MeshData } from "~/mesh/types";

/**
 * A unit tetrahedron with interleaved normals, so the exporters are exercised on the same
 * layout the geometry layer produces — without needing the CAD kernel to produce it.
 */
const tetrahedron: MeshData = {
	numProp: 6,
	// biome-ignore format: one vertex per line, position then normal
	vertProperties: new Float32Array([
		0, 0, 0,  0, 0, -1,
		1, 0, 0,  0, -1, 0,
		0, 1, 0,  -1, 0, 0,
		0, 0, 1,  0.577, 0.577, 0.577,
	]),
	triVerts: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
};

interface ParsedStl {
	header: string;
	triangleCount: number;
	triangles: { normal: number[]; vertices: number[][] }[];
}

/** An independent reader, so the test checks the bytes rather than re-running the writer. */
function parseBinaryStl(bytes: Uint8Array): ParsedStl {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const header = new TextDecoder()
		.decode(bytes.subarray(0, 80))
		.replace(/\0+$/, "");
	const triangleCount = view.getUint32(80, true);

	const triangles = [];
	let offset = 84;
	const float = () => {
		const value = view.getFloat32(offset, true);
		offset += 4;
		return value;
	};
	for (let i = 0; i < triangleCount; i++) {
		const normal = [float(), float(), float()];
		const vertices = [
			[float(), float(), float()],
			[float(), float(), float()],
			[float(), float(), float()],
		];
		expect(view.getUint16(offset, true)).toBe(0);
		offset += 2;
		triangles.push({ normal, vertices });
	}

	return { header, triangleCount, triangles };
}

describe("writeBinaryStl", () => {
	it("lays out 84 bytes of preamble and 50 per triangle", () => {
		const bytes = writeBinaryStl(tetrahedron, "test");
		expect(bytes.byteLength).toBe(84 + 50 * 4);
		expect(parseBinaryStl(bytes).triangleCount).toBe(4);
	});

	it("never starts the header with 'solid'", () => {
		// Readers sniff that prefix to tell ASCII STL from binary, and would then misparse this
		// file entirely.
		const bytes = writeBinaryStl(tetrahedron, "solid gold spool");
		expect(parseBinaryStl(bytes).header.startsWith("solid")).toBe(false);
	});

	it("writes the vertices of each triangle in order", () => {
		const { triangles } = parseBinaryStl(writeBinaryStl(tetrahedron, "test"));

		// Triangle 0 is vertices 0, 2, 1 — positions only, normals dropped.
		expect(triangles[0]?.vertices).toEqual([
			[0, 0, 0],
			[0, 1, 0],
			[1, 0, 0],
		]);
	});

	it("derives facet normals from the geometry rather than the vertex normals", () => {
		const { triangles } = parseBinaryStl(writeBinaryStl(tetrahedron, "test"));

		// Triangle 0 lies in the z = 0 plane wound clockwise seen from +z, so its outward facet
		// normal is -z. Vertex 0's stored normal happens to be -z too, but vertices 2 and 1 carry
		// -x and -y: averaging them would not give this.
		expect(triangles[0]?.normal).toEqual([0, 0, -1]);

		// The slanted face's normal is the normalised (1,1,1).
		const slanted = triangles[3]?.normal ?? [];
		for (const component of slanted) {
			expect(component).toBeCloseTo(1 / Math.sqrt(3), 5);
		}
	});

	it("accepts a position-only mesh", () => {
		const positionsOnly: MeshData = {
			numProp: 3,
			vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
			triVerts: new Uint32Array([0, 1, 2]),
		};

		const { triangles, triangleCount } = parseBinaryStl(
			writeBinaryStl(positionsOnly, "flat"),
		);
		expect(triangleCount).toBe(1);
		expect(triangles[0]?.normal).toEqual([0, 0, 1]);
	});
});
