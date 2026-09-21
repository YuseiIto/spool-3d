import { useId, useState } from "react";
import type { ControlSpec } from "~/ui/fields";

interface Props {
	field: ControlSpec;
	value: number;
	invalid?: boolean;
	onChange: (value: number) => void;
}

/**
 * A single dimension, presented as an instrument reading rather than a form field.
 *
 * The value is the control: it sits on the label's line in the monospaced face, with no box
 * around it, because a boxed input reads as "fill this in" when what is wanted is "this is the
 * current measurement, and you may dial it". The track below is a hairline that fills as far as
 * the value has travelled, so a column of these scans like a set of gauges.
 */
export function NumberField({ field, value, invalid, onChange }: Props) {
	const inputId = useId();
	const labelId = useId();

	/**
	 * What is in the box while it is being typed into, if that differs from the committed value.
	 *
	 * Half-typed readings — "", "0", "0." on the way to "0.5" — are not values, and writing them
	 * through would be worse than useless: `Number("")` is 0, which is finite and clears any lower
	 * bound, so backspacing a field used to put a zero straight into the parameters, past a schema
	 * that holds them to be positive. The app then built a nonsense spool and published a share
	 * link that reloads as a different one. Holding the draft locally lets the box show the typing
	 * while the model only ever sees a reading that means something.
	 */
	const [draft, setDraft] = useState<string | null>(null);

	/**
	 * Takes a reading if it is one.
	 *
	 * The slider's lower bound is ergonomic, not a correctness limit — typing under it is how an
	 * unusual spool stays reachable — so the only value refused here is a zero in a field that
	 * cannot be zero, which is exactly the set whose slider does not start there.
	 */
	const commit = (raw: string) => {
		const parsed = Number(raw);
		if (raw.trim() === "" || !Number.isFinite(parsed) || parsed < 0) return;
		if (parsed === 0 && field.min > 0) return;
		onChange(parsed);
	};

	const clamped = Math.min(Math.max(value, field.min), field.max);
	// Drives the filled portion of the track; a gradient stop is the only way to paint it that
	// works across the three different native slider implementations.
	const travelled = ((clamped - field.min) / (field.max - field.min)) * 100;

	return (
		<div className={invalid ? "field field--invalid" : "field"}>
			<div className="field__head">
				<label id={labelId} htmlFor={inputId}>
					{field.label}
				</label>
				<span className="field__reading">
					<input
						id={inputId}
						type="number"
						value={draft ?? value}
						min={0}
						step={field.step}
						aria-invalid={invalid}
						onChange={(event) => {
							setDraft(event.target.value);
							commit(event.target.value);
						}}
						onBlur={() => setDraft(null)}
					/>
					<span className="field__unit">{field.unit ?? "mm"}</span>
				</span>
			</div>

			{field.hint && <p className="field__hint">{field.hint}</p>}

			{/* The slider is clamped to its ergonomic range; the reading is not, so an unusual
			    spool stays reachable by typing. */}
			<input
				className="track"
				type="range"
				style={{ "--travelled": `${travelled}%` } as React.CSSProperties}
				value={clamped}
				min={field.min}
				max={field.max}
				step={field.step}
				onChange={(event) => commit(event.target.value)}
				aria-labelledby={labelId}
			/>
		</div>
	);
}
