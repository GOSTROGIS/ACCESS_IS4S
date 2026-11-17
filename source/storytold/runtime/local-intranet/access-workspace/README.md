# ACCESS project workspace

The folder intranet serves this parent at `http://127.0.0.1:4180/workspace/`.
Skill and learner pages link to `?skill=writing&app=wordcraft` and equivalent
contexts. The parent uses `/applications.json` to locate the installed browser
and desktop applications. Functional ACCESS labels are used in controls;
upstream names, versions, sources and licence attribution remain in the credits
and original application files.

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
