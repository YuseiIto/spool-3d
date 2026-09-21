/**
 * Captures the spool on scripts/og/spool.png, by photographing the tool's own preview.
 *
 *   npm run build && node scripts/og/capture.mjs
 *
 * The picture on the social card is the real model, rendered by the same three.js scene the site
 * shows — not an illustration of it. That costs a build and a headless browser, and buys a card
 * that cannot drift away from what the tool actually produces.
 *
 * The chassis is hidden and the backdrop made transparent, so what comes out is the model on
 * nothing and the card can put its own ground under it.
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "..", "dist");
const OUT = join(HERE, "spool.png");

/**
 * The spool on the card.
 *
 * Split, so the two colours show where one part ends and its own mirror image begins; windows,
 * because they are what gives the flanges any depth to read at this size.
 */
const QUERY = "?sp=true&j=wave&lhn=5&lhm=4";

/**
 * Square, larger than the card will ever draw it — and wider than the 760px breakpoint at which
 * the layout stacks the panel above the stage and leaves the preview a third of the height.
 */
const SIDE = 900;

const TYPES = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
	".wasm": "application/wasm",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".png": "image/png",
	".svg": "image/svg+xml",
};

// A worker cannot be loaded over file://, so the build has to be served.
const server = createServer(async (request, response) => {
	const path = new URL(request.url ?? "/", "http://x").pathname;
	try {
		const file = join(DIST, normalize(path === "/" ? "/index.html" : path));
		const body = await readFile(file);
		response.setHeader("Content-Type", TYPES[extname(file)] ?? "text/plain");
		response.end(body);
	} catch {
		response.statusCode = 404;
		response.end("not found");
	}
});
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();

let chromium;
try {
	({ chromium } = await import("playwright"));
} catch {
	({ chromium } = await import("playwright-core"));
}

const browser = await chromium.launch({
	// Software rendering, so this produces the same picture on a machine with no GPU.
	args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
	viewport: { width: SIDE, height: SIDE },
	deviceScaleFactor: 2,
});

await page.goto(`http://localhost:${port}/${QUERY}`, { waitUntil: "load" });
// Only rendered once a model has come back from the worker.
await page.waitForSelector(".hud--stats", {
	state: "attached",
	timeout: 60_000,
});

await page.addStyleTag({
	content: `
		html, body, .layout, .stage { background: transparent !important; }
		.stage::before, .stage::after { display: none !important; }
		.panel, .topbar, .hud, .separation, .placeholder { display: none !important; }
		/* The stage is the second column; with the panel gone it would take the first. */
		.layout { grid-template-columns: 1fr !important; }
	`,
});
// Long enough for the resize to re-frame the model and the camera to settle.
await page.waitForTimeout(2500);

await page
	.locator(".stage canvas")
	.screenshot({ path: OUT, omitBackground: true });

await browser.close();
server.close();

console.log(`wrote ${OUT} at ${SIDE * 2}x${SIDE * 2}`);
