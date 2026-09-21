import * as Comlink from "comlink";
import type { ExportFormat } from "~/export/filename";
import type { SpoolParams } from "~/params/schema";
import type { SpoolWorkerApi } from "~/worker/api";
import { createBuildQueue, type QueuedBuild } from "~/worker/queue";

export interface SpoolBuilder {
	build: QueuedBuild;
	exportModel(params: SpoolParams, format: ExportFormat): Promise<Uint8Array>;
	dispose(): void;
}

export function createSpoolBuilder(): SpoolBuilder {
	const worker = new Worker(new URL("./spool.worker.ts", import.meta.url), {
		type: "module",
	});
	const remote = Comlink.wrap<SpoolWorkerApi>(worker);

	return {
		build: createBuildQueue((params, quality) => remote.build(params, quality)),

		// Deliberately outside the build queue: an export is an explicit request that must always
		// run, never something a later preview refresh can supersede.
		exportModel: (params, format) => remote.exportModel(params, format),

		dispose() {
			remote[Comlink.releaseProxy]();
			worker.terminate();
		},
	};
}
