import { useCallback, useEffect, useRef, useState } from "react";
import type { Issue } from "~/params/issue";
import type { SpoolParams } from "~/params/schema";
import { decodeParams, encodeParams } from "~/params/url";

/** How long the parameters must hold still before the address bar is rewritten. */
const SYNC_MS = 400;

export interface SharedParams {
	params: SpoolParams;
	setParams: (update: (previous: SpoolParams) => SpoolParams) => void;
	/** Raised once at load if the incoming link could not be read in full. */
	linkIssues: Issue[];
	shareUrl(): string;
}

/**
 * Keeps the parameters and the address bar in step.
 *
 * `replaceState` rather than `pushState`: dragging a slider would otherwise bury the user's
 * previous page under hundreds of history entries and make the back button useless. The address
 * bar is a place to copy a link from, not a record of every value tried along the way.
 */
export function useSharedParams(): SharedParams {
	const initial = useRef<ReturnType<typeof decodeParams> | null>(null);
	initial.current ??= decodeParams(window.location.search);

	const [params, setParamsState] = useState<SpoolParams>(
		initial.current.params,
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			const query = encodeParams(params);
			window.history.replaceState(
				null,
				"",
				query ? `?${query}` : window.location.pathname,
			);
		}, SYNC_MS);
		return () => clearTimeout(timer);
	}, [params]);

	const setParams = useCallback(
		(update: (previous: SpoolParams) => SpoolParams) => setParamsState(update),
		[],
	);

	const shareUrl = useCallback(() => {
		const query = encodeParams(params);
		const { origin, pathname } = window.location;
		return query ? `${origin}${pathname}?${query}` : `${origin}${pathname}`;
	}, [params]);

	return {
		params,
		setParams,
		linkIssues: initial.current.issues,
		shareUrl,
	};
}
