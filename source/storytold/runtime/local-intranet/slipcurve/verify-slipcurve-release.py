"""Exercise a pinned release's real browser and authenticated SQLite workflows."""

import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT, CHECKOUT, HERE, DEPS, DATA_PARENT = (Path(value).resolve(strict=True) for value in sys.argv[1:])
sys.path[:0] = [str(DEPS), str(CHECKOUT / 'tools')]
import pagescheck
from playwright.sync_api import BrowserType, sync_playwright

if os.environ.get('SLIPCURVE_GATE_CHROME'):
    _launch = BrowserType.launch

    def launch(browser, *args, **kwargs):
        return _launch(browser, *args, executable_path=os.environ['SLIPCURVE_GATE_CHROME'], **kwargs)

    BrowserType.launch = launch

PYTHON = [sys.executable, "-I", "-B"]
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    PORT = listener.getsockname()[1]
ORIGIN = f"http://127.0.0.1:{PORT}"
WORKSPACE = "/api/v1/workspaces/local-workspace"
TOKEN = "/api/v1/auth/token"
REVISION = json.loads((ROOT / 'client' / 'deployment.json').read_text(encoding='utf-8'))['revision']


def require(check, message):
    if not check:
        raise AssertionError(message)
    print("  ok " + message, flush=True)


