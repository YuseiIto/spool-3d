import { type Choice, ChoiceGrid } from "~/ui/controls/ChoiceGrid";

type Mode = "whole" | "split";

interface Props {
	split: boolean;
	onChange: (split: boolean) => void;
}

const CHOICES: Choice<Mode>[] = [
	{
		value: "whole",
		label: "One piece",
		note: "Simple, but the upper flange needs support and the whole spool has to fit the plate.",
		icon: <WholeIcon />,
	},
	{
		value: "split",
		label: "Two halves",
		note: "One part, printed twice. No support, and twice the height fits the plate.",
		icon: <SplitIcon />,
	},
];

/**
 * Whole spool or two halves, as a choice between two things rather than a box to tick.
 *
 * It was a checkbox, which framed splitting as an extra to opt into and hid the alternative
 * entirely — but this is how the part gets made, and it is the decision most people come here to
 * make. Showing both options side by side, each with its own section through the spool, answers
 * it without anything having to be read.
 */
export function BuildMode({ split, onChange }: Props) {
	return (
		<ChoiceGrid
			name="build-mode"
			legend="Build"
			value={split ? "split" : "whole"}
			choices={CHOICES}
			onChange={(mode) => onChange(mode === "split")}
		/>
	);
}

/** The spool in section: two flanges joined by a core. */
function WholeIcon() {
	return (
		<svg viewBox="0 0 24 22" width="26" height="24" aria-hidden="true">
			<path
				d="M2 3H22V6H15V16H22V19H2V16H9V6H2Z"
				fill="currentColor"
				fillOpacity="0.9"
			/>
		</svg>
	);
}

/** The same section, parted across the middle of the core. */
function SplitIcon() {
	return (
		<svg viewBox="0 0 24 22" width="26" height="24" aria-hidden="true">
			<path d="M2 2H22V5H15V10H9V5H2Z" fill="currentColor" fillOpacity="0.9" />
			<path
				d="M2 20H22V17H15V12H9V17H2Z"
				fill="currentColor"
				fillOpacity="0.55"
			/>
		</svg>
	);
}
