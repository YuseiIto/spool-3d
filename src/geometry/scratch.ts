/** Anything holding memory on the WASM heap: Manifold's `Manifold` and `CrossSection` both do. */
interface Freeable {
	delete(): void;
}

/**
 * Collects the kernel objects a construction leaves behind so they can be freed in one place.
 *
 * Dropping the JavaScript reference to a `Manifold` or a `CrossSection` frees nothing — the handle
 * points into the WASM heap, which only `delete()` returns. That is easy to overlook because every
 * operation returns a new object and reads like a pure expression: `a.add(b).translate(t)` leaves
 * two intermediates behind with nothing named after them.
 *
 * It matters here rather than in a one-shot script because the worker lives for the whole session
 * and rebuilds on every keystroke and every frame of a slider drag, so anything not freed
 * accumulates for as long as the tab is open.
 */
export class Scratch {
	private readonly held = new Set<Freeable>();

	/** Registers an intermediate and hands it straight back, so it can wrap an expression. */
	hold<T extends Freeable>(value: T): T {
		this.held.add(value);
		return value;
	}

	holdAll<T extends Freeable>(values: readonly T[]): readonly T[] {
		for (const value of values) this.held.add(value);
		return values;
	}

	/**
	 * Frees everything held, except the objects the caller is taking ownership of.
	 *
	 * The exceptions are what let a builder register every step including the ones that turn out to
	 * be its result, rather than having to know in advance which expression survives.
	 */
	releaseAll(...survivors: readonly (Freeable | null | undefined)[]): void {
		for (const value of this.held) {
			if (!survivors.includes(value)) value.delete();
		}
		this.held.clear();
	}
}

/**
 * Runs `build` with a scratch and frees everything it held but the result.
 *
 * Wrapped in a function rather than left to each caller's `try`/`finally` because the failure mode
 * of forgetting is invisible: the model comes out correct and the leak only shows up much later,
 * as a tab that grows.
 */
export function withScratch<T extends Freeable | null>(
	build: (scratch: Scratch) => T,
): T {
	const scratch = new Scratch();
	try {
		const result = build(scratch);
		scratch.releaseAll(result);
		return result;
	} catch (cause) {
		scratch.releaseAll();
		throw cause;
	}
}
