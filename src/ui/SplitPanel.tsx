import type { SpoolParams } from "~/params/schema";
import { BuildMode } from "~/ui/controls/BuildMode";
import { JointChoice } from "~/ui/controls/JointChoice";
import { NumberField } from "~/ui/controls/NumberField";
import { CLEARANCE_FIELD, JOINT_FIELDS, type NumericParam } from "~/ui/fields";

interface Props {
	params: SpoolParams;
	invalidFields: ReadonlySet<keyof SpoolParams>;
	onChange: (key: keyof SpoolParams, value: number | boolean | string) => void;
}

export function SplitPanel({ params, invalidFields, onChange }: Props) {
	const fields = JOINT_FIELDS[params.joint] ?? [];

	return (
		<section>
			<h2>Printing</h2>

			<BuildMode
				split={params.split}
				onChange={(split) => onChange("split", split)}
			/>

			{params.split && (
				<>
					<JointChoice
						value={params.joint}
						onChange={(joint) => onChange("joint", joint)}
					/>

					{params.joint !== "none" && (
						<NumberField
							field={CLEARANCE_FIELD}
							value={params.jointClearance}
							invalid={invalidFields.has("jointClearance")}
							onChange={(value) => onChange("jointClearance", value)}
						/>
					)}

					{fields.map((field) => (
						<NumberField
							key={field.key}
							field={field}
							value={params[field.key as NumericParam]}
							invalid={invalidFields.has(field.key)}
							onChange={(value) => onChange(field.key, value)}
						/>
					))}
				</>
			)}
		</section>
	);
}
