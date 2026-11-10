# Scheduling lab

Open `index.html` directly or serve this directory. No build, network request, external dependency or storage is required at runtime. Keep `index.html`, `style.css`, `engine.js` and `lab.js` together. The back link expects the learner page one directory above.

This is an original teaching model, not Slipcurve source code. All project data is fictional. The baseline is fixed at 12 working days; reset restores the original six durations. Inputs change duration only, not predecessor links.

## Checks

Run `node test-engine.cjs` for the dependency-free engine tests. They check all expected boundaries and float values for the baseline, the three delay cases, critical task sets, valid duration endpoints, invalid durations, cycles, unknown/repeated predecessors, duplicate IDs, independent tasks, input order and unchanged baseline data.

Optional browser smoke test: install Playwright in your development environment and run `node test-browser.cjs`. Set `CHROMIUM_PATH` to an existing Chromium executable if needed. The test checks the prediction gate, four cases, invalid durations, reset, mobile page width and browser errors, and writes screenshots plus a PDF to the operating system temporary directory. No browser dependency is needed by learners.

Engine and JavaScript syntax checks passed on 2026-11-10. Browser execution could not be completed in the implementation environment because Chromium could not create its local process socket. Visual rendering, interactive browser validation and PDF layout therefore remain to be verified on a browser-enabled machine.
