import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "~/ui/App";
// Latin subsets only: the UI has no other scripts in it, and the full families are several
// times the size for glyphs that would never be drawn.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root container in index.html");

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
