// Text PDF export with jsPDF and an embedded Noto Sans subset (covers accents and the
// characters used in many First Nations language spellings). Real, selectable text only.

const PAGE_W = 612;
const PAGE_H = 792;

function setup(fonts, props) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  doc.setFont('NotoSans', 'normal');
  doc.setTextColor(17, 17, 17);
  doc.setDrawColor(17, 17, 17);
  doc.setProperties(props);
  if (typeof doc.setLanguage === 'function') doc.setLanguage('en-CA');
  return doc;
}

function makeWriter(doc, margin) {
  const W = PAGE_W - margin * 2;
  const st = { y: margin };

  const font = (bold, size) => { doc.setFont('NotoSans', bold ? 'bold' : 'normal'); doc.setFontSize(size); };
  const width = (t, bold, size) => { font(bold, size); return doc.getTextWidth(t); };
  const ensure = (h) => { if (st.y + h > PAGE_H - margin) { doc.addPage(); st.y = margin; } };

  // Lay out runs of text ({ text, bold }) across lines, wrapping at maxW.
  function layout(runs, size, maxW) {
    const tokens = [];
    runs.forEach((r) => {
      String(r.text).split(/(\s+)/).forEach((part) => {
        if (part === '') return;
        tokens.push({ text: part, bold: !!r.bold, space: /^\s+$/.test(part) });
      });
    });
    const lines = [];
    let line = [];
    let lw = 0;
    const push = () => {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line);
      line = [];
      lw = 0;
    };
    for (const tk of tokens) {
      if (tk.space) {
        if (!line.length) continue;
        const w = width(' ', tk.bold, size);
        line.push({ text: ' ', bold: tk.bold, space: true, w });
        lw += w;
        continue;
      }
      let w = width(tk.text, tk.bold, size);
      if (lw + w > maxW && line.length) push();
      let text = tk.text;
      while (w > maxW) {
        let cut = text.length - 1;
        while (cut > 1 && width(text.slice(0, cut), tk.bold, size) > maxW) cut -= 1;
        line.push({ text: text.slice(0, cut), bold: tk.bold, w: width(text.slice(0, cut), tk.bold, size) });
        push();
        text = text.slice(cut);
        w = width(text, tk.bold, size);
      }
      line.push({ text, bold: tk.bold, w });
      lw += w;
    }
    if (line.length) push();
    return lines;
  }

  // Draw one laid-out line, merging neighbouring pieces in the same font into one text run.
  function drawLine(pieces, x, size) {
    const merged = [];
    pieces.forEach((p) => {
      const last = merged[merged.length - 1];
      if (last && last.bold === p.bold) { last.text += p.text; last.w += p.w; } else merged.push({ ...p });
    });
    let cx = x;
    merged.forEach((p) => {
      font(p.bold, size);
      doc.text(p.text, cx, st.y, { baseline: 'top' });
      cx += p.w;
    });
  }

  function runs(rs, { size = 10.5, x = margin, maxW = W, lh = 1.38, after = 0 } = {}) {
    const lines = layout(rs, size, maxW);
    lines.forEach((ln) => {
      ensure(size * lh);
      drawLine(ln, x, size);
      st.y += size * lh;
    });
    st.y += after;
  }

  const textBlock = (t, opts) => runs([{ text: t, bold: !!(opts && opts.bold) }], opts);

  return { st, W, margin, font, width, ensure, runs, textBlock };
}

export function renderResumePdf(m, fonts) {
  const margin = 54;
  const doc = setup(fonts, {
    title: `${m.name || 'Résumé'} - Résumé`,
    subject: 'Résumé',
    author: m.name || '',
    creator: 'ACCESS Résumé Builder',
  });
  const w = makeWriter(doc, margin);
  const { st, W } = w;

  if (m.name) w.textBlock(m.name, { size: 18, bold: true, lh: 1.25, after: 2 });
  if (m.headline) w.textBlock(m.headline, { size: 11, after: 1 });
  if (m.contact.length) w.textBlock(m.contact.join(' | '), { size: 10, after: 2 });

  for (const s of m.sections) {
    w.ensure(60);
    st.y += 10;
    w.textBlock(s.title, { size: 11, bold: true, lh: 1.3 });
    doc.setLineWidth(0.75);
    doc.line(margin, st.y + 1, margin + W, st.y + 1);
    st.y += 6;

    s.blocks.forEach((b, i) => {
      const last = i === s.blocks.length - 1;
      if (b.type === 'para') w.textBlock(b.text, { size: 10.5, after: 2 });
      if (b.type === 'labeled') w.runs([{ text: `${b.label}: `, bold: true }, { text: b.text }], { size: 10.5, after: 3 });
      if (b.type === 'list') {
        b.items.forEach((it) => {
          w.ensure(16);
          w.font(false, 10.5);
          doc.text('•', margin + 4, st.y, { baseline: 'top' });
          w.textBlock(it, { size: 10.5, x: margin + 16, maxW: W - 16, after: 2 });
        });
      }
      if (b.type === 'entry') {
        w.ensure(34);
        const rightW = b.right ? w.width(b.right, false, 10) : 0;
        const titleW = w.width(b.title, true, 10.5);
        if (b.right && titleW + rightW + 14 <= W) {
          w.font(false, 10);
          doc.text(b.right, margin + W - rightW, st.y + 0.6, { baseline: 'top' });
          w.textBlock(b.title, { size: 10.5, bold: true });
        } else {
          w.textBlock(b.title, { size: 10.5, bold: true });
          if (b.right) w.textBlock(b.right, { size: 10 });
        }
        if (b.sub) w.textBlock(b.sub, { size: 10 });
        if (b.note) w.textBlock(b.note, { size: 10 });
        b.bullets.forEach((it) => {
          w.ensure(16);
          w.font(false, 10.5);
          doc.text('•', margin + 4, st.y, { baseline: 'top' });
          w.textBlock(it, { size: 10.5, x: margin + 16, maxW: W - 16, after: 1.5 });
        });
        st.y += last ? 2 : 8;
      }
    });
  }
  return doc.output('blob');
}

export function renderCoverPdf(c, fonts) {
  const margin = 72;
  const doc = setup(fonts, {
    title: `${c.name || 'Cover letter'} - Cover letter`,
    subject: 'Cover letter',
    author: c.name || '',
    creator: 'ACCESS Résumé Builder',
  });
  const w = makeWriter(doc, margin);
  const { st } = w;
  if (c.name) w.textBlock(c.name, { size: 11, bold: true });
  c.senderLines.forEach((l) => w.textBlock(l, { size: 11 }));
  st.y += 16;
  w.textBlock(c.date, { size: 11, after: 14 });
  c.recipientLines.forEach((l) => w.textBlock(l, { size: 11 }));
  if (c.recipientLines.length) st.y += 14;
  if (c.re) w.textBlock(c.re, { size: 11, bold: true, after: 12 });
  c.paragraphs.forEach((p) => {
    p.split('\n').forEach((line) => w.textBlock(line || ' ', { size: 11, lh: 1.45 }));
    st.y += 10;
  });
  return doc.output('blob');
}
