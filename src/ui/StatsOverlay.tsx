import type { MeshStats } from "~/mesh/types";
import { massOf, windingCapacityMetres } from "~/params/capacity";
import type { SpoolParams } from "~/params/schema";

interface Props {
	stats: MeshStats | null;
	params: SpoolParams;
	wireDiameter: number;
	onWireDiameter: (value: number) => void;
}

const mm = (value: number) => value.toFixed(1);

/**
 * What the model measures, read off the corner of the viewport.
 *
 * Set faint and low-contrast on purpose: these are figures to glance at while shaping the spool,
 * not something to read. The only thing here that can be touched is the wire diameter, which
 * belongs beside the capacity it determines rather than in a panel of its own.
 */
export function StatsOverlay({
	stats,
	params,
	wireDiameter,
	onWireDiameter,
}: Props) {
	if (!stats) return null;

	const capacity = windingCapacityMetres(params, wireDiameter);

	return (
		<div className="hud hud--stats">
			<p className="hud__figure">
				{mm(stats.size[0])} × {mm(stats.size[1])} × {mm(stats.size[2])}
				<span className="hud__unit">mm</span>
			</p>

			<p className="hud__line">
				{(stats.volume / 1000).toFixed(1)} cm³
				<span className="hud__sep">/</span>
				{massOf(stats.volume).toFixed(0)} g PLA
				{params.split && <span className="hud__aside">per half</span>}
			</p>

			<p className="hud__line">
				holds ≈ {capacity.toFixed(1)} m of
				<input
					type="number"
					className="hud__input"
					value={wireDiameter}
					min={0.1}
					step={0.1}
					aria-label="Wire diameter in millimetres"
					onChange={(event) => {
						const parsed = Number(event.target.value);
						if (Number.isFinite(parsed) && parsed > 0) onWireDiameter(parsed);
					}}
				/>
				mm wire
			</p>

			<p className="hud__line hud__line--faint">
				{stats.triangleCount.toLocaleString("en")} triangles
			</p>
		</div>
	);
}
