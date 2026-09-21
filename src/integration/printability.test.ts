import { strFromU8, unzipSync } from "fflate";
import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { writeBinaryStl } from "~/export/stl";
import { writeThreeMf } from "~/export/threemf";
import { initManifold } from "~/geometry/runtime";
import { buildPart } from "~/geometry/split";
import { toMeshData } from "~/geometry/toMeshData";
import { inspectStlSurface } from "~/integration/stlSurface";
import { jointKinds } from "~/params/joints";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

/**
 * End-to-end printability: parameters through the kernel and out to bytes, then the bytes are
 * re-read and judged on their own terms.
 *
 * Unit tests either side of the export boundary cannot catch a serialiser that quietly drops or
 * reorders geometry, because each half only ever sees its own representation. This is also the
 * single property that decides whether the download is usable at all — a slicer rejects a mesh
 * that is not closed.
 */
const SEGMENTS = 64;

const variants: Record<string, SpoolParams> = {
	default: defaultSpoolParams,
	wide: { ...defaultSpoolParams, windingWidth: 120, flangeDiameter: 140 },
	narrow: {
		...defaultSpoolParams,
		windingWidth: 6,
		coreDiameter: 12,
		boreDiameter: 3,
		flangeDiameter: 24,
		flangeThickness: 1.2,
	},
};

describe("exported models are printable", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	// Routed through buildPart, so the split builds are exercised by the same helper.
	const exportStl = (params: SpoolParams) => {
		const solid = buildPart(mf, params, SEGMENTS);
		try {
			return writeBinaryStl(toMeshData(solid), "test");
		} finally {
			solid.delete();
		}
	};

	it.each(Object.entries(variants))(
		"emits a closed, consistently oriented STL for the %s spool",
		(_name, params) => {
			const report = inspectStlSurface(exportStl(params));

			expect(report.degenerateTriangles).toBe(0);
			expect(report.edgesUsedMoreThanOnce).toBe(0);
			expect(report.edgesWithoutAnOppositeTwin).toBe(0);
			expect(report.normalsDisagreeingWithWinding).toBe(0);
			expect(report.watertight).toBe(true);
		},
	);

	it.each(jointKinds)(
		"emits a closed STL for a split part with the %s joint",
		(joint) => {
			// The seam is where the geometry is most intricate, and where a boolean is most
			// likely to leave a sliver that survives in the kernel but not through the exporter.
			const report = inspectStlSurface(
				exportStl({ ...defaultSpoolParams, split: true, joint }),
			);

			expect(report.degenerateTriangles).toBe(0);
			expect(report.edgesWithoutAnOppositeTwin).toBe(0);
			expect(report.normalsDisagreeingWithWinding).toBe(0);
			expect(report.watertight).toBe(true);
		},
	);

	it("preserves the bore as the only hole through the exported surface", () => {
		// Recovered from the bytes via V - E + F, so it checks the exported topology rather than
		// re-reading what the kernel already told us.
		expect(inspectStlSurface(exportStl(defaultSpoolParams)).genus).toBe(1);
	});

	it("keeps STL and 3MF describing the same triangles", () => {
		const solid = buildPart(mf, defaultSpoolParams, SEGMENTS);
		const mesh = toMeshData(solid);
		const meshTriangles = mesh.triVerts.length / 3;
		const meshVertices = mesh.vertProperties.length / mesh.numProp;

		const stl = inspectStlSurface(writeBinaryStl(mesh, "test"));
		const model = strFromU8(
			unzipSync(writeThreeMf(mesh, { title: "t", description: "d" }))[
				"3D/3dmodel.model"
			] ?? new Uint8Array(),
		);

		expect(stl.triangleCount).toBe(meshTriangles);
		expect(model.match(/<triangle /g)).toHaveLength(meshTriangles);

		// 3MF indexes vertices, so it carries them exactly as the kernel emitted them. The STL
		// has fewer, because `calculateNormals` splits a position into one vertex per face
		// meeting at a sharp edge and STL — having no per-vertex normals — welds them back.
		expect(model.match(/<vertex /g)).toHaveLength(meshVertices);
		expect(stl.uniqueVertices).toBeLessThan(meshVertices);

		solid.delete();
	});
});
