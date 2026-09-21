import { type JointKind, jointKinds, jointLabels } from "~/params/joints";
import { type Choice, ChoiceGrid } from "~/ui/controls/ChoiceGrid";

interface Props {
	value: JointKind;
	onChange: (joint: JointKind) => void;
}

/**
 * The seam, chosen from drawings of it.
 *
 * Each tile shows the parting line through the core, seen from the side — which is the one view
 * that tells these five apart. "Radial lap" and "axial step" are not words anyone pictures
 * correctly on the first reading, and the difference between them is exactly a difference in
 * this profile.
 */
export function JointChoice({ value, onChange }: Props) {
	const choices: Choice<JointKind>[] = jointKinds.map((kind) => ({
		value: kind,
		label: jointLabels[kind].short,
		note: `${jointLabels[kind].name} — ${jointLabels[kind].note}`,
		icon: SEAMS[kind],
	}));

	return (
		<ChoiceGrid
			name="joint"
			legend="Seam"
			value={value}
			choices={choices}
			columns={5}
			onChange={onChange}
		/>
	);
}

/** The parting line, drawn across the width of the core. */
function Seam({ d }: { d: string }) {
	return (
		<svg viewBox="0 0 34 16" width="30" height="14" aria-hidden="true">
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const SEAMS: Record<JointKind, React.ReactElement> = {
	none: <Seam d="M3 8H31" />,

	dowel: (
		<svg viewBox="0 0 34 16" width="30" height="14" aria-hidden="true">
			<path
				d="M3 8H31"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
			{/* Pegs crossing the line, alternating which side they rise from. */}
			<rect x="9" y="3" width="4" height="5" rx="1" fill="currentColor" />
			<rect x="21" y="8" width="4" height="5" rx="1" fill="currentColor" />
		</svg>
	),

	wave: <Seam d="M3 8q3.5-5 7 0t7 0 7 0 7 0" />,

	// One side of the circle raised, the other dropped: the step runs around the axis.
	tabs: <Seam d="M3 5H17V11H31" />,

	// Inner part at one level, outer at another: the step runs along the radius, so it is
	// symmetric about the axis in the middle of the drawing.
	sleeve: <Seam d="M3 11H10V5H24V11H31" />,
};
