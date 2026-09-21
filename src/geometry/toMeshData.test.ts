import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { buildSpool } from "~/geometry/build";
import { initManifold } from "~/geometry/runtime";
import { measure, toMeshData } from "~/geometry/toMeshData";
import { derive } from "~/params/derive";
import { defaultSpoolParams } from "~/params/schema";

const SEGMENTS = 32;

describe("toMeshData", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	/**
	 * The preview reads positions and normals out of one interleaved buffer at fixed offsets, so
	 * a change in this layout does not fail loudly — it renders an unlit black model. Pinning the
	 * layout here is what turns that into a test failure.
	 */
	it("interleaves a unit normal directly after each position", () => {
		const solid = buildSpool(mf, defaultSpoolParams, SEGMENTS);
		const mesh = toMeshData(solid);

		expect(mesh.numProp).toBe(6);

		const vertexCount = mesh.vertProperties.length / mesh.numProp;
		expect(vertexCount).toBeGreaterThan(0);

		for (let vertex = 0; vertex < vertexCount; vertex++) {
			const base = vertex * mesh.numProp + 3;
			const x = mesh.vertProperties[base] ?? 0;
			const y = mesh.vertProperties[base + 1] ?? 0;
			const z = mesh.vertProperties[base + 2] ?? 0;
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
		}

		solid.delete();
	});

	it("indexes whole triangles", () => {
		const solid = buildSpool(mf, defaultSpoolParams, SEGMENTS);
		const mesh = toMeshData(solid);

		expect(mesh.triVerts.length % 3).toBe(0);
		const vertexCount = mesh.vertProperties.length / mesh.numProp;
		expect(Math.max(...mesh.triVerts)).toBeLessThan(vertexCount);

		solid.delete();
	});

	it("reports the envelope the parameters asked for", () => {
		const solid = buildSpool(mf, defaultSpoolParams, 256);
		const stats = measure(solid);
		const g = derive(defaultSpoolParams);

		expect(stats.size[2]).toBeCloseTo(g.totalHeight, 6);
		expect(stats.size[0]).toBeCloseTo(2 * g.flangeRadius, 2);
		expect(stats.triangleCount).toBe(solid.numTri());

		solid.delete();
	});
});
