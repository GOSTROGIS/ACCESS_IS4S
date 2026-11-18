# AutoCraft Linux services

Open Automation from the product's Tools tab. The native launcher verifies the existing Windows GitHub account and opens the genuine dashboard. ACCESS and SLIPCURVE use separate guest processes, databases, session keys and provider profiles.

From the installed Applications directory:

```powershell
.\tools\node.exe .\tools\autocraft-linux\controller.mjs status
.\tools\node.exe .\tools\autocraft-linux\controller.mjs login --product access
.\tools\node.exe .\tools\autocraft-linux\controller.mjs login --product slipcurve
```

The owning account's Limited logon task starts the approved headless guest and strict SSH loopback tunnels. The controller resolves protected connection settings through `tools/native-profile-location.json`. Keep the configuration, SSH identity, pinned host keys, guest disks and provider credentials outside the synced installation and Git repositories.

The private connection settings reference the approved guest launcher, executable and PID record, the SSH connection, the guest application root and the verified owner. The guest uses Node 24.22.3 and pnpm 11.28.10. Each instance has one runner worker with bounded CPU and memory. Provider tasks require a real account signed in through the supported provider interface.

## Runtime updates

`linux-runtime.py` accepts a host-verified source archive and receipt from the fixed owned repository. It verifies the commit, subtree, archive and every source file, installs frozen Linux dependencies, builds the complete production dashboard with `VITE_MOCK=0`, and runs the CLI, queue, HTTP frontend and authentication regression gates before qualification.

- `stage` builds and qualifies an inactive edition. A completed build checkpoint permits `qualify` to retry the same unchanged candidate after a transient gate failure.
- `check` verifies an edition's complete core before and after its functional gates.
- `activate` switches the selected edition and restarts its services. User data stays outside the editions.
- `rollback` verifies the retained edition and holds subsequent updates. `resume-updates` explicitly releases that hold.
- Changes to migration inputs require a private, pair-specific compatibility proof. The explicit `bootstrap` operation backs up the database and tests the real candidate and previous database runtimes on a disposable copy before activation.

Run the controller tests on Windows and the transport/migration tests in the guest:

```text
node --test local-intranet/autocraft-linux/controller.test.mjs
python3 native-host/linux-runtime.test.py
```
