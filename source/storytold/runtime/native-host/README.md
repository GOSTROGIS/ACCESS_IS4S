# Native application host for IS4S

This bundle prepares an **actual Linux desktop application host**, streamed to
a browser through LinuxServer Webtop/Selkies. Native applications run as their
real Linux programs. This avoids misrepresenting limited WebAssembly ports as
the full native applications.

It is not a claim that every Storytold application or every hardware/provider
feature has been installed and verified. A desktop with no installed apps does
not complete this work. Read the validation status below before publishing a
launcher or marking an application ready.

## Supported remoting capabilities

The official Selkies documentation describes:

- Opus audio from the desktop to the browser;
- the local browser microphone forwarded to a normal input device in the
  desktop session, after the user enables it;
- real file upload/download, clipboard transfer and PDF printing;
- a desktop accessed through an authenticated HTTPS reverse proxy, with
  WebSocket upgrades enabled;
- optional host GPU rendering/encoding, configured for the actual GPU/driver.

The pinned image is the official `ubuntu-xfce` Webtop manifest index, inspected
at `sha256:14fa1ceb750d4bf9e0880cb7e7b6a535f6f9210762a59ff992ef17e3375d48c0`.
It contains Linux amd64 and arm64 targets. The default Compose file publishes
only a loopback HTTP port for an HTTPS proxy/tunnel. It does not expose an
unauthenticated desktop publicly, mount the Docker socket, request privileged
mode, or guess a GPU device.

Source evidence, inspected from LinuxServer documentation commit
`a6c699abd9cedfda4e969c3994c77e7927137f41`:

