# spool-3d

A static site that generates parametric wire spools (bobbins) and hands you an STL or 3MF, ready
to 3D print. Everything runs in your browser — no upload, no account, no server.

## Two ways to print a spool

**One piece.** Simple, but the upper flange is a full-diameter overhang, so it needs support, and
a large spool has to fit your build plate whole.

**Split.** One part, printed twice. Turn the second one over and it mates with the first. Both
copies print flange-down with no support, and a spool twice the height of your printer's Z travel
is still reachable. The 3MF arrives with both copies already laid out on the plate.

There is no "other half" to download. The part is designed so that turning it over turns it into
its own counterpart.

### Seams

| Seam | What it does |
| --- | --- |
| Flat | Butt joint. Glue only. |
| Dowels | Pins and sockets alternating round the seam. Locates the halves and resists twisting. |
| Wave | A sine seam. Large glue area, resists twisting, no small features to break. |
| Tabs | Tabs drop into notches around the seam. Resists twisting, and prints flat with nothing small to snap. |
| Sleeve | The core wall steps between inner and outer, so one half slides inside the other. Resists twisting and keeps the halves concentric. |

Every one of these has to interlock with its own mirror image, which is a stricter requirement
than it sounds — see `CLAUDE.md` for why, and for the phase offset the dowel ring needs.

**Clearance** is the first thing to change if the halves come out too tight or too loose. The
default of 0.1 mm suits a well-tuned FDM printer with a 0.4 mm nozzle; open it up if the halves
will not go together.

## Sharing

The address bar always holds a link that reproduces what you are looking at, and **Copy link**
puts it on the clipboard. Only settings that differ from the defaults appear in it, so the links
stay short and are meant to be read and edited by hand.

## Requirements

- Node.js — the version in `.node-version`
- npm

## Technical stack

- [manifold-3d](https://github.com/elalish/manifold) — CAD kernel (WASM). Chosen because it
  guarantees two-manifold output, which is what makes a model printable.
- [three.js](https://threejs.org/) — preview
- [Vite](https://vite.dev/) + [React](https://react.dev/)
- [Biome](https://biomejs.dev/) (formatting) and [ESLint](https://eslint.org/) (linting)
- [Vitest](https://vitest.dev/) — the geometry core runs under plain Node, so model correctness
  is verified headlessly

## Development

```sh
npm install
npm run dev        # start the dev server
npm run test       # geometry and unit tests
npm run typecheck
npm run lint
npm run format     # rewrite files with Biome
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Architecture

Dependencies flow one way: `ui → worker → geometry → manifold`.

| Directory | Responsibility | May not import |
| --- | --- | --- |
| `src/params/` | Parameter schema, defaults, validation rules, URL encoding | anything but `zod` |
| `src/profile2d/` | Pure 2D maths: cross-section outline, corner rounding and chamfers | anything |
| `src/mesh/` | `MeshData`, the seam type crossing the worker boundary | anything |
| `src/geometry/` | Solid modelling with manifold-3d | three.js, React, DOM |
| `src/export/` | STL and 3MF writers, consuming `MeshData` only | manifold-3d, three.js |
| `src/worker/` | Runs modelling and export off the main thread | three.js, React |
| `src/preview/` | three.js scene | manifold-3d, geometry |
| `src/ui/` | React components | manifold-3d, geometry |

Two of these boundaries carry real weight and are enforced by `no-restricted-imports` in
`eslint.config.cjs`:

- **`geometry` stays Node-runnable**, so the whole modelling pipeline can be tested without a
  browser. That is where most of the project's correctness lives.
- **`export` never sees the CAD kernel**, so exported bytes can be parsed back and checked
  without instantiating WASM.

## Deployment

Cloudflare Pages, built from `main` by Cloudflare's own Git integration — so no deployment
credentials live in this repository or in GitHub Actions, which only ever runs the checks.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | from `.node-version` |

`public/_headers` carries the rest. The WASM module is single-threaded, so the site needs no
cross-origin isolation; it does need `'unsafe-eval'` for the worker alone, because Emscripten's
bindings build their invoker functions with `new Function`. The worker is emitted to its own
directory so that relaxation can be scoped to it and the main thread kept strict.

## License

MIT
