import type { SpoolParams } from "~/params/schema";
import type { BuildResult, Quality } from "~/worker/api";

export type BuildFn = (
	params: SpoolParams,
	quality: Quality,
) => Promise<BuildResult>;

/** Resolves to `null` when a newer request arrived before this one got its turn. */
export type QueuedBuild = (
	params: SpoolParams,
	quality: Quality,
) => Promise<BuildResult | null>;

/**
 * Serialises builds onto the single worker and drops the ones a newer request has already made
 * irrelevant.
 *
 * Without this, dragging a slider queues one build per frame and the preview keeps redrawing
 * shapes the user has already scrolled past — the last one to arrive could even be a stale
 * intermediate, since nothing guarantees completion order once several are in flight.
 *
 * The guarantee callers rely on: **the most recent request always runs and always resolves with
 * a result.** Everything else may resolve to `null` instead, including a request that had not
 * started yet when a newer one arrived — coalescing a whole burst down to its last entry is the
 * point, not an edge case.
 *
 * Takes the build function rather than the worker so the policy can be tested on its own.
 */
export function createBuildQueue(build: BuildFn): QueuedBuild {
	let latest = 0;
	let tail: Promise<unknown> = Promise.resolve();

	return (params, quality) => {
		const generation = ++latest;

		const run = tail.then(() =>
			generation === latest ? build(params, quality) : null,
		);

		// Keep the chain alive past a rejection; one failed build must not wedge the queue.
		tail = run.catch(() => undefined);
		return run;
	};
}