- [Audio, microphone and file transfer](https://github.com/linuxserver/docker-documentation/blob/a6c699abd9cedfda4e969c3994c77e7927137f41/docs/selkies/user-guide/web-client.md)
- [Supported configuration names](https://github.com/linuxserver/docker-documentation/blob/a6c699abd9cedfda4e969c3994c77e7927137f41/docs/selkies/user-guide/configuration.md)
- [HTTPS reverse proxy and embedding](https://github.com/linuxserver/docker-documentation/blob/a6c699abd9cedfda4e969c3994c77e7927137f41/docs/selkies/user-guide/reverse-proxy.md)
- [Authentication and isolation](https://github.com/linuxserver/docker-documentation/blob/a6c699abd9cedfda4e969c3994c77e7927137f41/docs/selkies/user-guide/security.md)
- [GPU requirements](https://github.com/linuxserver/docker-documentation/blob/a6c699abd9cedfda4e969c3994c77e7927137f41/docs/selkies/user-guide/gpu.md)

## Configure the chosen host

Use a Linux machine that can run Docker, with enough persistent storage for
the actual native releases and user projects. An existing GPU computer can
retain its hardware capabilities; a free CPU-only VM does not acquire a GPU
because the desktop is streamed. Oracle's ARM machines need actual aarch64
releases; this installer chooses the current machine architecture and refuses
unknown ones rather than silently emulating amd64.

1. Copy `.env.example` to a private `.env` beside `compose.yaml`. Set the actual
   HTTPS desktop origin, non-secret desktop username, PUID/PGID and a password
   file path outside the checkout. Create that file privately; do not put a
   password into a commit or chat. LinuxServer reads it through its documented
   `FILE__PASSWORD` mechanism.
2. Put a real authentication gateway in front of the loopback service. For
   Cloudflare Tunnel, that means a configured Cloudflare Access policy, not
   merely a public random tunnel URL. Keep browser access on HTTPS; proxy to
   `http://127.0.0.1:3000`, preserve WebSocket upgrades and permit long-lived
   connections. No TLS-verification disabling is needed for this supported
   HTTP origin-to-local-proxy arrangement.
3. Validate and start the pinned image:

   ```sh
   docker compose -f compose.yaml config --quiet
   docker compose -f compose.yaml up -d
   ```

4. Use the desktop terminal as its normal `abc` user, or an equivalent Docker
   exec. Confirm `python3`, `curl` and `gpg` are available; if not, install those
   from the Ubuntu package repositories as an administrator. Inspect one
   application's pinned signed release first:

   ```sh
   docker compose -f compose.yaml exec --user abc desktop \
     bash /opt/is4s/install-apps.sh --app cadcraft --check
   ```

5. Install the real native release explicitly, then launch and test it:

   ```sh
   docker compose -f compose.yaml exec --user abc desktop \
     bash /opt/is4s/install-apps.sh --app cadcraft --app filmcraft --install
   ```

   The apps are installed into versioned directories below
   `/config/is4s-apps`; launchers are created below `/config/.local/bin` and
   `/config/.local/share/applications`. The `/config` volume preserves them and
   user projects across container recreation. The installer retains old
   versions and refuses to overwrite an existing version directory.

The installer takes pinned release tags from `../app-targets.json`, obtains
the actual matching native Linux tarballs, verifies the published checksum
manifest's detached signature against the pinned signing fingerprint, and
verifies the archive's SHA-256 before extraction. It retains the full package
and its licences. For ArtCraft, the installer also verifies the pinned Linux
archive digest and adds the upstream licences and `NOTICE` from the pinned
release source because the Linux tarball omits them. Application launches
and feature checks are separate from package verification.

`--all` covers targets with a recorded native release, including ArtCraft
v0.41.1. ArtCraft needs the Linux Tauri system dependencies and configured
provider accounts. ArtCraft-X needs a separate native source build and
provider setup. AutoCraft needs its Node/SQLite server, identity and model
runner. Install and validate those services on the approved host.

The FigCraft release ships a desktop package and a separate
`figcraft-server` package. `--app figcraft` selects the desktop binary.
Deploy the server with the organization's access policy and secure
WebSockets to verify cross-user collaboration.

## Native capability constraints

Microphone forwarding preserves a normal audio-input route for SoundCraft,
but it does not provide the physical user's ASIO drivers, arbitrary USB audio
interfaces, MIDI interfaces or every hardware timing characteristic. Device
passthrough and performance need explicit host configuration and tests.

Hardware video acceleration and GPU-dependent rendering require a compatible
host GPU/driver and documented passthrough. A CPU host can use software paths
only where the real application supports them. Provider generation still
requires real authorized accounts, network destinations, quotas and credentials;
streaming the GUI supplies none of those. Native plug-ins and external tools
must be installed and licensed on the host.

One shared desktop is one shared account and filesystem. It is not a
multi-tenant classroom isolation system. Provide a separate authenticated
session/container and storage per learner when learners must not access one
another's work. LinuxServer warns that desktop access includes a terminal
with passwordless sudo inside the container, so basic auth alone is not an
internet-facing access policy.

IS4S embedding requires a real configured desktop URL. The Compose file allows
the IS4S origin in `SELKIES_FRAME_ANCESTORS`; the embedding iframe also needs
explicit microphone/audio/fullscreen permissions. A correctly configured
frame is transport, not a replacement for application feature testing.

## Validation status

The image manifest and official configuration documentation were inspected.
The shell/Python wrapper and Compose schema are checked during preparation.
Actual image startup, native installation and app feature checks must be
reported individually; an empty desktop is not application readiness.

Before publishing a tool as ready, demonstrate at least:

1. The genuine native application launches and identifies its release.
2. A representative real edit, save/reopen and export works; inspect the file.
3. Required audio output and a consented microphone recording work through the
   remote session, with the saved recording containing the input.
4. Required hardware/provider features work with the chosen host and account.

Run the CADCraft native CLI regression against a signed native distribution
with `python3 ../verify-cadcraft-native.py /path/to/cadcraft-cli` from this
directory. Its Python environment needs `ezdxf`, `Pillow` and `pypdf`. It
creates a bracket DWG, draws a line and circle, exercises undo and redo,
reopens the saved DWG and independently reads the DXF, PNG, SVG and PDF
exports. The desktop GUI and its audio, device and session settings need
their own deployed checks.

No host account, DNS name, tunnel, authentication policy or production
deployment is created by these files.
