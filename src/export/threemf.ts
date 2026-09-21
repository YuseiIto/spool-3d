import {
	FileForRelThumbnail,
	fileForContentTypes,
	to3dmodel,
} from "@jscadui/3mf-export";
import { strToU8, zipSync } from "fflate";
import type { MeshData } from "~/mesh/types";

const MODEL_PATH = "3D/3dmodel.model";

/**
 * Decimal places kept in the model XML.
 *
 * Positions are millimetres from a WASM kernel working in float32, so digits past this are
 * noise. Keeping it short matters: 3MF stores coordinates as text, and the file is several times
 * larger at full precision.
 */
const PRECISION = 5;

export interface ThreeMfOptions {
	title: string;
	description: string;
	/**
	 * Places a second, identical copy this far along X.
	 *
	 * Side by side on the plate, both the same way up — not assembled. The halves are turned over
	 * by hand after printing, so a file that showed them mated would be a picture of the finished
	 * thing rather than something a slicer can use.
	 */
	secondCopyOffsetX?: number;
}

/**
 * Writes a 3MF.
 *
 * Preferred over STL because the format states its unit, so a slicer never has to guess whether
 * the numbers are millimetres or inches, and because it indexes vertices instead of repeating
 * each one per triangle.
 */
export function writeThreeMf(
	mesh: MeshData,
	options: ThreeMfOptions,
): Uint8Array {
	const relationships = new FileForRelThumbnail();
	relationships.add3dModel(MODEL_PATH);

	const model = to3dmodel({
		meshes: [
			{
				id: "1",
				name: options.title,
				vertices: positionsOf(mesh),
				indices: mesh.triVerts,
			},
		],
		// Both items point at the same mesh, so the second copy costs nothing but a transform.
		items:
			options.secondCopyOffsetX === undefined
				? [{ objectID: "1" }]
				: [
						{ objectID: "1" },
						{
							objectID: "1",
							transform: translationX(options.secondCopyOffsetX),
						},
					],
		precision: PRECISION,
		header: {
			unit: "millimeter",
			title: options.title,
			description: options.description,
			application: "spool-3d",
		},
	});

	return zipSync({
		[MODEL_PATH]: strToU8(model),
		[fileForContentTypes.name]: strToU8(fileForContentTypes.content),
		[relationships.name]: strToU8(relationships.content),
	});
}

/**
 * A pure translation along X, in the layout 3MF asks for.
 *
 * The writer reads a 16-element row-major 4x4 and drops every fourth value, which leaves
 * "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" — so the translation goes in the last row.
 */
function translationX(distance: number): number[] {
	// biome-ignore format: laid out as the matrix it is
	return [
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		distance, 0, 0, 1,
	];
}

/** 3MF wants positions on their own, so the interleaved normals are dropped here. */
function positionsOf(mesh: MeshData): Float32Array {
	if (mesh.numProp === 3) return mesh.vertProperties;

	const count = mesh.vertProperties.length / mesh.numProp;
	const positions = new Float32Array(count * 3);
	for (let vertex = 0; vertex < count; vertex++) {
		const from = vertex * mesh.numProp;
		positions[vertex * 3] = mesh.vertProperties[from] ?? 0;
		positions[vertex * 3 + 1] = mesh.vertProperties[from + 1] ?? 0;
		positions[vertex * 3 + 2] = mesh.vertProperties[from + 2] ?? 0;
	}
	return positions;
}
