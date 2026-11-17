import { gzipSync } from "node:zlib";

export type TarEntry = { name: string; type?: string; data?: string; linkname?: string; mode?: number };

function header(name: string, type: string, size: number, linkname: string, mode: number): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100);
  h.write(mode.toString(8).padStart(7, "0"), 100);
  h.write("0000000", 108);
  h.write("0000000", 116);
  h.write(size.toString(8).padStart(11, "0"), 124);
  h.write("00000000000", 136);
  h.write("        ", 148);
  h.write(type, 156);
  h.write(linkname, 157, 100);
  h.write("ustar\0" + "00", 257);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return h;
}

export function makeTarGz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const data = Buffer.from(e.data ?? "");
    const type = e.type ?? (e.name.endsWith("/") ? "5" : "0");
    parts.push(header(e.name, type, type === "0" ? data.length : 0, e.linkname ?? "", e.mode ?? 0o644));
    if (type === "0") parts.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}
