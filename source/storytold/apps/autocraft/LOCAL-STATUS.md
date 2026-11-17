# AutoCraft in the folder intranet

This installation contains the production dashboard and Node/SQLite service from Storytold AutoCraft commit `0bcc1f8d681609233d2f6f0d1f4e359e994079e0`. The folder launcher binds the dashboard to `127.0.0.1:8993` and uses GitHub sign-in. Private state defaults to `%LOCALAPPDATA%/ACCESS/Intranet/AutoCraft`. `AUTOCRAFT_PRIVATE_DIR` can select another protected directory. The current Windows user, SYSTEM and Administrators are the only principals allowed there.

1. Register or reuse an approved GitHub OAuth app with callback `http://127.0.0.1:8993/auth/callback`. See [GitHub's loopback callback documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#loopback-redirect-urls).
2. Run `Configure AutoCraft.cmd` and enter the OAuth client ID and secret in that local window. It creates the secrets file once and generates the session key. Keep this private directory outside source control, synchronized intranet folders and backups accessible to other users.
3. Set the first operator from a terminal with `"AutoCraft CLI.cmd" access add YOUR-GITHUB-LOGIN --operator`.
4. Run `Start AutoCraft.cmd` and open [AutoCraft](http://127.0.0.1:8993/).

`AutoCraft CLI.cmd` keeps its database, session key and runner logs in the private state directory. On first start, legacy `.private` data is copied into it through a staging directory. SQLite backup and integrity checks verify the imported database, and the original files remain available. An existing conflicting destination is preserved and reported. Keep the database and session key together when backing up this installation. The upstream runner's provider-backed tools require a supported isolated Linux runtime with bubblewrap and configured model and repository credentials. See the bundled [operations guide](docs/operations.md).

The installed Windows runner passed its built-in local ranking workflow through both the CLI and queued runner. It ranked two synthetic issues, saved the actual job results and item ranks, and passed SQLite integrity checking with zero model calls. The Windows port uses filesystem paths for child processes so jobs can find the installed CLI.

The same workflow also passed on the unmodified pinned source in a verified Debian 13 guest with Node 24.22.3 and locked production dependencies. Bubblewrap 0.12.0 passed a separate namespace probe with private files inaccessible, only loopback networking, a read-only system tree and disposable writable storage. Real GitHub sign-in and model-backed jobs still require the registered OAuth client and scoped provider credentials.
