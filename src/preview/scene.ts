import {
	type BufferGeometry,
	DirectionalLight,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface PreviewScene {
	/**
	 * Swaps in a new model. `seamZ` is where its parting plane sits, which is what the mating
	 * half is aligned to.
	 */
	show(geometry: BufferGeometry, seamZ: number): void;
	/**
	 * Shows the mating half alongside the part, pulled `gap` millimetres away.
	 *
	 * A second instance of the *same* geometry, turned over — which is the whole claim the split
	 * build makes, shown rather than asserted. `null` hides it.
	 */
	showMate(gap: number | null): void;
	/**
	 * Swings the camera round to look from `direction`, and hands framing back to the app.
	 *
	 * Also the way out of a lost view: orbiting is easy to do and hard to undo, so asking for a
	 * named view has to be a reset, not just a rotation.
	 */
	setView(direction: readonly [number, number, number]): void;
	/**
	 * Called while the mating half is being dragged apart, with the new separation in
	 * millimetres. Assign to route the gesture back into the app's state.
	 */
	onSeparation: ((millimetres: number) => void) | null;
	dispose(): void;
}

/**
 * Border left around the model, as a fraction of the viewport.
 *
 * The fit below is tight — it solves for the exact distance at which the model's corners reach
 * the frustum — so this is a real margin rather than slack, and can be modest.
 */
const FRAMING_MARGIN = 1.12;

/** Device pixels per CSS pixel to render at, at most. */
const MAX_PIXEL_RATIO = 2;

/** Points taken around each rim circle when fitting. The extremes of a cylinder lie on these. */
const RIM_SAMPLES = 48;

/**
 * Furthest the halves can be held apart. Beyond this the pair no longer reads as one spool.
 *
 * Applied by the gesture itself rather than only by whoever receives the value. Reporting travel
 * the scene has not accepted means the part is placed at one separation and the app stores
 * another, and since the app's value comes straight back the two fight each other: drag past the
 * cap and the half jumps beyond it and snaps back on every pointer move.
 */
export const MAX_SEPARATION_MM = 60;

/** Direction the camera looks from before the user has moved it. */
const DEFAULT_VIEW = new Vector3(0.55, -0.72, 0.42).normalize();

/** How long the camera takes to swing to a named view. */
const VIEW_TRANSITION_MS = 380;

/**
 * Holds the three.js scene for the lifetime of the viewport and swaps geometry in and out.
 *
 * Kept outside React on purpose: the scene is long-lived mutable state driven by an animation
 * loop, and rebuilding it per render would drop the camera position the user had set up. React
 * owns when to call `show`, nothing more.
 *
 * The camera's up axis is Z because that is the spool's axis and the printer's, so what the user
 * orbits matches what comes out of the exporter.
 */
export function createPreviewScene(container: HTMLElement): PreviewScene {
	// Transparent so the stage's own backdrop — the pool of light and the measuring grid — shows
	// through behind the model, giving it a space to sit in rather than a flat fill.
	const renderer = new WebGLRenderer({ antialias: true, alpha: true });
	// Capped: past two device pixels per CSS pixel the extra detail is not visible, while the
	// shading cost keeps climbing — which on a 4K display is the difference between a smooth
	// orbit and a stuttering one.
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
	container.appendChild(renderer.domElement);

	const scene = new Scene();

	const camera = new PerspectiveCamera(45, 1, 0.1, 5000);
	camera.up.set(0, 0, 1);
	camera.position.copy(DEFAULT_VIEW).multiplyScalar(200);

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;

	// Auto-framing stops the moment the user takes the view into their own hands, so that
	// changing a dimension never snatches back a view they had set up deliberately.
	let userMovedCamera = false;
	controls.addEventListener("start", () => {
		userMovedCamera = true;
	});

	scene.add(new HemisphereLight(0xdfe6f0, 0x2a2622, 2.2));
	const key = new DirectionalLight(0xffffff, 2.0);
	key.position.set(1, -1.4, 1.8);
	scene.add(key);

	const material = new MeshStandardMaterial({
		color: 0x5fa8d3,
		roughness: 0.55,
		metalness: 0.05,
	});
	// Distinct colour so the seam is legible when the pair is shown together.
	const mateMaterial = new MeshStandardMaterial({
		color: 0xd39a5f,
		roughness: 0.55,
		metalness: 0.05,
	});

	const mesh = new Mesh(undefined, material);
	mesh.visible = false;
	scene.add(mesh);

	const mate = new Mesh(undefined, mateMaterial);
	mate.visible = false;
	// Turning the part over: the same half turn about X that assembles the real thing.
	mate.rotation.set(Math.PI, 0, 0);
	scene.add(mate);

	let height = 0;
	let seam = 0;
	let maxRadius = 0;
	let separation = 0;

	/**
	 * Stacks the turned-over copy on top of the part, seam against seam.
	 *
	 * Twice the *seam* height, not twice the bounding box: a joint that puts material above the
	 * parting plane — dowel pins, a raised step — has its highest point at the tip of that
	 * material, and aligning by the extremes would hold the halves apart by twice the protrusion
	 * while looking, at a glance, like they were touching.
	 */
	const placeMate = () => {
		mate.position.set(0, 0, 2 * seam + separation);
	};

	const centre = new Vector3();
	const direction = new Vector3();
	const override = new Vector3();
	let overridden = false;

	/** In-flight camera move, if a named view was asked for. */
	let transition: {
		fromPosition: Vector3;
		toPosition: Vector3;
		fromTarget: Vector3;
		toTarget: Vector3;
		startedAt: number;
	} | null = null;
	const forward = new Vector3();
	const right = new Vector3();
	const up = new Vector3();
	const corner = new Vector3();

	/**
	 * Points the camera at the middle of what is on screen and pulls back just far enough to see
	 * all of it.
	 *
	 * The content sits *on* z = 0 rather than straddling it — that is the frame a slicer wants —
	 * so aiming at the origin aims at the underside of the part, not its middle. That alone will
	 * push the model off the edge of the viewport.
	 *
	 * The distance is solved from points on the model's two rim circles rather than from a sphere
	 * or a box around it. A spool is flat and round, so both of those enclose a great deal of
	 * space the model never occupies — a box has corners at radius r * sqrt(2), and a sphere is
	 * looser still — and fitting either leaves the model adrift in the middle of the viewport.
	 */
	const frame = (animate = false) => {
		if (maxRadius === 0) return;

		/*
		 * The part occupies [0, height]. The mate is the same geometry turned over, so its own
		 * z runs from -height to 0 before it is lifted, and after the lift it occupies
		 * [mateTop - height, mateTop] — its *top*, not its bottom, sits at the lift.
		 *
		 * Adding a part height on top of that lift is the obvious mistake and a quiet one: the
		 * frame is simply of an object half again as tall as the one on screen, so the pair sits
		 * small and low with an empty band above it, and nothing about it looks like a bug.
		 */
		const mateTop = 2 * seam + separation;
		const top = mate.visible ? Math.max(height, mateTop) : height;
		const bottom = mate.visible ? Math.min(0, mateTop - height) : 0;
		centre.set(0, 0, (bottom + top) / 2);

		// Keep looking from wherever the camera already is, so re-framing never spins the model —
		// unless a named view has just been asked for.
		if (overridden) {
			direction.copy(override);
		} else {
			direction.subVectors(camera.position, controls.target);
			if (direction.lengthSq() === 0) direction.copy(DEFAULT_VIEW);
		}
		direction.normalize();

		// Camera basis, built the way three.js builds it when the camera looks at a target.
		forward.copy(direction).negate();
		right.crossVectors(forward, camera.up);
		if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
		right.normalize();
		up.crossVectors(right, forward).normalize();

		const halfVertical =
			Math.tan((camera.fov * Math.PI) / 360) / FRAMING_MARGIN;
		const halfHorizontal = halfVertical * camera.aspect;

		/** Visits the silhouette-defining points: the two rim circles bounding the content. */
		const eachRimPoint = (visit: (offsetFromCentre: Vector3) => void) => {
			for (let step = 0; step < RIM_SAMPLES; step++) {
				const angle = (2 * Math.PI * step) / RIM_SAMPLES;
				const x = maxRadius * Math.cos(angle);
				const y = maxRadius * Math.sin(angle);
				for (const z of [bottom, top]) visit(corner.set(x, y, z).sub(centre));
			}
		};

		/** Smallest distance at which every one of those points is still inside the frustum. */
		const fit = () => {
			let distance = 0;
			eachRimPoint((point) => {
				const depth = point.dot(forward);
				distance = Math.max(
					distance,
					Math.abs(point.dot(right)) / halfHorizontal - depth,
					Math.abs(point.dot(up)) / halfVertical - depth,
				);
			});
			return distance;
		};

		/**
		 * Slides the aim point so the model's projection sits in the middle of the frame.
		 *
		 * Under perspective the near half of the model projects larger than the far half, so
		 * aiming at its geometric centre still leaves it visibly low or high. This measures where
		 * the projection actually landed and cancels the difference.
		 */
		const recentre = (distance: number) => {
			let minRight = Number.POSITIVE_INFINITY;
			let maxRight = Number.NEGATIVE_INFINITY;
			let minUp = Number.POSITIVE_INFINITY;
			let maxUp = Number.NEGATIVE_INFINITY;

			eachRimPoint((point) => {
				const depth = distance + point.dot(forward);
				if (depth <= 0) return;
				const across = point.dot(right) / depth;
				const along = point.dot(up) / depth;
				minRight = Math.min(minRight, across);
				maxRight = Math.max(maxRight, across);
				minUp = Math.min(minUp, along);
				maxUp = Math.max(maxUp, along);
			});

			if (!Number.isFinite(minRight)) return;
			centre
				.addScaledVector(right, ((minRight + maxRight) / 2) * distance)
				.addScaledVector(up, ((minUp + maxUp) / 2) * distance);
		};

		// Fit, correct the aim, then fit again against the corrected aim.
		recentre(fit());
		const distance = fit();

		const destination = centre.clone().addScaledVector(direction, distance);

		if (animate) {
			transition = {
				fromPosition: camera.position.clone(),
				toPosition: destination,
				fromTarget: controls.target.clone(),
				toTarget: centre.clone(),
				startedAt: performance.now(),
			};
			return;
		}

		transition = null;
		controls.target.copy(centre);
		camera.position.copy(destination);
		camera.updateProjectionMatrix();
		controls.update();
	};

	const resize = () => {
		const { clientWidth, clientHeight } = container;
		if (clientWidth === 0 || clientHeight === 0) return;
		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		camera.updateProjectionMatrix();
		if (!userMovedCamera) frame();
	};

	const observer = new ResizeObserver(resize);
	observer.observe(container);
	resize();

	/*
	 * Dragging the upper half apart.
	 *
	 * The separation used to be a slider off to one side of the viewport, which asked the reader
	 * to connect a control to a motion it could not see it causing. Taking hold of the half and
	 * lifting it is the same thing the hands would do, so there is nothing left to explain.
	 */
	const raycaster = new Raycaster();
	const pointer = new Vector2();
	const axisStart = new Vector3();
	const axisEnd = new Vector3();
	let drag: { clientX: number; clientY: number; from: number } | null = null;

	/** Screen displacement, in pixels, for one millimetre along the spool's axis. */
	const pixelsPerMillimetre = (): Vector2 => {
		axisStart.set(0, 0, seam).project(camera);
		axisEnd.set(0, 0, seam + 1).project(camera);
		const { clientWidth, clientHeight } = container;
		return new Vector2(
			((axisEnd.x - axisStart.x) * clientWidth) / 2,
			(-(axisEnd.y - axisStart.y) * clientHeight) / 2,
		);
	};

	const overMate = (event: PointerEvent): boolean => {
		if (!mate.visible || !mate.geometry) return false;
		const bounds = renderer.domElement.getBoundingClientRect();
		pointer.set(
			((event.clientX - bounds.left) / bounds.width) * 2 - 1,
			-((event.clientY - bounds.top) / bounds.height) * 2 + 1,
		);
		raycaster.setFromCamera(pointer, camera);
		return raycaster.intersectObject(mate, false).length > 0;
	};

	renderer.domElement.addEventListener("pointerdown", (event) => {
		if (event.button !== 0 || !overMate(event)) return;
		drag = { clientX: event.clientX, clientY: event.clientY, from: separation };
		// The same drag would otherwise orbit the camera underneath the part being moved.
		controls.enabled = false;
		renderer.domElement.setPointerCapture(event.pointerId);
	});

	renderer.domElement.addEventListener("pointermove", (event) => {
		if (!drag) {
			renderer.domElement.style.cursor = overMate(event) ? "ns-resize" : "";
			return;
		}

		const perMillimetre = pixelsPerMillimetre();
		const lengthSquared = perMillimetre.lengthSq();
		if (lengthSquared === 0) return;

		// How far the pointer travelled along the axis, in millimetres.
		const travelled =
			((event.clientX - drag.clientX) * perMillimetre.x +
				(event.clientY - drag.clientY) * perMillimetre.y) /
			lengthSquared;

		separation = Math.min(
			MAX_SEPARATION_MM,
			Math.max(0, drag.from + travelled),
		);
		// Moved here rather than waiting for the value to come back through the app, so the part
		// keeps up with the pointer regardless of what else is re-rendering.
		placeMate();
		api.onSeparation?.(separation);
	});

	const endDrag = (event: PointerEvent) => {
		if (!drag) return;
		drag = null;
		controls.enabled = true;
		renderer.domElement.releasePointerCapture(event.pointerId);
	};
	renderer.domElement.addEventListener("pointerup", endDrag);
	renderer.domElement.addEventListener("pointercancel", endDrag);

	/** Smoothstep, so the swing eases out of rest and back into it. */
	const ease = (t: number) => t * t * (3 - 2 * t);

	renderer.setAnimationLoop(() => {
		if (transition) {
			const progress = Math.min(
				1,
				(performance.now() - transition.startedAt) / VIEW_TRANSITION_MS,
			);
			const eased = ease(progress);
			camera.position.lerpVectors(
				transition.fromPosition,
				transition.toPosition,
				eased,
			);
			controls.target.lerpVectors(
				transition.fromTarget,
				transition.toTarget,
				eased,
			);
			if (progress === 1) transition = null;
		}

		controls.update();
		renderer.render(scene, camera);
	});

	const api: PreviewScene = {
		onSeparation: null,

		show(geometry, seamZ) {
			mesh.geometry?.dispose();
			mesh.geometry = geometry;
			mesh.visible = true;
			mate.geometry = geometry;

			geometry.computeBoundingBox();
			const box = geometry.boundingBox;
			height = box?.max.z ?? 0;
			maxRadius = box
				? Math.max(
						Math.abs(box.min.x),
						Math.abs(box.max.x),
						Math.abs(box.min.y),
						Math.abs(box.max.y),
					)
				: 0;

			seam = seamZ;
			placeMate();
			if (!userMovedCamera) frame();
		},

		showMate(gap) {
			mate.visible = gap !== null;
			separation = gap ?? 0;
			placeMate();
			if (!userMovedCamera) frame();
		},

		setView(view) {
			override.set(view[0], view[1], view[2]);
			overridden = true;
			// Asking for a named view is also asking the app to look after the framing again.
			userMovedCamera = false;
			frame(true);
			overridden = false;
		},

		dispose() {
			observer.disconnect();
			renderer.setAnimationLoop(null);
			controls.dispose();
			mesh.geometry?.dispose();
			material.dispose();
			mateMaterial.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		},
	};

	return api;
}
