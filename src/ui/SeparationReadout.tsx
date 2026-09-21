interface Props {
	value: number;
	max: number;
	onChange: (value: number) => void;
}

/**
 * How far apart the halves are held, as a reading beside the model.
 *
 * The gesture is dragging the upper half; this is not a second way to do it but the number that
 * comes out of it, editable so the separation is reachable by keyboard and settable exactly. It
 * only appears once there are two halves to hold apart.
 */
export function SeparationReadout({ value, max, onChange }: Props) {
	return (
		<div className="separation">
			<span className="separation__icon" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="14" height="14" fill="none">
					<title>Separation</title>
					<path
						d="M3 5.5h10M3 10.5h10"
						stroke="currentColor"
						strokeWidth="1.3"
						strokeLinecap="round"
					/>
					<path
						d="M8 3.4 8 1.6M8 12.6v1.8"
						stroke="currentColor"
						strokeWidth="1.3"
						strokeLinecap="round"
					/>
				</svg>
			</span>

			<input
				type="number"
				value={Math.round(value)}
				min={0}
				max={max}
				step={1}
				aria-label="Separation between the halves, in millimetres"
				onChange={(event) => {
					const parsed = Number(event.target.value);
					if (Number.isFinite(parsed)) {
						onChange(Math.min(Math.max(parsed, 0), max));
					}
				}}
			/>
			<span className="separation__unit">mm</span>
		</div>
	);
}
