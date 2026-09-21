# CLAUDE.md — spool-3d

A wholly client-side static site that generates parametric wire spools and hands them back as STL
or 3MF. Public repository (`YuseiIto/spool-3d`, MIT).

Everything written into the repository is in English, this file included. The conversation with
the user is in Japanese.

## Commands

```sh
npm run dev / build / preview
npm run test / typecheck / lint
npm run format      # rewrites
npm run format:ci   # checks only, as CI does
```

Never hand-write a dependency version; let `npm install <pkg>` resolve it. Check a GitHub Action's
Releases before pinning it.

Conventional Commits, branches named `feature/xxxx`, and no indiscriminate `git add .`.

## Structure

Dependencies run one way: `ui → worker → geometry → manifold`. `no-restricted-imports` in
`eslint.config.cjs` enforces it. When something trips the rule, move the code into the right layer
rather than relaxing the rule.

Two properties are what the boundary is protecting, and the whole test strategy rests on them:

- `src/geometry/` runs under plain Node, so the modelling can be verified without a browser
- `src/export/` never sees the CAD kernel, so its output can be parsed back and checked without
  instantiating any WASM

The `locateFile` argument in `src/geometry/runtime.ts` is the only seam between the two
environments. Do not load the WASM by any other route.

## Coordinates and units

Millimetres and degrees. The UI, the URL and the types all carry **diameters**; the conversion to
radii lives in `derive()` and nowhere else. The spool's axis is Z and the parting plane is z = 0.

`CrossSection.revolve()` turns a section about its Y axis and makes that the solid's Z axis, so
section points read as `[radius, height]`. A revolved volume comes out `(K/2π)·sin(2π/K)` times the
ideal one, so any test comparing against a closed form has to correct for it.

## What makes one part mate with itself

The centre of the design. In split mode part B is part A turned over about X — the image of the
mirror `M: (x,y,z) → (x,−y,−z)`. B = M(A) holds exactly when **the parting surface is unchanged by
M**, which is to say its height f(θ) is an **odd function**.

When adding a joint, check that condition at design time and get the invariant tests (no
interference, congruence, clearance) to pass. A part that breaks it still looks like a perfectly
sound solid on its own; `intersect(part, turnedOver(part))` is the only place the damage shows.
Two traps already sprung:

- Laying `dowel` pins and sockets at `θ = j·π/n` puts a pin on a pin under the mirror. Offset the
  ring by half a step
- When triangulating a non-planar quad by hand, choose the diagonal symmetrically (`waveParting`)

## Working with manifold

Do not rewrite these from memory. Each is pinned by a test that measured it.

- The `normalIdx` of `calculateNormals(normalIdx, …)` must be **0, the standard slot**. Non-zero is
  a deprecated compatibility path that yields `numProp === 9` with channels 3–5 zeroed — an unlit,
  black model
- `status()` returns a string (`"NoError"` and friends), not a number
- `Manifold` and `CrossSection` are handles into the WASM heap; dropping the JavaScript reference
  frees nothing. Put intermediates through `Scratch` / `withScratch` in `src/geometry/scratch.ts`.
  The worker is long-lived and rebuilds on every frame of a slider drag, so a leak has no ceiling
- Never round corners with an opening (`offset(-r).offset(+r)`). It reaches convex corners only,
  and once the radius passes half the shape's narrowest dimension the region collapses and its
  complement grows in its place. Use a positive offset, or the per-vertex expansion in
  `src/profile2d/corners.ts`

## Parameters and rules

`src/params/rules.ts` judges only the geometric premises the types cannot express. A warning is
shown; an error also blocks export.

- Do not restate a clamped limit (corner radius, root fillet radius) in the rules. Put it in
  `derive.ts` once and have the builder and the rules both read it
- Do not put a constant in `suggestion.value`. The smallest value a rule fires at is often the
  constant itself, which makes the Fix button write back what the field already holds — and on an
  error that is the only way out of the panel

## UI

Built as an instrument: the numbers lead and everything else is chassis.

- IBM Plex Sans and Mono, self-hosted (`@fontsource`, latin subset) — a CSP of `default-src 'self'`
  cannot reach a font CDN. Numbers, units, headings and the HUD are all Mono
- Only the model carries saturated colour. The UI is greyscale plus one signal colour (`--signal`)
- The sidebar holds the five basic dimensions and the split settings; detail folds into Advanced.
  Fitting 1440×900 without scrolling is a deliberate constraint, so measure the height when adding
  to it
- Export, statistics, separation and the view cube live in the HUD over the viewport
- A number field keeps what is being typed as a local draft and passes on only readings that mean
  something. `Number("")` is 0, so the straightforward version writes a zero past the schema the
  moment a field is cleared
- jsx-a11y does not inspect `onClick` on SVG elements. A clickable `<path>` needs its own
  `role="button"`, `tabIndex` and `onKeyDown`

## The CSP the deployment needs

Emscripten's embind glue builds its invokers with `new Function(...)`, so the thread running the
CAD kernel needs `'unsafe-eval'`. The worker is emitted into `dist/workers/` (`vite.config.ts`) and
`public/_headers` grants it there and only there; the main thread stays strict. Break that
arrangement and models stop building in production only.

Every `_headers` rule that matches contributes its headers, and a header given twice is **returned
twice, not overridden**. Two `Content-Security-Policy` headers are two policies enforced together,
so what survives is their intersection — a permissive rule can never loosen a broad strict one.
The strict policy is therefore scoped to the document rather than written as a catch-all, and
`src/integration/headers.test.ts` holds every path to at most one policy. A local server that sets
headers with `setHeader` will not reproduce this, and once reported a broken policy as working.

To check it, look for `.hud--stats`, which renders only once a model has come back. The presence of
the canvas, or of anything drawn at all, is always true and proves nothing.
