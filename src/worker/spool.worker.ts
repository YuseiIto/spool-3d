import * as Comlink from "comlink";
import type { Manifold } from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { ExportFormat } from "~/export/filename";
import { writeBinaryStl } from "~/export/stl";
import { writeThreeMf } from "~/export/threemf";
import { initManifold } from "~/geometry/runtime";
import { buildPart, type LaidOut, layOnBuildPlate } from "~/geometry/split";
import { measure, toMeshData } from "~/geometry/toMeshData";
import type { SpoolParams } from "~/params/schema";
import {
	type BuildResult,
	CIRCULAR_SEGMENTS,
	type Quality,
	type SpoolWorkerApi,
} from "~/worker/api";

/** Clearance left between the two copies a split spool is exported as. */
const PLATE_GAP_MM = 5;

// Vite rewrites the WASM asset to a hashed URL, which Emscripten's own resolution cannot find.
const manifold = initManifold(() => wasmUrl);

/**
 * Moves a freshly built solid onto the build plate.
 *
 * Applied to the preview as well as the export so the two never disagree about where the part
 * sits. The geometry layer keeps the parting plane at z = 0 because that is what makes the
 * mirror symmetry of the joints simple; nothing outside it needs that frame.
 */
function present(solid: Manifold): LaidOut {
	const laid = layOnBuildPlate(solid);
	solid.delete();
	return laid;
}

function describe(params: SpoolParams): string {
	return `flange ${params.flangeDiameter}mm, winding ${params.windingWidth}mm, core ${params.coreDiameter}mm, bore ${params.boreDiameter}mm`;
}

const api: SpoolWorkerApi = {
	async build(params: SpoolParams, quality: Quality): Promise<BuildResult> {
		const mf = await manifold;
		const { solid, seamZ } = present(
			buildPart(mf, params, CIRCULAR_SEGMENTS[quality]),
		);
		try {
			const result: BuildResult = {
				mesh: toMeshData(solid),
				stats: measure(solid),
				seamZ,
			};
			// Hand the buffers over instead of structured-cloning them; a final-quality spool is
			// several megabytes and the copy is plainly visible while dragging a slider.
			return Comlink.transfer(result, [
				result.mesh.vertProperties.buffer as ArrayBuffer,
				result.mesh.triVerts.buffer as ArrayBuffer,
			]);
		} finally {
			solid.delete();
		}
	},

	async exportModel(
		params: SpoolParams,
		format: ExportFormat,
	): Promise<Uint8Array> {
		const mf = await manifold;
		const { solid } = present(buildPart(mf, params, CIRCULAR_SEGMENTS.final));
		try {
			const mesh = toMeshData(solid);
			const bytes =
				format === "stl"
					? writeBinaryStl(mesh, describe(params))
					: writeThreeMf(mesh, {
							title: "spool-3d spool",
							description: describe(params),
							// A split spool arrives as both halves on the plate, ready to slice.
							secondCopyOffsetX: params.split
								? params.flangeDiameter + PLATE_GAP_MM
								: undefined,
						});
			return Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]);
		} finally {
			solid.delete();
		}
	},
};

Comlink.expose(api);
