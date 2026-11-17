# Folder intranet

This is a Windows folder deployment for use on the owning computer. `Start Intranet.cmd` opens the installed portal at `http://127.0.0.1:4180/` and starts the packaged SLIPCURVE service when present. Leave its console open while using the apps. `Open Native Applications.cmd` opens the folder of desktop launchers. Use the individual product folders for their standalone commands.

The built portal serves the ACCESS site, the CONSULTING production site and each installed Storytold browser package. SLIPCURVE runs its own local server on port 4184. Each Storytold browser build has a persistent loopback port, which keeps its browser storage separate from the other tools. Keep using the same browser profile to reopen that profile's work. A copy of the folder does not carry browser storage. Use the application's save or export command to keep a portable copy of your work.

The GridCraft and WordCraft links open same-origin workspaces with file controls for the genuine editors. The controls use Storytold's documented host bridge. Desktop launchers are available under `Storytold/native`. See the individual product folders for SLIPCURVE's server accounts, CONSULTING's standalone and Atlas MCP launchers, and AutoCraft's separate service prerequisites.

This deployment listens on IPv4 loopback. The portal accepts only its exact loopback Host header and GET/HEAD requests. It exposes only the declared public asset directories and checks resolved paths before serving bytes. The Windows launchers start programs through the operating system. Downloaded web content has no process-launch endpoint. Native packages, credentials and private databases stay outside the portal's routes. Access from other devices, HTTPS and organization-managed sign-in require a separate network deployment.

To recreate the browser installation, use `prepare.py` with a trusted Git archive of the ACCESS site, a verified stage from `import_releases.py`, the tested FilmCraft ZIP and its digest, the corrected PhotoCraft tree, and the verified Node.js executable and licence. Run it with Python 3.12 or later. Pass `--help` for the input paths. The tool keeps each app's version in its own directory and checks the copied files before writing the active browser inventory.

With the installed portal running, verify the served application routes and the static serving boundary by running `node verify.mjs <installed-folder>` from the source checkout. This checks real WASM headers and HTTP behavior. Use the application workflow regressions separately for editing, file round trips and exports.

## Automatic runtime updates and rollback

The Windows task **ACCESS IS4S Intranet Runtime Updates** runs at 03:00 local time under the owner account while it is signed in. It checks native CADCraft, EffectCraft, LightCraft and VectorCraft and browser PhotoCraft, GridCraft and WordCraft. The task uses the same updater as `Update Runtimes.cmd`. The log is `tools/runtime-update/update.log`.

When a newer stable release is published, the updater requires the pinned publisher signature, exact signed ZIP checksum and expected size. It stages a new version directory and passes a real application regression before atomically replacing `runtime-editions.json`. Each regression uses disposable files. Managed browser tabs stay on their loaded edition while new launches use the active edition at the same origin. Managed native launchers open the active executable on the next launch. Previous release directories and user data are kept.

From Command Prompt in the Intranet folder, use `"Update Runtimes.cmd" verify` to check the installed versions, or `"Update Runtimes.cmd" update` to check for newer releases. For example, `"Update Runtimes.cmd" rollback --only cadcraft-native` restores the last verified edition and holds updates for that runtime. `"Update Runtimes.cmd" resume --only cadcraft-native` allows updates again. Use `effectcraft-native`, `lightcraft-native`, `vectorcraft-native`, `photocraft-web`, `gridcraft-web`, or `wordcraft-web` for the other managed runtimes.

To install this updater from source for another copy of the folder, run `Install Runtime Updater.ps1`. Supply the installed folder, the OpenPGP.js package from the repository lockfile, a Python 3.12 dependency directory containing Playwright, Pillow, psd-tools, ezdxf, and pypdf, and the path to Chrome. The installer verifies the managed runtimes before switching their launchers. Restart the folder portal and run `Schedule Runtime Updates.ps1` to register the task. Pass `-RunNow` to run it immediately.
