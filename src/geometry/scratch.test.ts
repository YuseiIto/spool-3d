import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { initManifold } from "~/geometry/runtime";
import { Scratch, withScratch } from "~/geometry/scratch";
import { buildPart } from "~/geometry/split";
import { jointKinds } from "~/params/joints";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";

declare const process: { memoryUsage(): { rss: number } };

const SEGMENTS = 64;

/** Stands in for a kernel handle: all `Scratch` needs of one is that it can be deleted. */
const freeable = () => {
	const record = { deleted: 0, delete: () => void record.deleted++ };
	return record;
};

describe("Scratch", () => {
	it("frees everything it held", () => {
		const scratch = new Scratch();
		const values = [freeable(), freeable(), freeable()];
		for (const value of values) scratch.hold(value);

		scratch.releaseAll();
		expect(values.map((v) => v.deleted)).toEqual([1, 1, 1]);
	});

	it("spares the objects the caller is keeping", () => {
		const scratch = new Scratch();
		const [kept, dropped, alsoKept] = [freeable(), freeable(), freeable()];
		scratch.holdAll([kept, dropped, alsoKept]);

		scratch.releaseAll(kept, alsoKept);
		expect([kept.deleted, dropped.deleted, alsoKept.deleted]).toEqual([
			0, 1, 0,
		]);
	});

	it("frees an object held twice exactly once", () => {
		const scratch = new Scratch();
		const value = freeable();
		scratch.hold(value);
		scratch.hold(value);

		scratch.releaseAll();
		expect(value.deleted).toBe(1);
	});

	it("frees what a failed build held", () => {
		const held = freeable();

		expect(() =>
			withScratch(() => {
				throw new Error("no");
			}),
		).toThrow();
		expect(() =>
			withScratch((scratch) => {
				scratch.hold(held);
				throw new Error("no");
			}),
		).toThrow();
		expect(held.deleted).toBe(1);
	});
});

/*
 * Repeated builds must not grow the heap.
 *
 * Measured through the process rather than by counting objects, because Manifold offers no way to
 * ask how many handles are live. That makes this a coarse instrument, so the threshold is coarse
 * too — the leak it replaced ran at two thirds of a megabyte per build, some fifty times the
 * headroom left here, and the worker rebuilds on every frame of a slider drag.
 */
describe("repeated builds", () => {
	let mf: ManifoldToplevel;
	beforeAll(async () => {
		mf = await initManifold();
	});

	const megabytesOver = (params: SpoolParams, builds: number): number => {
		// Warm up first, so one-off allocations are not read as growth.
		for (let i = 0; i < 10; i++) buildPart(mf, params, SEGMENTS).delete();

		const before = process.memoryUsage().rss;
		for (let i = 0; i < builds; i++) buildPart(mf, params, SEGMENTS).delete();
		return (process.memoryUsage().rss - before) / 1e6;
	};

	it("leaves the heap flat with every feature switched on", () => {
		const params: SpoolParams = {
			...defaultSpoolParams,
			lighteningHoleCount: 8,
			lighteningHoleCornerRadius: 2,
			startHoleCount: 2,
			wireNotchCount: 4,
		};
		expect(megabytesOver(params, 60)).toBeLessThan(20);
	});

	it.each(jointKinds)("leaves the heap flat for the %s seam", (joint) => {
		expect(
			megabytesOver({ ...defaultSpoolParams, split: true, joint }, 40),
		).toBeLessThan(20);
	});
});
