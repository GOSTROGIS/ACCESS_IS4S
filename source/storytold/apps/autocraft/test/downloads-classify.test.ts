import assert from "node:assert/strict";
import { test } from "node:test";
import { appNameOf, classifyAsset } from "../src/downloads/classify.ts";

test("package files get a platform, processor and format; signatures, checksums, symbols and language packs are not counted", () => {
  const counted: [string, string][] = [
    ["photocraft-0.21.0-linux-x86_64.AppImage", "linux/x64/appimage"],
    ["photocraft-0.21.0-linux-aarch64.deb", "linux/arm64/deb"],
    ["photocraft-0.21.0-linux-riscv64.rpm", "linux/riscv64/rpm"],
    ["photocraft-0.21.0-linux-x86_64.flatpak", "linux/x64/flatpak"],
    ["photocraft-0.21.0-linux-x86_64.pkg.tar.zst", "linux/x64/archpkg"],
    ["photocraft-0.21.0-linux-x86_64.tar.gz", "linux/x64/targz"],
    ["photocraft-0.21.0-freebsd-aarch64.tar.gz", "freebsd/arm64/targz"],
    ["photocraft-0.21.0-windows-x64.msi", "windows/x64/msi"],
    ["photocraft-0.21.0-windows-x86-portable.zip", "windows/x86/portable"],
    ["photocraft-0.21.0-windows-arm64-portable.zip", "windows/arm64/portable"],
    ["photocraft-0.21.0-macos-universal.dmg", "macos/universal/dmg"],
    ["photocraft-cli-0.21.0-macos-universal.zip", "macos/universal/cli"],
    ["pdfcraft-cli-0.21.0-x86_64.tar.gz", "linux/x64/cli"],
    ["photocraft-web-0.21.0.zip", "web/any/web"],
    ["photocraft-0.1.1-rc.5-linux-x86_64.deb", "linux/x64/deb"],
    // Older releases have no operating system in the name.
    ["photocraft-0.9.0-x64.msi", "windows/x64/msi"],
    ["photocraft-0.9.0-x86_64.rpm", "linux/x64/rpm"],
    ["photocraft-0.9.0-universal.dmg", "macos/universal/dmg"],
    ["ArtCraft_0.40.0_x64-setup.exe", "windows/x64/exe"],
    ["ArtCraft_0.40.0_x64_en-US.msi", "windows/x64/msi"],
    ["ArtCraft_0.40.0_universal.dmg", "macos/universal/dmg"],
    ["ArtCraft_universal.app.tar.gz", "macos/universal/appbundle"],
    ["ArtCraft_darwin_universal.app.tar.gz", "macos/universal/appbundle"],
    ["ArtCraft_0.30.0_x64_en-US_windows.msi", "windows/x64/msi"],
  ];
  for (const [name, want] of counted) {
    const c = classifyAsset(name);
    assert.equal(c && `${c.platform}/${c.processor}/${c.format}`, want, name);
  }
  for (const name of [
    "photocraft-0.21.0-linux-x86_64.AppImage.asc", "photocraft-0.21.0-linux-x86_64.AppImage.zsync", "photocraft-0.21.0-linux-x86_64.AppImage.zsync.asc",
    "photocraft-0.21.0-linux-x86_64.pkg.tar.zst.sig", "photocraft-0.21.0-linux-x86_64.oci-manifest.json", "photocraft-0.21.0-linux-x86_64.oci.sig",
    "photocraft-0.21.0-x64-symbols.zip", "photocraft-0.21.0-windows-x64.wixpdb", "SHA256SUMS.txt", "SHA256SUMS.txt.asc", "release-signing-key.asc", "index.json", "fr.tar.zst", "pt-br.tar.zst",
  ]) assert.equal(classifyAsset(name), null, name);
});

test("the app name is the release name without its version", () => {
  assert.equal(appNameOf("ArtCraft Launcher v0.17.0", "craft-launcher"), "ArtCraft Launcher");
  assert.equal(appNameOf("PhotoCraft 0.21.0", "photocraft"), "PhotoCraft");
  assert.equal(appNameOf("v0.21.0", "photocraft"), "photocraft");
  assert.equal(appNameOf(null, "photocraft"), "photocraft");
});
