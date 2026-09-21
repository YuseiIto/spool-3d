import { derive } from "~/params/derive";
import type { SpoolParams } from "~/params/schema";

/**
 * Density of PLA, the usual material for a part like this.
 *
 * Used only to turn a volume into a weight for the "how much filament" figure, which is a rough
 * guide rather than a slicer estimate — it counts the model as solid, where a real print is
 * mostly infill.
 */
const PLA_DENSITY_G_PER_CM3 = 1.24;

export const massOf = (volumeMm3: number) =>
	(volumeMm3 / 1000) * PLA_DENSITY_G_PER_CM3;

/**
 * Roughly how much wire of a given diameter the spool will hold.
 *
 * Assumes square packing — turn beside turn, layer above layer — rather than the tighter
 * hexagonal nesting a careful winder achieves. That understates the capacity by around 10%, which
 * is the right direction for a figure someone uses to decide whether a spool is big enough.
 *
 * Returns metres.
 */
export function windingCapacityMetres(
	params: SpoolParams,
	wireDiameter: number,
): number {
	if (wireDiameter <= 0) return 0;

	const g = derive(params);
	const usableDepth = g.flangeRadius - g.coreRadius;
	const layers = Math.floor(usableDepth / wireDiameter);
	const turnsPerLayer = Math.floor((2 * g.windingHalfWidth) / wireDiameter);
	if (layers <= 0 || turnsPerLayer <= 0) return 0;

	let length = 0;
	for (let layer = 0; layer < layers; layer++) {
		// Each layer sits on the one below, so its turns are longer than the last.
		const radius = g.coreRadius + (layer + 0.5) * wireDiameter;
		length += turnsPerLayer * 2 * Math.PI * radius;
	}

	return length / 1000;
}
