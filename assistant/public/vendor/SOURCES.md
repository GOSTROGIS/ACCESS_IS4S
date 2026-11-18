# Browser assistant dependencies

| Asset | Pinned source | License |
| --- | --- | --- |
| `SmolLM2-135M-Instruct-Q4_0.gguf` | [Hugging Face's SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/tree/12fd25f77366fa6b3b4b768ec3050bf629380bac), [Bartowski's Q4_0 quantization](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/tree/09816acd5d99df7be770d85ea30822623dab342c) | [Apache 2.0](LICENSE-SmolLM2.txt) |
| `wllama.mjs`, `wllama.wasm` | [wllama 2.4.0](https://github.com/ngxson/wllama/tree/c8e1ce4cd2b62bf7d63c7fbcd8b21ce62181d165), npm package files `esm/index.js` and `esm/single-thread/wllama.wasm` | [MIT](LICENSE-wllama.txt) |
| llama.cpp inside the WASM binary | [Upstream submodule revision](https://github.com/ggml-org/llama.cpp/tree/42401c72b8d239240ed0fb37694d29ac33b3bc4f) | [MIT](LICENSE-llama.cpp.txt) |

The vendored JavaScript resolves WASM paths against `globalThis.location.href` so it can run in a dedicated browser worker. The Apache 2.0 terms also cover the bundled wasm-feature-detect feature checks.

The GGUF SHA-256 is `bcc3af2849ad6095af57e9b5cd43775256efdc66e306acb529172f92d0c04b03`. The worker verifies this hash before loading the model.
