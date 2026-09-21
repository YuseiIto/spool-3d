import { useCallback, useEffect, useRef, useState } from "react";
import { type ExportFormat, exportFilename } from "~/export/filename";
import type { MeshData, MeshStats } from "~/mesh/types";
import type { SpoolParams } from "~/params/schema";
import { createSpoolBuilder, type SpoolBuilder } from "~/worker/client";

/**
 * How long the parameters must hold still before the high-resolution rebuild starts.
 *
 * Long enough that dragging a slider never triggers one, short enough that letting go feels like
 * it refined immediately.
 */
const SETTLE_MS = 350;

export interface SpoolModel {
	mesh: MeshData | null;
	stats: MeshStats | null;
	/** Height of the parting plane in the current mesh. */
	seamZ: number;
	error: string | null;
	exporting: ExportFormat | null;
	download(format: ExportFormat): void;
}

export function useSpoolModel(params: SpoolParams): SpoolModel {
	const builder = useRef<SpoolBuilder | null>(null);
	const [mesh, setMesh] = useState<MeshData | null>(null);
	const [stats, setStats] = useState<MeshStats | null>(null);
	const [seamZ, setSeamZ] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [exporting, setExporting] = useState<ExportFormat | null>(null);

	useEffect(() => {
		const created = createSpoolBuilder();
		builder.current = created;
		return () => {
			builder.current = null;
			created.dispose();
		};
	}, []);

	useEffect(() => {
		const current = builder.current;
		if (!current) return;

		let live = true;

		const apply = (result: Awaited<ReturnType<SpoolBuilder["build"]>>) => {
			// A null result means a newer request overtook this one; its result is on the way.
			if (!live || !result) return;
			setMesh(result.mesh);
			setStats(result.stats);
			setSeamZ(result.seamZ);
			setError(null);
		};

		const fail = (cause: unknown) => {
			if (live)
				setError(cause instanceof Error ? cause.message : String(cause));
		};

		current.build(params, "draft").then(apply).catch(fail);
		const refine = setTimeout(() => {
			current.build(params, "final").then(apply).catch(fail);
		}, SETTLE_MS);

		return () => {
			live = false;
			clearTimeout(refine);
		};
	}, [params]);

	const download = useCallback(
		(format: ExportFormat) => {
			const current = builder.current;
			if (!current) return;

			setExporting(format);
			current
				.exportModel(params, format)
				.then((bytes) => {
					saveFile(bytes, exportFilename(params, format));
					setError(null);
				})
				.catch((cause: unknown) =>
					setError(cause instanceof Error ? cause.message : String(cause)),
				)
				.finally(() => setExporting(null));
		},
		[params],
	);

	return { mesh, stats, seamZ, error, exporting, download };
}

/**
 * Hands the bytes to the browser as a download.
 *
 * The anchor goes into the document and the URL is revoked a turn later, neither of which is
 * decoration. `click()` only schedules the download; revoking on the next line invalidates the
 * blob while the fetch for it is still pending, which in some engines cancels the save outright —
 * and silently, since the promise has already resolved and the UI has reported success. Some also
 * decline to follow a `download` on an anchor that was never in the document.
 */
function saveFile(bytes: Uint8Array, filename: string): void {
	const url = URL.createObjectURL(
		new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.rel = "noopener";
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();

	setTimeout(() => {
		link.remove();
		URL.revokeObjectURL(url);
	}, 0);
}
