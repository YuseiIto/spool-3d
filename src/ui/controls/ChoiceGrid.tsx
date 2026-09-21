import type { ReactNode } from "react";

export interface Choice<T extends string> {
	value: T;
	label: string;
	/** Shown on hover, for the detail the tile has no room for. */
	note?: string;
	icon: ReactNode;
}

interface Props<T extends string> {
	/** Groups the radios; must be unique on the page. */
	name: string;
	legend: string;
	value: T;
	choices: readonly Choice<T>[];
	/** Tiles per row. Two for a pair of alternatives, three where there are more to compare. */
	columns?: 2 | 3 | 5;
	onChange: (value: T) => void;
}

/**
 * A set of options laid out as tiles, each carrying a drawing of what it does.
 *
 * Used where the choice is between shapes. A dropdown can only show one option at a time and
 * only as a word, which is the wrong way round for decisions whose whole difficulty is imagining
 * the geometry the word stands for.
 *
 * The radios stay in the accessibility tree and keep their native keyboard behaviour — arrow keys
 * move between them — they are just not what gets drawn.
 */
export function ChoiceGrid<T extends string>({
	name,
	legend,
	value,
	choices,
	columns = 2,
	onChange,
}: Props<T>) {
	return (
		<fieldset className="choices">
			<legend>{legend}</legend>

			<div className={`choices__grid choices__grid--${columns}`}>
				{choices.map((choice) => (
					<label className="mode" key={choice.value} title={choice.note}>
						<input
							type="radio"
							name={name}
							checked={value === choice.value}
							onChange={() => onChange(choice.value)}
						/>
						{choice.icon}
						{choice.label}
					</label>
				))}
			</div>
		</fieldset>
	);
}