def request(path, expected=200, token="", body=None, headers=None):
    hdrs = dict(headers or {})
    if token:
        hdrs["Authorization"] = "Bearer " + token
    if isinstance(body, dict):
        hdrs["Content-Type"] = "application/json"
        body = json.dumps(body).encode()
    req = Request(ORIGIN + path, data=body, headers=hdrs)
    try:
        response = urlopen(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        if response.status != expected:
            raise AssertionError(f"{path}: expected {expected}, got {response.status}")
        return json.load(response) if "json" in response.headers.get("Content-Type", "") else None


def start(data, stderr):
    server = subprocess.Popen([*PYTHON, str(ROOT / "folder-serve.py"), "--port", str(PORT), "--data-dir", str(data)],
                              stdout=subprocess.DEVNULL, stderr=stderr, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        for _ in range(60):
            if server.poll() is not None:
                raise AssertionError("test server exited before readiness")
            try:
                require(request("/api/ready") == {"ready": True}, "upstream dependency probe is ready")
                return server
            except URLError:
                time.sleep(0.3)
        raise AssertionError("test server did not listen")
    except:
        server.terminate()
        server.wait()
        raise


def provision(data, username, password, role, workspace):
    code = """import runpy, sys
runtime = runpy.run_path(sys.argv[1])
runtime["initialize"](int(sys.argv[2]), runtime["Path"](sys.argv[3]))
import identityctl
raise SystemExit(identityctl.main(["identityctl", "add-user", "local", *sys.argv[4:], "--password-from-stdin"]))
"""
    proc = subprocess.run([*PYTHON, "-c", code, str(ROOT / "folder-serve.py"), str(PORT),
                           str(data), username, role, workspace],
                          input=password + "\n", text=True, capture_output=True)
    if proc.returncode:
        raise AssertionError("identity provisioning failed: " + proc.stderr)


def login(username, password):
    session = request(TOKEN, body={"tenant": "local", "username": username, "password": password})["data"]
    return session["token"]


def browser(username, password):
    with sync_playwright() as pw:
        chromium = pw.chromium.launch()
        context = chromium.new_context()
        page = context.new_page()
        page.goto(ORIGIN + "/server-account.html")
        page.get_by_label("Server username").fill(username)
        page.get_by_label("Server password").fill(password)
        page.get_by_role("button", name="Connect").click()
        page.get_by_role("status").get_by_text("Connected.", exact=False).wait_for()
        require(page.get_by_label("Server password").input_value() == "", "connection page clears the password")
        page.get_by_role("link", name="Open SLIPCURVE Settings").click()
        page.wait_for_function("""() => !!window.MCSYNC && MCSYNC.config().hasToken
            && MCSYNC.config().workspaceId === "local-workspace" && MCSYNC.config().auto === false""")
        result = page.evaluate("""async () => {
            const outcome = await MCSYNC.pull();
            return {applied: outcome.applied, confirmed: MCSYNC.config().confirmedAt};
        }""")
        require(isinstance(result["applied"], list) and result["confirmed"],
                "browser connection authorizes an upstream workspace pull")
        result = page.evaluate("""async () => {
            MC_DB.modules.rfis = {data: [{id: 'qa-rfi', title: 'Intranet QA'}],
                                  updated: new Date().toISOString()};
            return await MCSYNC.push();
        }""")
        require("rfis" in result["keys"], "browser pushes a real RFI register through the upstream sync engine")
        chromium.close()


def client_browser():
    def installed_base(url, prefix):
        if url != ORIGIN + '/' or prefix != '/':
            raise ValueError('Use the running disposable SLIPCURVE instance')
        return ORIGIN, url

    pagescheck.deployed_base = installed_base
    temporary_manifest = ROOT / 'client.manifest.json'
    shutil.copyfile(ROOT / 'client-manifest.json', temporary_manifest)
    try:
        pagescheck.check(ROOT / 'client', '/', HERE / 'browser-evidence', live_url=ORIGIN + '/')
    finally:
        temporary_manifest.unlink()


def check():
    username = "intranet-qa"
    password = secrets.token_urlsafe(30)
    outsider_password = secrets.token_urlsafe(30)
    archive = b'{"project":null,"modules":{},"version":1}'
    sha256 = hashlib.sha256(archive).hexdigest()
    # Snapshot filenames include their full SHA-256 plus a transaction suffix.
    # A sibling scratch store stays within Win32's path limit on this machine.
    with tempfile.TemporaryDirectory(prefix="q-", dir=DATA_PARENT, ignore_cleanup_errors=True) as temporary:
        data = Path(temporary)
        provision(data, username, password, "admin", "local-workspace")
        provision(data, "other-qa", outsider_password, "viewer", "alternate-workspace")
        with (HERE / "api.err").open("wb") as logs:
            server = start(data, logs)
            try:
                require(request("/api/health")["data"]["release"]["commit"] == REVISION,
                        "health identifies the matching upstream backend")
                request(WORKSPACE, expected=401)
                token = login(username, password)
                request(WORKSPACE, token=token)
                outsider = login("other-qa", outsider_password)
                request(WORKSPACE, token=outsider, expected=404)
                require(True, "password authentication grants the owner's workspace and isolates another user")
                snapshot = request(WORKSPACE + "/snapshots", 201, token=token, body=archive, headers={
                    "Content-Type": "application/octet-stream", "X-MC-Content-SHA256": sha256,
                })["data"]
                require(snapshot["sha256"] == sha256 and snapshot["bytes"] == len(archive),
                        "authenticated server persists the uploaded snapshot's exact length and hash")
                require(any(file.is_file() and file.read_bytes() == archive for file in data.rglob(sha256)),
                        "snapshots persist the exact payload bytes on local disk")
                client_browser()
                browser(username, password)
            finally:
                server.terminate()
                server.wait()
            server = start(data, logs)
            try:
                token = login(username, password)
                manifest = request(WORKSPACE + "/snapshots", token=token)
                require(sha256 in json.dumps(manifest), "stored snapshot metadata survives a full server restart")
                require(any(file.is_file() and file.read_bytes() == archive for file in data.rglob(sha256)),
                        "stored snapshot bytes survive a full server restart")
                record = request(WORKSPACE, token=token)["data"]["document"]["modules"]["rfis"]["data"][0]
                require(record["id"] == "qa-rfi" and record["title"] == "Intranet QA",
                        "browser-synced RFI persists in the live workspace across server restart")
            finally:
                server.terminate()
                server.wait()


if __name__ == "__main__":
    try:
        check()
    except Exception:
        log = HERE / 'api.err'
        if log.is_file():
            print(log.read_text(encoding='utf-8', errors='replace')[-8000:], file=sys.stderr)
        raise
