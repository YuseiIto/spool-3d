/**
 * Who made it and under what terms.
 *
 * Kept at the foot of the panel and set as faintly as the rest of the chassis: it is a notice,
 * not a banner. Manifold is named because Apache-2.0 asks for attribution wherever the work is
 * distributed, and a browser tool distributes it to everyone who opens the page.
 */
export function Colophon() {
	return (
		<footer className="colophon">
			<p className="colophon__line">
				<span>
					© 2026{" "}
					<a
						href="https://yuseiito.com"
						target="_blank"
						rel="noreferrer noopener"
					>
						yuseiito
					</a>
					. MIT.
				</span>

				{/*
				 * Named by aria-label rather than by visually hidden text. That pattern wants an
				 * absolutely positioned span, and with no positioned ancestor its containing
				 * block is the viewport — so it sits at its static position down here and
				 * quietly extends the page's scroll area past the fold.
				 */}
				<a
					className="colophon__source"
					href="https://github.com/YuseiIto/spool-3d"
					target="_blank"
					rel="noreferrer noopener"
					aria-label="Source on GitHub"
					title="Source on GitHub"
				>
					<GitHubMark />
				</a>
			</p>

			<p>
				Solid modelling by{" "}
				<a
					href="https://github.com/elalish/manifold"
					target="_blank"
					rel="noreferrer noopener"
				>
					Manifold
				</a>
				, Apache-2.0.
			</p>
		</footer>
	);
}

function GitHubMark() {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path
				fill="currentColor"
				d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.19c0 .21.14.46.55.38A8 8 0 0 0 8 0Z"
			/>
		</svg>
	);
}
