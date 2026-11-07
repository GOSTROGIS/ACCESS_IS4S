// Build script for the ACCESS Résumé Builder.
//
// How to rebuild (Node 20 or newer):
//   1. Install the packages listed in package.json somewhere outside the repo, for example:
//        mkdir -p /tmp/rb && cp package.json /tmp/rb && (cd /tmp/rb && npm install)
//   2. Run:  ATS_NODE_MODULES=/tmp/rb/node_modules node build.mjs
//      (or run "npm install" here; node_modules/ is git-ignored.)
// Output goes to the parent folder: index.html and assets/.
// fonts/NotoSans-*.ttf are Latin subsets of Noto Sans (OFL) made with fontTools pyftsubset,
// covering Latin, Latin Extended, IPA letters, spacing modifiers and combining accents.

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(SRC, '..');
const NM = process.env.ATS_NODE_MODULES || join(SRC, 'node_modules');
const { build, transform } = createRequire(join(NM, 'noop.js'))('esbuild');
const A = join(OUT, 'assets');
for (const d of [A, join(A, 'fonts'), join(A, 'vendor')]) mkdirSync(d, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'chrome100', 'edge100', 'firefox100', 'safari15'],
  nodePaths: [NM],
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
};

await build({ ...common, entryPoints: [join(SRC, 'app/main.jsx')], outfile: join(A, 'app.js'), jsx: 'automatic' });
await build({ ...common, entryPoints: [join(SRC, 'app/docx-entry.js')], outfile: join(A, 'docx-export.js'), external: ['buffer'] });

const css = await transform(readFileSync(join(SRC, 'styles.css'), 'utf8'), { loader: 'css', minify: true });
writeFileSync(join(A, 'app.css'), css.code);

copyFileSync(join(NM, '@fontsource/archivo/files/archivo-latin-700-normal.woff2'), join(A, 'fonts/archivo-700.woff2'));
copyFileSync(join(NM, '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'), join(A, 'fonts/plex-400.woff2'));
copyFileSync(join(NM, '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'), join(A, 'fonts/plex-600.woff2'));
copyFileSync(join(NM, 'jspdf/dist/jspdf.umd.min.js'), join(A, 'vendor/jspdf.umd.min.js'));

const b64 = (f) => readFileSync(join(SRC, 'fonts', f)).toString('base64');
writeFileSync(join(A, 'pdf-fonts.js'),
  `window.ACCESS_PDF_FONTS={regular:"${b64('NotoSans-400Regular.ttf')}",bold:"${b64('NotoSans-700Bold.ttf')}"};\n`);

const lic = (title, file) => `===== ${title} =====\n${readFileSync(file, 'utf8').trim()}\n\n`;
writeFileSync(join(A, 'LICENSES.txt'),
  'Third-party software and fonts bundled with the ACCESS Résumé Builder.\n\n'
  + lic('React and React DOM 18.3.1 (MIT)', join(NM, 'react/LICENSE'))
  + lic('docx 9.5.1 (MIT)', join(NM, 'docx/LICENSE'))
  + lic('jsPDF 4.2.1 (MIT)', join(NM, 'jspdf/LICENSE'))
  + lic('Archivo (SIL Open Font License 1.1)', join(NM, '@fontsource/archivo/LICENSE'))
  + lic('IBM Plex Sans (SIL Open Font License 1.1)', join(NM, '@fontsource/ibm-plex-sans/LICENSE'))
  + lic('Noto Sans, subset (SIL Open Font License 1.1)', join(NM, '@expo-google-fonts/noto-sans/LICENSE_FONT')));

const version = createHash('sha256').update(readFileSync(join(A, 'app.js'))).update(css.code).digest('hex').slice(0, 10);
writeFileSync(join(OUT, 'index.html'), readFileSync(join(SRC, 'index.template.html'), 'utf8').replaceAll('__VERSION__', version));

// Size report.
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); });
walk(A);
files.push(join(OUT, 'index.html'));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let first = 0; let firstGz = 0; let all = 0; let allGz = 0;
const initial = ['index.html', 'app.js', 'app.css', 'archivo-700.woff2', 'plex-400.woff2', 'plex-600.woff2'];
for (const f of files) {
  const buf = readFileSync(f);
  const gz = /\.woff2$/.test(f) ? buf.length : gzipSync(buf).length;
  all += buf.length; allGz += gz;
  if (initial.some((n) => f.endsWith(n))) { first += buf.length; firstGz += gz; }
  console.log(`${f.replace(OUT + '/', '').padEnd(36)} ${kb(buf.length).padStart(10)}  gzip ${kb(gz).padStart(9)}`);
}
console.log(`\nFirst load (page, app, CSS, 3 fonts): ${kb(first)} (${kb(firstGz)} gzipped)`);
console.log(`Everything incl. export libraries loaded on demand: ${kb(all)} (${kb(allGz)} gzipped)`);
console.log(`version ${version}`);
