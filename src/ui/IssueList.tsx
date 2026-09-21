import type { Issue } from "~/params/issue";
import type { SpoolParams } from "~/params/schema";

interface Props {
	issues: readonly Issue[];
	onApply: (field: keyof SpoolParams, value: number | boolean) => void;
}

export function IssueList({ issues, onApply }: Props) {
	if (issues.length === 0) return null;

	return (
		<ul className="issues">
			{issues.map((issue) => (
				<li
					key={issue.code + issue.field}
					className={`issue issue-${issue.severity}`}
				>
					<span>{issue.message}</span>
					{issue.suggestion && (
						<button
							type="button"
							onClick={() =>
								issue.suggestion &&
								onApply(issue.suggestion.field, issue.suggestion.value)
							}
						>
							Fix
						</button>
					)}
				</li>
			))}
		</ul>
	);
}
