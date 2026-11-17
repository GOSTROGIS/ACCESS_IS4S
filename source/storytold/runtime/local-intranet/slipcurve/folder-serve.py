"""Serve the installed Slipcurve client and upstream API on this desktop."""

import argparse
import json
import os
from pathlib import Path
import sys
import threading
import webbrowser


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
DEFAULT_PORT = 4184
TENANT = "local"
WORKSPACE = "local-workspace"


def parse_port(value):
    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Port must be between 1 and 65535")
    return port


def initialize(port, data):
    client = (ROOT / "client").resolve(strict=True)
    data = data.resolve()
    if data.is_relative_to(client) or client.is_relative_to(data):
        raise ValueError("The data directory must be outside the served client")
    data.mkdir(parents=True, exist_ok=True)
    (data / "tenants").mkdir(exist_ok=True)

    release = json.loads((client / "deployment.json").read_text(encoding="utf-8"))
    origin = f"http://{HOST}:{port}"
    for name in tuple(os.environ):
        if name.startswith("MC_") and name != "MC_PROVIDER_KEYS":
            del os.environ[name]
    os.environ.update({
        "MC_ENV": "staging",
        "MC_BIND": HOST,
        "MC_PORT": str(port),
        "MC_DATA_DIR": str(data),
        "MC_IDENTITY": "password",
        "MC_PASSWORD_HASH": "scrypt",
        "MC_DEFAULT_TENANT": TENANT,
        "MC_PUBLIC_ORIGIN": origin,
        "MC_RELEASE_COMMIT": release["revision"],
        "MC_CLIENT_DIR": str(client),
        "DEPLOY_TRUSTED_PROXY_CIDRS": "",
    })
    sys.path[:0] = [str(ROOT / "deploy"), str(ROOT / "server")]
    return origin


def loopback_only(app, origin, port):
    def call(environ, start_response):
        host = environ.get("HTTP_HOST")
        request_origin = environ.get("HTTP_ORIGIN")
        if host != f"{HOST}:{port}" or (request_origin and request_origin != origin):
            start_response("403 Forbidden", [("Content-Length", "0"), ("Cache-Control", "no-store")])
            return []
        if environ.get("PATH_INFO") == "/":
            environ = dict(environ, PATH_INFO="/index.html")
        def local_headers(status, headers, exc_info=None):
            # Only this owner-operated loopback host embeds the installed tools.
            frames = "frame-src 'self' " + " ".join(f"http://127.0.0.1:{tool}" for tool in [*range(4190, 4207), 4211])
            headers = [(key, value + "; " + frames if key.lower() == "content-security-policy" else value)
                       for key, value in headers]
            return start_response(status, headers, exc_info)
        return app(environ, local_headers)

    return call


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=parse_port, default=DEFAULT_PORT)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--open", action="store_true", help="Open the browser after the listener binds")
    parser.add_argument("--add-user", metavar="USERNAME", help="Provision a local server administrator")
    args = parser.parse_args()
    origin = initialize(args.port, args.data_dir)

    if args.add_user:
        import identityctl

        return identityctl.main(["identityctl", "add-user", TENANT, args.add_user, "admin", WORKSPACE])

    from static_entry import build
    from waitress import create_server

    application = loopback_only(build(), origin, args.port)
    with_server = create_server(application, host=HOST, port=args.port, threads=4,
                                clear_untrusted_proxy_headers=True, channel_timeout=60,
                                max_request_header_size=16384, max_request_body_size=104857600)
    print(f"Slipcurve is listening at {origin}/", flush=True)
    if args.open:
        threading.Thread(target=webbrowser.open, args=(origin + "/",), daemon=True).start()
    try:
        with_server.run()
    except KeyboardInterrupt:
        pass
    finally:
        with_server.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
