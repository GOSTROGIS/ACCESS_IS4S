import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

function crc(bytes) {
  let current = 0xffffffff;
  for (const byte of bytes) current = (current >>> 8) ^ CRC_TABLE[(current ^ byte) & 255];
  return (current ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const bytes = Buffer.concat([Buffer.from(name, 'ascii'), data]);
  const output = Buffer.alloc(8 + bytes.length);
  output.writeUInt32BE(data.length, 0);
  bytes.copy(output, 4);
  output.writeUInt32BE(crc(bytes), output.length - 4);
  return output;
}

function fixturePng() {
  const width = 64, height = 48;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const lines = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * (1 + width * 3) + 1 + col * 3;
      lines[index] = 20 + col;
      lines[index + 1] = 36 + row;
      lines[index + 2] = 45 + Math.floor(col / 2);
    }
  }
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(lines)), pngChunk('IEND', Buffer.alloc(0))]);
}

function paeth(left, above, diagonal) {
  const p = left + above - diagonal;
  const distances = [Math.abs(p - left), Math.abs(p - above), Math.abs(p - diagonal)];
  return [left, above, diagonal][distances.indexOf(Math.min(...distances))];
}

function decodePng(file, expectedWidth, expectedHeight) {
  const png = readFileSync(file);
  assert(png.subarray(0, 8).equals(PNG_SIGNATURE), 'Incorrect PNG signature');
  const compressed = [];
  let width = 0, height = 0, bytesPerPixel = 0, end = false;
  for (let offset = 8; offset < png.length;) {
    assert(offset + 12 <= png.length, 'Truncated PNG chunk header');
    const length = png.readUInt32BE(offset);
    const next = offset + 12 + length;
    assert(next <= png.length, 'Truncated PNG chunk');
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, next - 4);
    assert.equal(crc(png.subarray(offset + 4, next - 4)), png.readUInt32BE(next - 4), `${type} PNG checksum`);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.deepEqual([width, height], [expectedWidth, expectedHeight]);
      assert.equal(data[8], 8, 'PNG sample depth');
      assert([2, 6].includes(data[9]), 'PNG must be RGB or RGBA');
      assert.deepEqual([...data.subarray(10)], [0, 0, 0], 'PNG compression, filtering and interlace');
      bytesPerPixel = data[9] === 2 ? 3 : 4;
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') {
      assert.equal(next, png.length, 'Trailing bytes after PNG end');
      end = true;
    }
    offset = next;
  }
  assert(width && height && end && compressed.length, 'Incomplete PNG');
  const stride = width * bytesPerPixel;
  const size = height * (stride + 1);
  const lines = inflateSync(Buffer.concat(compressed), { maxOutputLength: size });
  assert.equal(lines.length, size, 'PNG decompressed size');
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const input = row * (stride + 1);
    const filter = lines[input];
    assert(filter <= 4, 'Unexpected PNG row filter');
    for (let col = 0; col < stride; col++) {
      const index = row * stride + col;
      const left = col >= bytesPerPixel ? pixels[index - bytesPerPixel] : 0;
      const above = row ? pixels[index - stride] : 0;
      const diagonal = row && col >= bytesPerPixel ? pixels[index - stride - bytesPerPixel] : 0;
      const offset = [0, left, above, (left + above) >> 1, filter === 4 ? paeth(left, above, diagonal) : 0][filter];
      pixels[index] = (lines[input + 1 + col] + offset) & 255;
    }
  }
  return { pixels, bytesPerPixel };
}

