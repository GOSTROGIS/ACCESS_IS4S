// One document model drives the live preview, the PDF, the Word file and the plain text,
// so all four always have the same words in the same order.

import { CREDENTIAL_TYPES, LICENCE_CLASSES } from './data.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtMonth(v) {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return String(v);
  return m[2] ? `${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : m[1];
}

export function fmtRange(start, end, current) {
  const s = fmtMonth(start);
  const e = current ? 'Present' : fmtMonth(end);
  if (s && e) return `${s} - ${e}`;
  return s || e || '';
}

const clean = (s) => String(s || '').trim();
const bulletText = (b) => clean([b.verb, b.text].filter((x) => clean(x)).join(' '));
const hasText = (list) => list.some((b) => clean(b.text));

// Ticket status relative to today: 'expired', 'soon' (within 90 days), 'ok' or ''.
export function ticketStatus(t, today = new Date()) {
  if (t.noExpiry || !t.expiry) return '';
  const m = String(t.expiry).match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  const endOfMonth = new Date(parseInt(m[1], 10), parseInt(m[2], 10), 0, 23, 59, 59);
  const days = (endOfMonth - today) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 90) return 'soon';
  return 'ok';
}

export function ticketLine(t) {
  let s = clean(t.name);
  if (!s) return '';
  if (clean(t.issuer)) s += ` - ${clean(t.issuer)}`;
  const dates = [];
  if (t.issued) dates.push(t.noExpiry || !t.expiry ? fmtMonth(t.issued) : `issued ${fmtMonth(t.issued)}`);
  if (t.expiry && !t.noExpiry) dates.push(`expires ${fmtMonth(t.expiry)}`);
  if (dates.length) s += ` (${dates.join(', ')})`;
  return s;
}

export function credentialLine(c) {
  const type = (CREDENTIAL_TYPES.find((x) => x.value === c.type) || {}).label || '';
  const trade = clean(c.trade);
  let s = c.type === 'other' ? trade : [trade, type].filter(Boolean).join(' - ');
  if (!s) return '';
  if (clean(c.issuer)) s += `, ${clean(c.issuer)}`;
  if (c.date) s += ` (${fmtMonth(c.date)})`;
  return s;
}

export function licenceLine(l) {
  if (!l || !l.cls) return '';
  let s = l.cls === 'other' ? clean(l.other) : (LICENCE_CLASSES.find((x) => x.value === l.cls) || {}).label || '';
  if (!s) return '';
  if (l.airBrake) s += ', air brake endorsement';
  return s;
}

export function buildResume(state) {
  const p = state.personal;
  const sections = [];
  const add = (id, title, blocks) => { if (blocks.length) sections.push({ id, title, blocks }); };

  add('summary', 'SUMMARY', clean(state.summary) ? [{ type: 'para', text: clean(state.summary) }] : []);

  const a = state.trade.apprenticeship;
  const appr = [];
  if (clean(a.trade) || clean(a.level) || clean(a.hours)) {
    const bullets = [];
    if (clean(a.hours)) {
      const n = Number(String(a.hours).replace(/[^\d.]/g, ''));
      const hrs = Number.isFinite(n) && n > 0 ? n.toLocaleString('en-CA') : clean(a.hours);
      bullets.push(`${hrs} work-based training hours${a.asOf ? ` (as of ${fmtMonth(a.asOf)})` : ''}`);
    }
    if (clean(a.sponsor)) bullets.push(`Sponsor: ${clean(a.sponsor)}`);
    appr.push({
      type: 'entry',
      title: clean(a.trade) ? `${clean(a.trade)} Apprentice` : 'Apprentice',
      right: clean(a.level),
      sub: '',
      bullets,
    });
  }
  add('apprenticeship', 'APPRENTICESHIP', appr);

  const certItems = [
    ...state.trade.credentials.map(credentialLine),
    ...state.tickets.filter((t) => t.category !== 'safety').map(ticketLine),
    licenceLine(state.trade.licence),
  ].filter(Boolean);
  add('certifications', 'CERTIFICATIONS', certItems.length ? [{ type: 'list', items: certItems }] : []);

  const safety = state.tickets.filter((t) => t.category === 'safety').map(ticketLine).filter(Boolean);
  add('safety', 'SAFETY TRAINING', safety.length ? [{ type: 'list', items: safety }] : []);

  add('experience', 'WORK EXPERIENCE', state.experience
    .filter((e) => clean(e.jobTitle) || clean(e.company))
    .map((e) => ({
      type: 'entry',
      title: clean(e.jobTitle) || clean(e.company),
      right: fmtRange(e.startDate, e.endDate, e.current),
      sub: [clean(e.jobTitle) ? clean(e.company) : '', clean(e.location)].filter(Boolean).join(', '),
      bullets: e.bullets.filter((b) => clean(b.text)).map(bulletText),
    })));

  const sk = state.skills;
  const skillLines = [
    ['Trade and technical skills', sk.trade],
    ['Tools and equipment', sk.tools],
    ['Other skills', sk.other],
    ['Languages', sk.languages],
  ].filter(([, v]) => v.length).map(([label, v]) => ({ type: 'labeled', label, text: v.join(', ') }));
  add('skills', 'SKILLS', skillLines);

  add('education', 'EDUCATION', state.education
    .filter((e) => clean(e.school) || clean(e.credential))
    .map((e) => ({
      type: 'entry',
      title: clean(e.credential) || clean(e.school),
      right: fmtRange(e.startDate, e.endDate, e.current),
      sub: [clean(e.credential) ? clean(e.school) : '', clean(e.location)].filter(Boolean).join(', '),
      bullets: [],
      note: clean(e.notes),
    })));

  add('projects', 'PROJECTS', state.projects
    .filter((pj) => clean(pj.name))
    .map((pj) => ({
      type: 'entry',
      title: clean(pj.name) + (clean(pj.role) ? ` - ${clean(pj.role)}` : ''),
      right: '',
      sub: clean(pj.link),
      bullets: hasText(pj.bullets) ? pj.bullets.filter((b) => clean(b.text)).map(bulletText) : [],
    })));

  add('volunteer', 'VOLUNTEER EXPERIENCE', state.volunteer
    .filter((v) => clean(v.role) || clean(v.organization))
    .map((v) => ({
      type: 'entry',
      title: clean(v.role) || clean(v.organization),
      right: clean(v.dates),
      sub: clean(v.role) ? clean(v.organization) : '',
      bullets: [],
      note: clean(v.description),
    })));

  return {
    name: clean(p.fullName),
    headline: clean(p.headline),
    contact: [p.email, p.phone, p.location, p.linkedin, p.portfolio].map(clean).filter(Boolean),
    sections,
  };
}

export function todayLong(d = new Date()) {
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function buildCover(state, d = new Date()) {
  const p = state.personal;
  const cl = state.coverLetter;
  return {
    name: clean(p.fullName),
    senderLines: [p.location, p.email, p.phone].map(clean).filter(Boolean),
    date: todayLong(d),
    recipientLines: [cl.recipient, cl.company].map(clean).filter(Boolean),
    re: clean(cl.role) ? `Re: ${clean(cl.role)}` : '',
    paragraphs: String(cl.body || '').replace(/\r/g, '').split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean),
  };
}

// The line under an entry title: employer and place, then dates. Kept on its own line in
// every format so the reading order never depends on right-aligned text.
export function subLine(b) {
  return [b.sub, b.right].filter(Boolean).join(' | ');
}

// Plain text in reading order. Used for "Copy as plain text" and in tests.
export function resumeToText(m) {
  const out = [];
  if (m.name) out.push(m.name);
  if (m.headline) out.push(m.headline);
  if (m.contact.length) out.push(m.contact.join(' | '));
  for (const s of m.sections) {
    out.push('', s.title);
    for (const b of s.blocks) {
      if (b.type === 'para') out.push(b.text);
      if (b.type === 'list') b.items.forEach((x) => out.push(`- ${x}`));
      if (b.type === 'labeled') out.push(`${b.label}: ${b.text}`);
      if (b.type === 'entry') {
        out.push(b.title);
        if (b.sub || b.right) out.push(subLine(b));
        if (b.note) out.push(b.note);
        b.bullets.forEach((x) => out.push(`- ${x}`));
      }
    }
  }
  return out.join('\n');
}

export function coverToText(c) {
  return [c.name, ...c.senderLines, '', c.date, '', ...c.recipientLines, '', c.re, '', c.paragraphs.join('\n\n')]
    .filter((x, i, a) => !(x === '' && a[i - 1] === ''))
    .join('\n').trim();
}

// Everything the keyword guide should search.
export function resumeTexts(state) {
  const m = buildResume(state);
  return [resumeToText(m)];
}

// Text the learner still needs to replace, e.g. "[trade]" left over from a starter.
export function findBrackets(text) {
  const hits = String(text || '').match(/\[[^\]\n]{1,40}\]/g);
  return hits ? Array.from(new Set(hits)) : [];
}
