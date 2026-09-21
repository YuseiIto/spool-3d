import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { writeThreeMf } from "~/export/threemf";
import type { MeshData } from "~/mesh/types";

const tetrahedron: MeshData = {
	numProp: 6,
	// biome-ignore format: one vertex per line, position then normal
	vertProperties: new Float32Array([
		0, 0, 0,  0, 0, -1,
		2, 0, 0,  0, -1, 0,
		0, 3, 0,  -1, 0, 0,
		0, 0, 4,  0.577, 0.577, 0.577,
	]),
	triVerts: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
};

const open = (bytes: Uint8Array) => {
	const entries = unzipSync(bytes);
	const read = (path: string) => {
		const entry = entries[path];
		if (!entry) throw new Error(`missing ${path} in 3MF package`);
		return strFromU8(entry);
	};
	return { names: Object.keys(entries), read };
};

const options = { title: "Test spool", description: "a test spool" };

describe("writeThreeMf", () => {
	it("packages the three parts an OPC reader requires", () => {
		const { names } = open(writeThreeMf(tetrahedron, options));

		expect(names).toContain("3D/3dmodel.model");
		expect(names).toContain("[Content_Types].xml");
		expect(names).toContain("_rels/.rels");
	});

	it("declares millimetres", () => {
		// The whole reason to prefer 3MF over STL: the file states its unit, so no slicer has to
		// guess whether the numbers are millimetres or inches.
		const { read } = open(writeThreeMf(tetrahedron, options));
		expect(read("3D/3dmodel.model")).toContain('unit="millimeter"');
	});

	it("points the root relationship at the model part", () => {
		const { read } = open(writeThreeMf(tetrahedron, options));
		expect(read("_rels/.rels")).toContain("3D/3dmodel.model");
	});

	it("writes every vertex and triangle exactly once", () => {
		const { read } = open(writeThreeMf(tetrahedron, options));
		const model = read("3D/3dmodel.model");

		expect(model.match(/<vertex /g)).toHaveLength(4);
		expect(model.match(/<triangle /g)).toHaveLength(4);
	});

	it("keeps positions and drops the interleaved normals", () => {
		const { read } = open(writeThreeMf(tetrahedron, options));
		const model = read("3D/3dmodel.model");

		// Coordinates are written with a fixed number of decimals, so match on value rather than
		// on formatting.
		const coordinates = [
			...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g),
		].map(([, x, y, z]) => [Number(x), Number(y), Number(z)]);

		// If the normals leaked through, every coordinate after the first vertex would be
		// shifted by three floats and this would not match.
		expect(coordinates).toEqual([
			[0, 0, 0],
			[2, 0, 0],
			[0, 3, 0],
			[0, 0, 4],
		]);
	});

	it("builds one item referencing the mesh object", () => {
		const { read } = open(writeThreeMf(tetrahedron, options));
		const model = read("3D/3dmodel.model");

		expect(model).toContain("<build>");
		expect(model.match(/<item /g)).toHaveLength(1);
	});

	describe("a split spool", () => {
		const both = () =>
			open(
				writeThreeMf(tetrahedron, { ...options, secondCopyOffsetX: 85 }),
			).read("3D/3dmodel.model");

		it("places two copies without repeating the mesh", () => {
			const model = both();

			expect(model.match(/<item /g)).toHaveLength(2);
			// One object, referenced twice: the geometry is not duplicated in the file.
			expect(model.match(/<object /g)).toHaveLength(1);
			expect(model.match(/<vertex /g)).toHaveLength(4);
		});

		it("offsets the second copy along the plate rather than stacking it", () => {
			// Assembled would be a picture of the finished spool; a slicer needs them side by
			// side, both the same way up.
			const transforms = [
				...both().matchAll(/<item [^>]*transform="([^"]+)"/g),
			].map(([, value]) => (value ?? "").split(" ").map(Number));

			expect(transforms).toHaveLength(2);

			// 3MF reads these as "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32".
			const [first, second] = transforms;
			expect(first?.slice(9)).toEqual([0, 0, 0]);
			expect(second?.slice(9)).toEqual([85, 0, 0]);

			// The rotation part stays the identity, so the copy is not turned over in the file.
			expect(second?.slice(0, 9)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
		});
	});
});
