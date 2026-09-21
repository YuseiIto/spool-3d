import { describe, expect, it } from "vitest";
import type { MeshData, MeshStats } from "~/mesh/types";
import { defaultSpoolParams, type SpoolParams } from "~/params/schema";
import type { BuildResult } from "~/worker/api";
import { createBuildQueue } from "~/worker/queue";

const stubResult = (marker: number): BuildResult => ({
	mesh: {
		numProp: 3,
		vertProperties: new Float32Array([marker]),
		triVerts: new Uint32Array(),
	} satisfies MeshData,
	stats: {
		volume: marker,
		size: [0, 0, 0],
		triangleCount: 0,
	} satisfies MeshStats,
	seamZ: 0,
});

/** `windingWidth` doubles as the marker identifying a request in these tests. */
const request = (marker: number): SpoolParams => ({
	...defaultSpoolParams,
	windingWidth: marker,
});

/** Drains every pending microtask, so the queue reaches a settled state. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A build whose completions are released by hand, so ordering can be controlled. */
function controllableBuild() {
	const releases: Array<() => void> = [];
	const started: number[] = [];

	const build = (params: SpoolParams) => {
		started.push(params.windingWidth);
		return new Promise<BuildResult>((resolve) => {
			releases.push(() => resolve(stubResult(params.windingWidth)));
		});
	};

	return { build, releases, started };
}

describe("createBuildQueue", () => {
	it("never has more than one build in flight", async () => {
		const { build, releases, started } = controllableBuild();
		const queued = createBuildQueue(build);

		void queued(request(1), "draft");
		await settle();
		expect(started).toEqual([1]);

		void queued(request(2), "draft");
		await settle();
		expect(started).toEqual([1]);

		releases[0]?.();
		await settle();
		expect(started).toEqual([1, 2]);
	});

	it("drops requests that a newer one superseded before they could start", async () => {
		const { build, releases, started } = controllableBuild();
		const queued = createBuildQueue(build);

		void queued(request(1), "draft");
		await settle();

		const superseded = queued(request(2), "draft");
		const newest = queued(request(3), "draft");

		releases[0]?.();
		await settle();

		expect(await superseded).toBeNull();
		expect(started).toEqual([1, 3]);

		releases[1]?.();
		expect((await newest)?.stats.volume).toBe(3);
	});

	it("runs only the newest of a burst that arrives while idle", async () => {
		const { build, releases, started } = controllableBuild();
		const queued = createBuildQueue(build);

		const first = queued(request(1), "draft");
		const second = queued(request(2), "draft");
		const newest = queued(request(3), "draft");
		await settle();

		// Coalescing the whole burst is the point: building the intermediate shapes would only
		// render frames the user has already dragged past.
		expect(started).toEqual([3]);
		expect(await first).toBeNull();
		expect(await second).toBeNull();

		releases[0]?.();
		expect((await newest)?.stats.volume).toBe(3);
	});

	it("keeps accepting work after a build fails", async () => {
		let shouldFail = true;
		const queued = createBuildQueue((params) => {
			if (shouldFail) {
				shouldFail = false;
				return Promise.reject(new Error("kernel blew up"));
			}
			return Promise.resolve(stubResult(params.windingWidth));
		});

		await expect(queued(request(1), "draft")).rejects.toThrow("kernel blew up");
		expect((await queued(request(2), "draft"))?.stats.volume).toBe(2);
	});
});
