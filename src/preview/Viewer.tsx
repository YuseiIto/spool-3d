import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import type { MeshData } from "~/mesh/types";
import { createPreviewScene, type PreviewScene } from "~/preview/scene";
import { toBufferGeometry } from "~/preview/toBufferGeometry";

export interface ViewerHandle {
	setView(direction: readonly [number, number, number]): void;
}

interface Props {
	mesh: MeshData | null;
	/** Height of the parting plane in the mesh, for aligning the mating half. */
	seamZ: number;
	/** Distance to pull the mating half away, or null to show a single part. */
	explode: number | null;
	/** Receives the separation while the mating half is dragged apart. */
	onExplode: (millimetres: number) => void;
	ref?: Ref<ViewerHandle>;
}

export function Viewer({ mesh, seamZ, explode, onExplode, ref }: Props) {
	const container = useRef<HTMLDivElement>(null);
	const scene = useRef<PreviewScene | null>(null);

	useEffect(() => {
		if (!container.current) return;
		const preview = createPreviewScene(container.current);
		scene.current = preview;
		return () => {
			scene.current = null;
			preview.dispose();
		};
	}, []);

	useEffect(() => {
		if (mesh) scene.current?.show(toBufferGeometry(mesh), seamZ);
	}, [mesh, seamZ]);

	useEffect(() => {
		scene.current?.showMate(explode);
	}, [explode]);

	// Re-assigned rather than captured at construction, so the scene always calls the current
	// handler without the scene itself having to be rebuilt.
	useEffect(() => {
		if (scene.current) scene.current.onSeparation = onExplode;
	}, [onExplode]);

	// The camera is the scene's own state, so the view controls reach it imperatively rather
	// than by threading a target orientation through React and back.
	useImperativeHandle(ref, () => ({
		setView: (direction) => scene.current?.setView(direction),
	}));

	return <div ref={container} className="viewer" />;
}
