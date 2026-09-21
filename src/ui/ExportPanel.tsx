import type { ExportFormat } from "~/export/filename";
import { ShareButton } from "~/ui/ShareButton";

interface Props {
	blocked: boolean;
	split: boolean;
	exporting: ExportFormat | null;
	onDownload: (format: ExportFormat) => void;
	shareUrl: () => string;
}

/**
 * Export controls, set into the top corner of the viewport.
 *
 * Out of the parameter panel because they are the one thing here that is not a parameter — the
 * end of the task, not part of it. Only as wide as its contents, though: a strip spanning the
 * whole viewport reads as application chrome, when this belongs to the model below it.
 *
 * 3MF is filled and the rest are not. It is the only saturated element in the chassis, which is
 * what makes the way out of the tool findable at a glance — and it points at the better of the
 * two formats, since 3MF records the unit and carries both halves of a split spool.
 */
export function ExportPanel({
	blocked,
	split,
	exporting,
	onDownload,
	shareUrl,
}: Props) {
	return (
		<div className="topbar">
			<span className="topbar__label">Export</span>

			<button
				type="button"
				className="topbar__primary"
				onClick={() => onDownload("3mf")}
				disabled={blocked || exporting !== null}
				title={
					split
						? "Both halves, arranged on the plate. Records the unit, so no slicer has to guess millimetres."
						: "Records the unit, so no slicer has to guess millimetres"
				}
			>
				<DownloadIcon />
				{exporting === "3mf" ? "…" : "3MF"}
			</button>
			<button
				type="button"
				onClick={() => onDownload("stl")}
				disabled={blocked || exporting !== null}
				title={
					split
						? "One half; print it twice. Widest compatibility, but carries no unit."
						: "Widest compatibility; carries no unit"
				}
			>
				<DownloadIcon />
				{exporting === "stl" ? "…" : "STL"}
			</button>

			{blocked && (
				<span className="topbar__note">Resolve the errors first</span>
			)}

			<ShareButton url={shareUrl} />
		</div>
	);
}

/** Drawn on the same 14px grid as the link mark beside it, so the row reads as one set. */
function DownloadIcon() {
	return (
		<svg
			viewBox="0 0 14 14"
			width="12"
			height="12"
			fill="none"
			aria-hidden="true"
			className="topbar__icon"
		>
			<path
				d="M7 2.3v7M4.3 6.8 7 9.5l2.7-2.7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M2.7 11.7h8.6"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
}
