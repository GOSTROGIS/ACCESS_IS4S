# ACCESS project workspace

The folder intranet serves this parent at `http://127.0.0.1:4180/workspace/`.
The ACCESS landing and skill pages provide compact Skills/Learn and Tools tabs.
`brand/access-project.js` enables Tools after the approved loopback host returns
the expected health response. Other hosts and offline copies keep their learning
content. The site builder and intranet preparer use the same navigation helper.
Tools opens the full workspace with `?skill=writing&app=wordcraft` and equivalent
contexts. Its application selector and document controls appear at the top.
The parent uses `/applications.json` to locate the installed browser
and desktop applications. Functional ACCESS labels are used in controls.
Original notices remain with the application source packages.

The embedded applications are the complete installed upstream browser builds,
served through `http://127.0.0.1:<application-port>/slipcurve-workspace/?parent=access`.
The shared adapter checks the parent origin and sends `slipcurve-editor:*`
messages. This parent accepts messages only from its active iframe, the exact
approved loopback origin and matching application ID. It never accepts a port,
native executable, file path or remote URL from query parameters.

The drawing, spreadsheet, document, PDF, presentation and interface design
editors expose bridges for New, Open and Save. Other editors retain their full
file menus. The shared adapter copies their generated browser downloads into
the selected project while retaining the normal download. Reopening those
copies requires selecting the downloaded file with the editor's own Open
command. An exported PDF, image or video is kept as that output format; it is
not described as an editable source document.

Projects and document bytes live in IndexedDB on this browser origin and
profile. Each save validates a nonempty file of at most 512 MiB, stores its
length and SHA-256, commits the transaction, and then reads it back and verifies
the bytes before acknowledging the editor. Reopen and Download independently
verify the stored length and digest. File names are reduced to safe basenames.
These checks detect damaged storage; they do not authenticate an imported file's
publisher. Keep downloaded backups. Browser profile separation does not replace
organizational authentication for a shared or remotely published service.

All 21 application choices have desktop protocol routes. Native launch requires
the folder installation's registered `slipcurve-app` handler. Provider
credentials, native service setup, microphone, audio, GPU and device features
remain requirements of the actual applications. This workspace does not prove
native parity or that every application feature has been verified.

Run checks from the repository root:

```sh
node --test source/storytold/runtime/local-intranet/access-workspace/model.test.mjs
python source/storytold/runtime/local-intranet/access-workspace/test-prepare.py
```

With Playwright available to Node, run the real browser storage check:

```sh
node --test source/storytold/runtime/local-intranet/access-workspace/browser-storage.test.mjs
```

`CHROME_BINARY` can select an installed Chromium browser. This test verifies
actual IndexedDB persistence, browser profile separation and rejection of
changed document bytes. It does not substitute a fake editor for an application
workflow. Deployed editor workflows must be tested against the installed URLs.

The deployed regression scripts use Playwright and JSZip as development tools,
an isolated browser context, and synthetic documents. They require the actual
folder services on ports 4180 and 4190–4206:

```sh
node source/storytold/runtime/local-intranet/access-workspace/verify-documents.mjs
APP=cadcraft node source/storytold/runtime/local-intranet/access-workspace/verify-designs.mjs
APP=deckcraft node source/storytold/runtime/local-intranet/access-workspace/verify-designs.mjs
APP=figcraft node source/storytold/runtime/local-intranet/access-workspace/verify-designs.mjs
APP=pdfcraft node source/storytold/runtime/local-intranet/access-workspace/verify-designs.mjs
```

Use PowerShell's `$env:APP = 'pdfcraft'` syntax on Windows. `ACCESS_EVIDENCE_DIR`
selects the evidence folder; it defaults to `work/access-parent-evidence` under
the current working directory. Tests use real editor commands and the parent
toolbar, read saved bytes from IndexedDB, download the files, inspect XLSX,
DOCX, PPTX and design ZIP contents, inspect DXF entities, and reopen the files.
The PDF check verifies the saved rotated page renders in landscape after
reopening from a same-name unsaved blank. Independently parse that downloaded
PDF with a PDF library to confirm its page count and `/Rotate` value as well.