function checkEffectcraft(run, directory) {
  const composition = 'ACCESS Update Verification';
  const layer = 'Moving rectangle';
  const project = join(directory, 'animation.ecproj');
  const commands = join(directory, 'edit.json');
  writeFileSync(commands, JSON.stringify([
    ['comp.new', { name: composition, width: 256, height: 144, frameRate: 12, duration: 1 }],
    ['layer.newShape', { kind: 'rect', name: layer, size: [44, 42], fill: '#ff6200', position: [56, 72] }],
    ['layer.addMask', { layer, shape: 'ellipse', rect: [-22, -21, 44, 42] }],
    ['prop.addKey', { layer, path: 'transform/position', value: [56, 72], time: 0 }],
    ['prop.addKey', { layer, path: 'transform/position', value: [180, 72], time: 0.75 }],
    ['effect.apply', { layers: [layer], effect: 'Gaussian Blur' }],
    ['file.saveAs', { path: project }],
  ].map(([command, params]) => ({ command, params }))));
  const report = JSON.parse(run('run', '--empty', '--commands', commands, '--json'));
  assert.equal(report.length, 7);
  assert.equal(report[5].result.effect, 'ec.blur.gaussian');
  assert(report[6].result.bytes > 1000);
  const shapeCenters = [0, 9].map(frame => {
    const path = join(directory, `${frame}.png`);
    run('--project', project, 'render-frame', '--comp', composition, '--frame', frame, '--out', path);
    const { pixels, bytesPerPixel } = decodePng(path, 256, 144);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += bytesPerPixel) {
      if (pixels[i] > 160 && pixels[i + 1] > 25 && pixels[i + 1] < 160) {
        sum += (i / bytesPerPixel) % 256;
        count++;
      }
    }
    assert(count > 500, `Frame ${frame} is missing the moving orange shape`);
    return sum / count;
  });
  assert(Math.abs(shapeCenters[0] - 56) < 2 && Math.abs(shapeCenters[1] - 180) < 2, 'Keyframed position changed after save and reopen');
  return { frames: 2, shapeCenters };
}

function checkLightcraft(run, directory) {
  const source = join(directory, 'original.png');
  const library = join(directory, 'library');
  const original = fixturePng();
  writeFileSync(source, original);
  const edited = run('run', '--library', library, '--import', source,
    'app.export', 'path=before.png', 'longEdge=0', 'develop.set', 'control=light.exposure', 'value=1.35',
    'app.export', 'path=adjusted.png', 'longEdge=0');
  const reopened = run('run', '--library', library, 'develop.get', 'app.export', 'path=reopened.png', 'longEdge=0');
  const results = [edited, reopened].map(output => output.trim().split(/\r?\n/).map(line => JSON.parse(line)));
  for (const outcome of results.flat()) assert.equal(outcome.ok, true, outcome.command);
  assert.equal(results[1][0].result.light.exposure, 1.35);
  assert(readFileSync(source).equals(original), 'The original photo changed');
  const [before, after, reopenedImage] = ['before.png', 'adjusted.png', 'reopened.png'].map(name => decodePng(join(directory, name), 64, 48));
  assert.equal(after.bytesPerPixel, reopenedImage.bytesPerPixel);
  assert(after.pixels.equals(reopenedImage.pixels), 'Reopened catalog produces different pixels');
  const averageRed = ({ pixels, bytesPerPixel }) => {
    let sum = 0;
    for (let i = 0; i < pixels.length; i += bytesPerPixel) sum += pixels[i];
    return sum / (64 * 48);
  };
  assert(averageRed(after) > averageRed(before) + 10, 'The edited photo did not get brighter');
  return { exposure: 1.35, meanRedBefore: averageRed(before), meanRedAfter: averageRed(after), originalSha256: createHash('sha256').update(original).digest('hex') };
}

const probes = new Map([['effectcraft', checkEffectcraft], ['lightcraft', checkLightcraft]]);

try {
  const [app, exe] = process.argv.slice(2);
  const probe = probes.get(app);
  if (!probe || !exe || process.argv.length !== 4) throw new Error('Usage: node native-creative-gate.mjs <effectcraft|lightcraft> <cli-executable>');
  const executable = resolve(exe);
  const work = mkdtempSync(join(tmpdir(), `${app}-gate-`));
  try {
    const run = (...args) => execFileSync(executable, args.map(String), {
      cwd: work, windowsHide: true, encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(JSON.stringify({ app, passed: true, ...probe(run, work) }));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
