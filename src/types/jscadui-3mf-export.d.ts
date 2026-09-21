/**
 * `@jscadui/3mf-export` ships no type declarations, so the slice of it this project uses is
 * declared here. Deliberately narrow: anything added must be checked against the package source
 * rather than guessed, since nothing else verifies this shape.
 */
declare module "@jscadui/3mf-export" {
	export interface Mesh3MF {
		id: string;
		vertices: Float32Array;
		indices: Uint32Array;
		name?: string;
	}

	export interface Item3MF {
		objectID: string;
		transform?: readonly (number | string)[];
	}

	export interface Header3MF {
		unit: "micron" | "millimeter" | "centimeter" | "inch" | "foot" | "meter";
		title?: string;
		description?: string;
		application?: string;
	}

	export function to3dmodel(options: {
		meshes?: readonly Mesh3MF[];
		items?: readonly Item3MF[];
		precision?: number;
		header?: Header3MF;
	}): string;

	export const fileForContentTypes: { name: string; content: string };

	export class FileForRelThumbnail {
		readonly name: string;
		readonly content: string;
		add3dModel(target: string): void;
		addThumbnail(target: string): void;
	}
}
