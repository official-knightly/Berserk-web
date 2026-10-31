# Berserk WebAssembly engine

Place the browser build at `engine/berserk_bg.wasm` and track it with Git LFS. The file must be the matching `wasm-bindgen` Web target binary (currently generated with `wasm-bindgen` 0.2.129), not an arbitrary standalone Rust WASM module.

The Pages workflow publishes this checked-in WebAssembly bundle from `engine/`. Keep the generated loader
and matching `berserk_bg.wasm` together; `engine-worker.js` imports `./engine/berserk.js`.

Required source object: `engine/berserk_bg.wasm` (approximately 64.5 MB / 61.5 MiB). Do not commit a Git LFS pointer as an ordinary binary blob or substitute a different engine build.
