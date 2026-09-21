/**
 * Reads a binary STL back and reports whether it describes a closed, consistently oriented
 * surface.
 *
 * This deliberately re-derives the topology from the exported bytes rather than trusting the
 * kernel that produced them. Manifold guarantees its own solids are two-manifold, but STL drops
 * the vertex indices and stores each position three times, so it is the *export* that can lose
 * watertightness — and a leaky STL is exactly what a slicer fails on.
 */

/**
 * Positions are quantised before welding, because STL forces duplicate vertices and float32
 * round-trips perturb them. Coarse enough to absorb that, fine enough not to merge distinct
 * vertices of a printable part.
 */
const WELD_TOLERANCE_MM = 1e-4;

export interface SurfaceReport {
	triangleCount: number;
	uniqueVertices: number;
	degenerateTriangles: number;
	edgesUsedMoreThanOnce: number;
	edgesWithoutAnOppositeTwin: number;
	normalsDisagreeingWithWinding: number;
	/** V - E + F. For a closed orientable surface this is 2 - 2 * genus. */
	eulerCharacteristic: number;
	genus: number;
	watertight: boolean;
}

export function inspectStlSurface(bytes: Uint8Array): SurfaceReport {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const triangleCount = view.getUint32(80, true);

	const key = (x: number, y: number, z: number) =>
		`${Math.round(x / WELD_TOLERANCE_MM)},${Math.round(y / WELD_TOLERANCE_MM)},${Math.round(z / WELD_TOLERANCE_MM)}`;

	const directedEdges = new Map<string, number>();
	const vertices = new Set<string>();
	let degenerate = 0;
	let normalMismatch = 0;

	for (let triangle = 0; triangle < triangleCount; triangle++) {
		const base = 84 + triangle * 50;
		const at = (index: number) => view.getFloat32(base + index * 4, true);

		const normal: [number, number, number] = [at(0), at(1), at(2)];
		const corners: [number, number, number][] = [
			[at(3), at(4), at(5)],
			[at(6), at(7), at(8)],
			[at(9), at(10), at(11)],
		];

		const keys = corners.map(([x, y, z]) => key(x, y, z));
		if (new Set(keys).size < 3) degenerate++;
		for (const k of keys) vertices.add(k);

		for (let i = 0; i < 3; i++) {
			const edge = `${keys[i]}|${keys[(i + 1) % 3]}`;
			directedEdges.set(edge, (directedEdges.get(edge) ?? 0) + 1);
		}

		if (!normalAgreesWithWinding(normal, corners)) normalMismatch++;
	}

	let usedMoreThanOnce = 0;
	let withoutTwin = 0;
	for (const [edge, count] of directedEdges) {
		if (count !== 1) usedMoreThanOnce++;
		const [from, to] = edge.split("|");
		if ((directedEdges.get(`${to}|${from}`) ?? 0) !== 1) withoutTwin++;
	}

	const euler = vertices.size - directedEdges.size / 2 + triangleCount;

	return {
		triangleCount,
		uniqueVertices: vertices.size,
		degenerateTriangles: degenerate,
		edgesUsedMoreThanOnce: usedMoreThanOnce,
		edgesWithoutAnOppositeTwin: withoutTwin,
		normalsDisagreeingWithWinding: normalMismatch,
		eulerCharacteristic: euler,
		genus: (2 - euler) / 2,
		watertight: usedMoreThanOnce === 0 && withoutTwin === 0 && degenerate === 0,
	};
}

function normalAgreesWithWinding(
	normal: readonly [number, number, number],
	[a, b, c]: readonly [number, number, number][],
): boolean {
	if (!a || !b || !c) return false;

	const ux = b[0] - a[0];
	const uy = b[1] - a[1];
	const uz = b[2] - a[2];
	const vx = c[0] - a[0];
	const vy = c[1] - a[1];
	const vz = c[2] - a[2];

	const nx = uy * vz - uz * vy;
	const ny = uz * vx - ux * vz;
	const nz = ux * vy - uy * vx;
	const length = Math.hypot(nx, ny, nz);
	if (length === 0) return true;

	const cosine = (nx * normal[0] + ny * normal[1] + nz * normal[2]) / length;
	return cosine > 0.99;
}
