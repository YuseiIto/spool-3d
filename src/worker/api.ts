import type { ExportFormat } from "~/export/filename";
import type { MeshData, MeshStats } from "~/mesh/types";
import type { SpoolParams } from "~/params/schema";

/**
 * Resolution of the revolved surfaces.
 *
 * Two levels rather than a continuous knob: dragging a slider needs a mesh that arrives within a
 * frame or two, while the mesh that gets exported should be as round as the printer can resolve.
 * Anything in between just adds combinations to reason about.
 */
export type Quality = "draft" | "final";

export const CIRCULAR_SEGMENTS: Record<Quality, number> = {
	draft: 64,
	final: 256,
};

export interface BuildResult {
	mesh: MeshData;
	stats: MeshStats;
	/** Height of the parting plane in the returned mesh, for placing the mating half. */
	seamZ: number;
}

export interface SpoolWorkerApi {
	build(params: SpoolParams, quality: Quality): Promise<BuildResult>;
	/**
	 * Rebuilds at final quality and serialises it. The preview mesh is not reused: it may be the
	 * draft one, and exporting a coarser model than the one on screen is the kind of difference
	 * nobody notices until the part is printed.
	 */
	exportModel(params: SpoolParams, format: ExportFormat): Promise<Uint8Array>;
}
