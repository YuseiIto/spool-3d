import { useEffect, useState } from "react";

/** How long the confirmation stays up after a successful copy. */
const CONFIRM_MS = 2000;

/**
 * Copies a link that reproduces the current spool.
 *
 * The address bar already carries the same query, but copying from it is a fiddly thing to ask
 * of someone mid-design, and on a phone it is barely possible at all.
 */
export function ShareButton({ url }: { url: () => string }) {
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

	useEffect(() => {
		if (state === "idle") return;
		const timer = setTimeout(() => setState("idle"), CONFIRM_MS);
		return () => clearTimeout(timer);
	}, [state]);

	const copy = () => {
		navigator.clipboard
			.writeText(url())
			.then(() => setState("copied"))
			// Clipboard access can be refused; the address bar still holds the same link, so the
			// message points there rather than just reporting a failure.
			.catch(() => setState("failed"));
	};

	return (
		<button
			type="button"
			className={state === "copied" ? "share share--done" : "share"}
			onClick={copy}
		>
			<span className="share__icon" aria-hidden="true">
				{state === "copied" ? <TickIcon /> : <LinkIcon />}
			</span>
			{state === "copied"
				? "Link copied"
				: state === "failed"
					? "Copy from the address bar"
					: "Copy link"}
		</button>
	);
}

/** Two interlocking links, drawn on the same 14px grid as the rest of the panel's marks. */
function LinkIcon() {
	return (
		<svg
			className="topbar__icon"
			viewBox="0 0 14 14"
			width="13"
			height="13"
			fill="none"
		>
			<title>Link</title>
			<path
				d="M5.9 8.1a2.6 2.6 0 0 0 3.7 0l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-.9.9M8.1 5.9a2.6 2.6 0 0 0-3.7 0L2.5 7.8a2.6 2.6 0 0 0 3.7 3.7l.9-.9"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function TickIcon() {
	return (
		<svg
			className="topbar__icon"
			viewBox="0 0 14 14"
			width="13"
			height="13"
			fill="none"
		>
			<title>Copied</title>
			<path
				d="M2.6 7.4 5.6 10.4 11.4 4.2"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
