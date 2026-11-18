# Native Codex credential transport

This service connects the existing Windows managed account to the isolated
Linux AutoCraft runtimes through separate authenticated SSH Unix sockets.
The host checks the SSH process, Windows owner, account pin and current native
operator session before and after each credential lease. Credentials stay in
process and pipe memory; the Linux model filesystem receives no lease socket.

The supervisor owns its broker and SSH processes in a Windows job. Caller exit,
control EOF and supervisor exit close those processes. Manifest publication
refuses an existing provider reference. The parent must recover stale references
through a separately verified owner operation.

Provide the installed Applications directory and an existing protected native
connection file explicitly. Its `codexProvider` object contains `executable`,
`executableSha256` and `accountSha256`. These are private configuration references;
retain them in the owner's protected profile. The Windows account remains in
its original managed store. The matching official Linux CLI and read-only
`native-provider-session.mjs` probe must already be installed by the host.

```powershell
python -I -B windows-provider-supervisor.py --applications <installed-directory> --configuration <protected-file>
```

Keep the supervisor's private stdin open for its lifetime; EOF closes it.
The stdout protocol contains readiness metadata. Control registration occurs
only on the broker's private parent pipe.

Credential-free checks:

```powershell
python -I -B windows-lease-broker.test.py
python -I -B windows-auth-deadline.test.py
python -I -B windows-provider-supervisor.test.py
```

The ownership gate requires Windows and `AUTOCRAFT_TEST_APPLICATIONS` pointing
to the approved existing installation. It starts synthetic Node processes and
does not access provider credentials or the Linux guest.

Real two-product native leases, renewal and rejection paths were tested with
the actual managed account. This component is not yet wired into the production
controller. Live model workflows, the effective model process boundary,
concurrent provider capacity and compatible application rollback remain separate
qualification requirements.
