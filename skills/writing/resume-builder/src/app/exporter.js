// Export helpers. The PDF and Word libraries load only when someone asks for a file,
// from this tool's own folder. No other network requests are made.

import { renderCoverPdf, renderResumePdf } from './pdf.js';

const pending = {};
function loadScript(src) {
  if (!pending[src]) {
    pending[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete pending[src]; reject(new Error(`Could not load ${src}`)); };
      document.head.appendChild(s);
    });
  }
  return pending[src];
}

async function pdfFonts() {
  await loadScript('assets/vendor/jspdf.umd.min.js');
  await loadScript('assets/pdf-fonts.js');
  return window.ACCESS_PDF_FONTS;
}

async function docxLib() {
  await loadScript('assets/docx-export.js');
  return window.ACCESS_DOCX;
}

export function fileName(person, kind, ext) {
  const slug = String(person || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my';
  return `${slug}-${kind}.${ext}`;
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function resumePdf(model) {
  return renderResumePdf(model, await pdfFonts());
}

export async function coverPdf(cover) {
  return renderCoverPdf(cover, await pdfFonts());
}

export async function resumeDocx(model) {
  return (await docxLib()).resumeDocx(model);
}

export async function coverDocx(cover) {
  return (await docxLib()).coverDocx(cover);
}
