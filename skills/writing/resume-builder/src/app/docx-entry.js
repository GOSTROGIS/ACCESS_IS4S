// Real .docx export (Office Open XML) with the docx library. Loaded only when someone
// downloads a Word file. Single column, standard Heading 1 sections, no tables,
// no text boxes, no headers or footers, no images.

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, Tab, TabStopType, TextRun,
} from 'docx';

const FONT = 'Calibri';
const PAGE = { width: 12240, height: 15840 }; // US Letter in twentieths of a point
const MARGIN = 1080; // 0.75 in
const TEXT_W = PAGE.width - MARGIN * 2;

const styles = {
  default: { document: { run: { font: FONT, size: 21, color: '111111' }, paragraph: { spacing: { after: 40, line: 264 } } } },
  paragraphStyles: [
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: FONT, size: 23, bold: true, color: '111111' },
      paragraph: {
        spacing: { before: 220, after: 80 },
        border: { bottom: { color: '111111', space: 1, style: BorderStyle.SINGLE, size: 6 } },
      },
    },
    {
      id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: FONT, size: 36, bold: true, color: '111111' },
      paragraph: { spacing: { after: 40 } },
    },
  ],
};

const numbering = {
  config: [{
    reference: 'bullets',
    levels: [{
      level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360, hanging: 260 } } },
    }],
  }],
};

const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, bold: !!opts.bold, size: opts.size })], ...opts.para });
const bullet = (text) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(text)], spacing: { after: 30 } });

function sectionsFor(children) {
  return [{
    properties: { page: { size: PAGE, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
    children,
  }];
}

export async function resumeDocx(m) {
  const kids = [];
  if (m.name) kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(m.name)] }));
  if (m.headline) kids.push(p(m.headline, { size: 22 }));
  if (m.contact.length) kids.push(p(m.contact.join(' | '), { size: 20 }));

  for (const s of m.sections) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(s.title)] }));
    s.blocks.forEach((b, i) => {
      if (b.type === 'para') kids.push(p(b.text));
      if (b.type === 'labeled') {
        kids.push(new Paragraph({ children: [new TextRun({ text: `${b.label}: `, bold: true }), new TextRun(b.text)], spacing: { after: 60 } }));
      }
      if (b.type === 'list') b.items.forEach((it) => kids.push(bullet(it)));
      if (b.type === 'entry') {
        const head = [new TextRun({ text: b.title, bold: true })];
        if (b.right) head.push(new TextRun({ children: [new Tab(), b.right] }));
        kids.push(new Paragraph({
          children: head,
          tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
          spacing: { before: i === 0 ? 0 : 140, after: 20 },
          keepNext: true,
        }));
        if (b.sub) kids.push(p(b.sub, { size: 20 }));
        if (b.note) kids.push(p(b.note, { size: 20 }));
        b.bullets.forEach((it) => kids.push(bullet(it)));
      }
    });
  }

  const doc = new Document({
    creator: 'ACCESS Résumé Builder',
    title: `${m.name || 'Résumé'} - Résumé`,
    description: 'Résumé',
    styles,
    numbering,
    sections: sectionsFor(kids),
  });
  return Packer.toBlob(doc);
}

export async function coverDocx(c) {
  const kids = [];
  if (c.name) kids.push(p(c.name, { bold: true }));
  c.senderLines.forEach((l) => kids.push(p(l)));
  kids.push(p(''));
  kids.push(p(c.date));
  kids.push(p(''));
  c.recipientLines.forEach((l) => kids.push(p(l)));
  if (c.recipientLines.length) kids.push(p(''));
  if (c.re) kids.push(p(c.re, { bold: true }));
  if (c.re) kids.push(p(''));
  c.paragraphs.forEach((para) => {
    const lines = para.split('\n');
    const runs = [];
    lines.forEach((line, i) => runs.push(new TextRun({ text: line, break: i > 0 ? 1 : 0 })));
    kids.push(new Paragraph({ children: runs, spacing: { after: 200, line: 300 } }));
  });
  const doc = new Document({
    creator: 'ACCESS Résumé Builder',
    title: `${c.name || 'Cover letter'} - Cover letter`,
    description: 'Cover letter',
    styles,
    numbering,
    sections: sectionsFor(kids),
  });
  return Packer.toBlob(doc);
}

window.ACCESS_DOCX = { resumeDocx, coverDocx };
