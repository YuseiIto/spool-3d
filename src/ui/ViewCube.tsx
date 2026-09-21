export type ViewDirection = readonly [number, number, number];

/**
 * The standard views, as the direction the camera looks *from*.
 *
 * The top view is tipped a hair off the axis on purpose: looking exactly down the spool's axis
 * puts the view direction parallel to the camera's up vector, which leaves the roll undefined and
 * makes orbiting from there behave unpredictably.
 */
const VIEWS = {
	top: [0, -0.02, 1],
	front: [0, -1, 0],
	right: [1, 0, 0],
	iso: [0.55, -0.72, 0.42],
} satisfies Record<string, ViewDirection>;

/** The three elevations, in the order they are drawn. */
const FACES = [
	{ name: "Top", view: VIEWS.top, path: "M30 6 52 19 30 32 8 19Z" },
	{ name: "Front", view: VIEWS.front, path: "M8 19 30 32 30 56 8 43Z" },
	{ name: "Right", view: VIEWS.right, path: "M52 19 52 43 30 56 30 32Z" },
] as const;

interface Props {
	onSelect: (direction: ViewDirection) => void;
}

/**
 * A cube for putting the camera back where it belongs.
 *
 * Orbiting is a single drag away and undoing it by hand is fiddly, so the three faces are
 * shortcuts to the elevations and the button underneath returns to the three-quarter view the
 * model starts in.
 */
export function ViewCube({ onSelect }: Props) {
	return (
		<div className="cube">
			<svg viewBox="0 0 60 62" width="52" height="54" className="cube__svg">
				<title>Camera views</title>

				{/*
				 * Drawn as three rhombi of one isometric cube; each is its own hit target.
				 *
				 * Given a button's role and put in the tab order by hand. A bare `<path onClick>`
				 * is reachable by pointer only — SVG shapes are not focusable by default and
				 * nothing types into them — which would leave the elevations out of reach of a
				 * keyboard exactly when they are needed most, since the only way to lose the view
				 * in the first place is an orbit that is hard to undo. jsx-a11y does not catch
				 * this: its handler rules do not fire on SVG elements.
				 */}
				{FACES.map((face) => (
					<path
						key={face.name}
						className="cube__face"
						d={face.path}
						role="button"
						tabIndex={0}
						aria-label={`${face.name} view`}
						onClick={() => onSelect(face.view)}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							onSelect(face.view);
						}}
					>
						<title>{face.name}</title>
					</path>
				))}
			</svg>

			<button
				type="button"
				className="cube__reset"
				onClick={() => onSelect(VIEWS.iso)}
			>
				Reset
			</button>
		</div>
	);
}
