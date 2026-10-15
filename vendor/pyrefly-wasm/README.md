# pyrefly-wasm (vendored)

Pyrefly does not publish its WASM bindings as an npm package (unlike Ruff's
`@astral-sh/ruff-wasm-web`). The `pyrefly_wasm` crate in the upstream repo is
only ever built as part of https://pyrefly.org/sandbox/. This directory
vendors a locally built copy so it can be consumed like any other npm
dependency via `"pyrefly-wasm": "file:vendor/pyrefly-wasm"`.

## Provenance

- Source: https://github.com/facebook/pyrefly
- Commit: `b020ad0ef2a372693fc37d668a2086f24d183882` (2026-10-13)
- Built with: `rustc`/`cargo` 1.99.0 (stable, per the upstream
  `rust-toolchain.toml`), `wasm-pack` 0.15.0, Binaryen `wasm-opt`
- Build steps (from `pyrefly_wasm/`):
  ```
  bash build.sh
  wasm-opt target/pyrefly_wasm_bg.wasm -Os -o target/pyrefly_wasm_bg.wasm.opt
  ```
  `pyrefly_wasm.js` and the optimized `.wasm.opt` output (renamed to
  `pyrefly_wasm_bg.wasm`) were copied into this directory unmodified.

## Updating

To refresh this vendored build: clone `facebook/pyrefly` at the desired
commit, run the build steps above inside `pyrefly_wasm/`, copy the two output
files over the ones in this directory, and update the commit hash/date above.

## License

MIT, see `LICENSE` (copied from the upstream repository).
