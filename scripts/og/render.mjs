/**
 * Renders scripts/og/card.html to public/og.png at 1200x630.
 *
 * Run it when the card changes; the PNG is committed, because a social image has to exist as a
 * file the crawlers can fetch and nothing in the build produces one.
 *
 *   node scripts/og/render.mjs
 *
 * The spool on the card comes from scripts/og/capture.mjs, which photographs the tool's own
 * preview. Rerun that first if the model or its colours change.
 *
 * Playwright is not a dependency of this project — it is only needed to turn the card into a
 * picture, and adding a browser download to every `npm install` to regenerate one image a year is
 * a poor trade. If it is not installed, open card.html in a browser and screenshot it instead;
 * the page is exactly 1200x630 with nothing outside it.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD = join(HERE, "card.html");
const OUT = join(HERE, "..", "..", "public", "og.png");

// The card is laid out at the size every crawler documents wanting, and captured at twice the
// pixels so it stays sharp on a retina timeline. The og:image:width and og:image:height in
// index.html state the captured size, not this one.
const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

let chromium;
try {
	({ chromium } = await import("playwright"));
} catch {
	try {
		({ chromium } = await import("playwright-core"));
	} catch {
		console.error(
			"Needs playwright: `npx playwright install chromium` and run again,\n" +
				"or open scripts/og/card.html in a browser and screenshot it to public/og.png.",
		);
		process.exit(1);
	}
}

const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: WIDTH, height: HEIGHT },
	deviceScaleFactor: SCALE,
});

await page.goto(`file://${CARD}`, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
	path: OUT,
	clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
});
await browser.close();

console.log(`wrote ${OUT} at ${WIDTH * SCALE}x${HEIGHT * SCALE}`);
