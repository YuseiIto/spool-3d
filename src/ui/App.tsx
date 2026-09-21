import { useCallback, useMemo, useRef, useState } from "react";
import { hasErrors } from "~/params/issue";
import { checkParams } from "~/params/rules";
import {
	rimTreatmentLabels,
	rimTreatments,
	type SpoolParams,
} from "~/params/schema";
import { MAX_SEPARATION_MM } from "~/preview/scene";
import { Viewer, type ViewerHandle } from "~/preview/Viewer";
import { Colophon } from "~/ui/Colophon";
import { NumberField } from "~/ui/controls/NumberField";
import { ExportPanel } from "~/ui/ExportPanel";
import {
	ADVANCED_GROUPS,
	BASIC_FIELDS,
	type FieldSpec,
	hasAdvancedChanges,
} from "~/ui/fields";
import { IssueList } from "~/ui/IssueList";
import { SeparationReadout } from "~/ui/SeparationReadout";
import { SplitPanel } from "~/ui/SplitPanel";
import { StatsOverlay } from "~/ui/StatsOverlay";
import { useSharedParams } from "~/ui/useSharedParams";
import { useSpoolModel } from "~/ui/useSpoolModel";
import { ViewCube } from "~/ui/ViewCube";

export function App() {
	const { params, setParams, linkIssues, shareUrl } = useSharedParams();
	const [explode, setExplode] = useState(0);
	const [wireDiameter, setWireDiameter] = useState(1);
	const viewer = useRef<ViewerHandle>(null);
	// Starts open if the spool arrived with any of these already changed — from a shared link,
	// say — so the controls responsible for the shape on screen are never hidden from view.
	const [advancedOpen, setAdvancedOpen] = useState(() =>
		hasAdvancedChanges(params),
	);
	const { mesh, stats, seamZ, error, exporting, download } =
		useSpoolModel(params);

	const issues = useMemo(
		() => [...linkIssues, ...checkParams(params)],
		[params, linkIssues],
	);
	const blocked = hasErrors(issues);
	const invalidFields = useMemo(
		() =>
			new Set(issues.filter((i) => i.severity === "error").map((i) => i.field)),
		[issues],
	);

	const set = (key: keyof SpoolParams, value: number | boolean | string) =>
		setParams((previous) => ({ ...previous, [key]: value }));

	// The gesture applies the cap itself; this guards the readout, whose reading can be typed.
	const setSeparation = useCallback(
		(millimetres: number) =>
			setExplode(Math.min(Math.max(millimetres, 0), MAX_SEPARATION_MM)),
		[],
	);

	const field = (spec: FieldSpec) => (
		<NumberField
			key={spec.key}
			field={spec}
			value={params[spec.key]}
			invalid={invalidFields.has(spec.key)}
			onChange={(value) => set(spec.key, value)}
		/>
	);

	return (
		<div className="layout">
			<aside className="panel">
				<header className="masthead">
					<h1>Spool 3D</h1>
				</header>

				<section>
					<h2>Dimensions</h2>
					{BASIC_FIELDS.map(field)}
				</section>

				<SplitPanel
					params={params}
					invalidFields={invalidFields}
					onChange={set}
				/>

				<details
					className="advanced"
					open={advancedOpen}
					onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
				>
					<summary>Advanced</summary>

					{ADVANCED_GROUPS.map((group) => (
						<div className="advanced__group" key={group.title}>
							<h3>{group.title}</h3>

							{group.fields.map((spec) =>
								(spec.shownWhen?.(params) ?? true) ? field(spec) : null,
							)}

							{group.title === "Edges" && (
								<label className="select">
									Rim
									<select
										value={params.rimTreatment}
										onChange={(event) =>
											setParams((previous) => ({
												...previous,
												rimTreatment: event.target
													.value as SpoolParams["rimTreatment"],
											}))
										}
									>
										{rimTreatments.map((treatment) => (
											<option key={treatment} value={treatment}>
												{rimTreatmentLabels[treatment]}
											</option>
										))}
									</select>
								</label>
							)}
						</div>
					))}
				</details>

				<IssueList issues={issues} onApply={set} />

				{error && (
					<p className="error" role="alert">
						{error}
					</p>
				)}

				<Colophon />
			</aside>

			<main className="stage">
				<Viewer
					ref={viewer}
					mesh={mesh}
					seamZ={seamZ}
					explode={params.split ? explode : null}
					onExplode={setSeparation}
				/>

				{params.split && (
					<SeparationReadout
						value={explode}
						max={MAX_SEPARATION_MM}
						onChange={setSeparation}
					/>
				)}

				<ExportPanel
					blocked={blocked}
					split={params.split}
					exporting={exporting}
					onDownload={download}
					shareUrl={shareUrl}
				/>

				<div className="hud hud--view">
					<ViewCube
						onSelect={(direction) => viewer.current?.setView(direction)}
					/>
				</div>

				<StatsOverlay
					stats={stats}
					params={params}
					wireDiameter={wireDiameter}
					onWireDiameter={setWireDiameter}
				/>

				{!mesh && !error && <p className="placeholder">Building…</p>}
			</main>
		</div>
	);
}
