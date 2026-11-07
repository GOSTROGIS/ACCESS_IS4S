// Saved data: shape, defaults, migration from the first version, and browser storage.

export const STORAGE_KEY = 'access-resume-builder-v2';
export const OLD_KEY = 'ats-resume-builder-v1';

export function uid() {
  return 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export const blankBullet = () => ({ id: uid(), verb: '', text: '' });
export const blankExperience = () => ({ id: uid(), jobTitle: '', company: '', location: '', startDate: '', endDate: '', current: false, bullets: [blankBullet()] });
export const blankEducation = () => ({ id: uid(), school: '', credential: '', location: '', startDate: '', endDate: '', current: false, notes: '' });
export const blankProject = () => ({ id: uid(), name: '', role: '', link: '', bullets: [blankBullet()] });
export const blankVolunteer = () => ({ id: uid(), role: '', organization: '', dates: '', description: '' });
export const blankTicket = (category = 'safety') => ({ id: uid(), category, name: '', issuer: '', issued: '', expiry: '', noExpiry: false });
export const blankCredential = () => ({ id: uid(), type: 'redseal', trade: '', issuer: 'SkilledTradesBC', date: '' });

export function defaultState() {
  return {
    version: 2,
    meta: { tab: 'resume' },
    personal: { fullName: '', headline: '', email: '', phone: '', location: '', linkedin: '', portfolio: '' },
    summary: '',
    trade: {
      credentials: [],
      apprenticeship: { trade: '', level: '', hours: '', asOf: '', sponsor: '' },
      licence: { cls: '', airBrake: false, other: '' },
    },
    tickets: [],
    experience: [],
    skills: { trade: [], tools: [], other: [], languages: [] },
    education: [],
    projects: [],
    volunteer: [],
    jobDescription: '',
    coverLetter: { recipient: '', company: '', role: '', body: '' },
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function fixBullets(list) {
  const out = arr(list).map((b) => ({ id: b && b.id ? b.id : uid(), verb: str(b && b.verb), text: str(b && b.text) }));
  return out.length ? out : [blankBullet()];
}

// Fill in anything missing so older or hand-edited backups never crash the page.
export function normalize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const p = raw.personal || {};
  const t = raw.trade || {};
  const s = raw.skills || {};
  return {
    ...d,
    meta: { tab: str((raw.meta || {}).tab) || 'resume' },
    personal: Object.fromEntries(Object.keys(d.personal).map((k) => [k, str(p[k])])),
    summary: str(raw.summary),
    trade: {
      credentials: arr(t.credentials).map((c) => ({ ...blankCredential(), ...c, id: c.id || uid() })),
      apprenticeship: { ...d.trade.apprenticeship, ...(t.apprenticeship || {}) },
      licence: { ...d.trade.licence, ...(t.licence || {}) },
    },
    tickets: arr(raw.tickets).map((x) => ({ ...blankTicket(x.category || 'ticket'), ...x, id: x.id || uid() })),
    experience: arr(raw.experience).map((e) => ({ ...blankExperience(), ...e, id: e.id || uid(), bullets: fixBullets(e.bullets) })),
    skills: { trade: arr(s.trade).map(str), tools: arr(s.tools).map(str), other: arr(s.other).map(str), languages: arr(s.languages).map(str) },
    education: arr(raw.education).map((e) => ({ ...blankEducation(), ...e, id: e.id || uid() })),
    projects: arr(raw.projects).map((e) => ({ ...blankProject(), ...e, id: e.id || uid(), bullets: fixBullets(e.bullets) })),
    volunteer: arr(raw.volunteer).map((e) => ({ ...blankVolunteer(), ...e, id: e.id || uid() })),
    jobDescription: str(raw.jobDescription),
    coverLetter: { ...d.coverLetter, ...(raw.coverLetter || {}) },
  };
}

// The first version stored skills as technical/soft/languages and had one certifications list.
export function migrateV1(old) {
  const o = old || {};
  const sk = o.skills || {};
  const certs = arr(o.certifications).map((c) => ({
    ...blankTicket('ticket'),
    name: str(c.name),
    issuer: str(c.issuer),
    issued: str(c.date),
  }));
  return normalize({
    personal: o.personal,
    summary: o.summary,
    experience: o.experience,
    education: o.education,
    projects: o.projects,
    volunteer: o.volunteer,
    jobDescription: o.jobDescription,
    coverLetter: o.coverLetter,
    tickets: certs,
    skills: { trade: arr(sk.technical), other: arr(sk.soft), languages: arr(sk.languages), tools: [] },
  });
}

// Accept a backup file from either version.
export function fromBackup(data) {
  if (data && data.version === 2) return normalize(data);
  if (data && (data.certifications || (data.skills && data.skills.technical))) return migrateV1(data);
  return normalize(data);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { state: normalize(JSON.parse(raw)), migrated: false, storageOk: true };
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const state = migrateV1(JSON.parse(old));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
      return { state, migrated: true, storageOk: true };
    }
    return { state: defaultState(), migrated: false, storageOk: true };
  } catch (e) {
    return { state: defaultState(), migrated: false, storageOk: false };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

// Clearing writes an empty résumé (rather than deleting the key) so an old
// first-version save is not brought back in on the next visit.
export function clearState() {
  const fresh = defaultState();
  saveState(fresh);
  return fresh;
}
