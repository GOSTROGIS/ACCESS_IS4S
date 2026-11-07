// Keyword guide: pulls likely keywords out of a job posting and checks which ones
// appear in the résumé. It is a study aid. It does not copy any employer's system.

// Lower case, straight quotes, accents removed (é -> e), so "Résumé" matches "resume".
export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, '-')
    .toLowerCase();
}

export function tokenize(s) {
  return normalizeText(s)
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
}

// Simple plural folding: ladders -> ladder, boxes -> box, batteries -> battery.
export function stem(t) {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && /(ss|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

// Trade terms and phrases, matched on normalized text. French variants included where common.
const TERMS = [
  ['Red Seal', /\bred[\s-]?seal\b|\bsceau rouge\b/],
  ['journeyperson', /\bjourney ?(person|man|woman|men|people)\b|\bcompagnon\b/],
  ['apprentice', /\bapprentic(e|es|eship|eships)\b|\bapprenti(e|s)?\b/],
  ['Class 1 licence', /\bclass(e)?[\s-]?1\b(?![\d.])/],
  ['Class 3 licence', /\bclass(e)?[\s-]?3\b(?![\d.])/],
  ['Class 4 licence', /\bclass(e)?[\s-]?4\b(?![\d.])/],
  ['Class 5 licence', /\bclass(e)?[\s-]?(5|five)\b(?![\d.])/],
  ['air brake endorsement', /\bair[\s-]?brakes?\b|\bfreins? a air\b/],
  ["driver's licence", /\bdriver'?s?'? licen[cs]e\b|\bpermis de conduire\b/],
  ['reliable transportation', /\b(reliable|own) (transportation|transport|vehicle)\b/],
  ['WHMIS', /\bwhmis\b|\bsimdut\b/],
  ['fall protection', /\bfall[\s-]?protection\b/],
  ['fall arrest', /\bfall[\s-]?arrest\b/],
  ['first aid', /\bfirst[\s-]?aid\b|\bpremiers soins\b|\bsecourisme\b/],
  ['CPR', /\bcpr\b|\brcr\b/],
  ['forklift', /\bfork[\s-]?lifts?\b|\blift[\s-]?trucks?\b|\bchariot elevateur\b/],
  ['aerial work platform', /\baerial (work )?platforms?\b|\bawp\b|\bnacelle\b/],
  ['scissor lift', /\bscissor[\s-]?lifts?\b/],
  ['boom lift', /\bboom[\s-]?lifts?\b/],
  ['skid steer', /\bskid[\s-]?steers?\b|\bbobcat\b/],
  ['excavator', /\bexcavators?\b/],
  ['backhoe', /\bbackhoes?\b/],
  ['loader', /\b(wheel |front[\s-]end |track )?loaders?\b/],
  ['dozer', /\b(bull)?dozers?\b/],
  ['grader', /\bgraders?\b/],
  ['confined space', /\bconfined[\s-]?spaces?\b/],
  ['traffic control', /\btraffic control\b|\bflag ?(ger|gers|ging|person|persons)\b|\btcp\b/],
  ['lockout/tagout', /\block[\s-]?out\b|\bloto\b|\btag[\s-]?out\b/],
  ['ground disturbance', /\bground disturbance\b/],
  ['H2S Alive', /\bh2s\b/],
  ['CSTS', /\bcsts\b/],
  ['rigging', /\brigg(ing|er|ers)\b/],
  ['PPE', /\bppe\b|\bpersonal protective equipment\b|\bepi\b/],
  ['steel-toe boots', /\bsteel[\s-]?toed?\b/],
  ['hard hat', /\bhard[\s-]?hats?\b/],
  ['scaffolding', /\bscaffold(s|ing)?\b|\becha?faudage\b/],
  ['concrete', /\bconcrete\b|\bbeton\b/],
  ['formwork', /\bform[\s-]?work\b|\bconcrete forms?\b|\bforming\b|\bcoffrage\b/],
  ['framing', /\bfram(ing|er|ers)\b/],
  ['drywall', /\bdry[\s-]?wall\b/],
  ['blueprints and drawings', /\bblue[\s-]?prints?\b|\b(construction|shop|technical) drawings?\b|\bread(ing)? drawings?\b|\bplans? reading\b/],
  ['hand and power tools', /\b(hand|power) tools?\b/],
  ['tape measure', /\btape measures?\b/],
  ['welding', /\bweld(ing|s|ed)?\b|\bsoudage\b/],
  ['GMAW (MIG)', /\bgmaw\b|\bmig\b/],
  ['GTAW (TIG)', /\bgtaw\b|\btig\b/],
  ['SMAW (stick)', /\bsmaw\b|\bstick weld(ing)?\b/],
  ['FCAW (flux core)', /\bfcaw\b|\bflux[\s-]?core(d)?\b/],
  ['oxy-acetylene', /\boxy[\s-]?(acetylene|fuel)\b|\bcutting torch(es)?\b/],
  ['plasma cutting', /\bplasma (cut|cutting|cutter)\b/],
  ['conduit', /\bconduits?\b/],
  ['wiring', /\bwir(e|es|ing)\b/],
  ['Canadian Electrical Code', /\bcanadian electrical code\b|\bcec\b/],
  ['building code', /\bbuilding codes?\b/],
  ['plumbing code', /\bplumbing codes?\b/],
  ['troubleshooting', /\btroubleshoot(ing|s)?\b/],
  ['preventive maintenance', /\bprevent(ive|ative) maintenance\b/],
  ['hydraulics', /\bhydraulics?\b/],
  ['pneumatics', /\bpneumatics?\b/],
  ['pumps', /\bpumps?\b/],
  ['conveyors', /\bconveyors?\b/],
  ['site cleanup', /\b(site |job[\s-]?site )?clean[\s-]?up\b/],
  ['heavy lifting', /\bheavy lifting\b|\blift(ing)? (up to )?\d+ ?(lb|lbs|pounds|kg)\b/],
  ['teamwork', /\bteam[\s-]?work\b|\bteam player\b/],
  ['customer service', /\bcustomer service\b/],
  ['WorkSafeBC', /\bworksafe ?bc\b/],
  ['occupational health and safety', /\boccupational health (and|&) safety\b|\bohs\b/],
];

const STOP_EN = 'a about above after again all also am an and any are as at be been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours us may might must shall also etc per via within without upon including include includes plus well able ability'.split(' ');
const STOP_FR = 'le la les un une des du de d l et ou en au aux pour par sur dans avec sans est sont etre avoir nous vous votre vos notre nos ce cette ces qui que quoi dont ou il elle ils elles se sa son ses leur leurs pas plus tres tout tous toute toutes comme mais donc ainsi afin entre chez'.split(' ');
const JD_IGNORE = 'experience experienced years year role position company team work working worker workers candidate candidates required requirements requirement require requires preferred desired asset assets bonus looking seeking opportunity opportunities qualified qualifications qualification responsibilities responsibility responsible duties duty skill skills job jobs apply applicant applicants hiring hire employer employee employees new strong good excellent great day days week weeks hour hours time full part based must need needs needed ensure using use used other others various related include across etc site sites welcome ticket tickets resume resumes cv cover letter email apply posting send call contact salary wage wages benefit benefits shift shifts start immediately asset assets plus valid bc british columbia canada vancouver burnaby surrey richmond coquitlam langley abbotsford chilliwack delta kelowna kamloops victoria nanaimo westminster maple ridge squamish whistler daily busy weekly fast paced keep take make get put set help give want know see look bring hold come'.split(' ');
const STOP = new Set([...STOP_EN, ...STOP_FR, ...JD_IGNORE]);
const KEEP_SHORT = new Set(['cpr', 'ppe', 'tig', 'mig', 'awp', 'cad', 'plc', 'hvac', 'ohs', 'cec', 'loto', 'h2s', 'tcp']);
const PHRASE_STOP = new Set(['we', 'you', 'our', 'the', 'this', 'that', 'if', 'job', 'apply', 'please', 'about', 'what', 'who', 'why', 'how', 'when', 'where', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);

function termHits(text, re) {
  const g = new RegExp(re.source, 'g');
  let n = 0;
  while (g.exec(text) !== null) { n += 1; if (n > 20) break; }
  return n;
}

export function extractKeywords(posting, limit = 30) {
  if (!posting || !posting.trim()) return [];
  const orig = normalizeText(posting);
  let norm = orig;
  const out = [];
  const seen = new Set();

  // 1. Known trade terms (weighted highest). Count on the full text, then blank them out
  //    so their words are not counted again as single words.
  for (const [label, re] of TERMS) {
    const n = termHits(orig, re);
    if (n > 0) {
      out.push({ label, kind: 'term', re, weight: 3 + Math.min(n, 3) });
      seen.add(normalizeText(label));
    }
  }
  // Blank out every character covered by a term match (found on the full text, so
  // overlapping terms such as "concrete" and "concrete forms" are both removed).
  const mask = new Array(orig.length).fill(false);
  for (const t of out) {
    const g = new RegExp(t.re.source, 'g');
    let mm;
    while ((mm = g.exec(orig)) !== null) {
      for (let i = mm.index; i < mm.index + mm[0].length; i += 1) mask[i] = true;
      if (!mm[0]) g.lastIndex += 1;
    }
  }
  norm = orig.split('').map((ch, i) => (mask[i] ? ' ' : ch)).join('');

  // 2. Capitalized multi-word phrases from the original text (e.g. "Concrete Finisher").
  const phraseRe = /\b([A-Z][\p{L}+#.'-]*[\p{L}+#](?:[ \t]+[A-Z][\p{L}+#.'-]*[\p{L}+#]){1,3})\b/gu;
  const phrases = new Map();
  let m;
  while ((m = phraseRe.exec(posting)) !== null) {
    const words = tokenize(m[1]);
    if (words.length < 2 || words.some((w) => PHRASE_STOP.has(w) || STOP.has(w))) continue;
    const key = words.map(stem).join(' ');
    if (!phrases.has(key)) phrases.set(key, { label: m[1].trim(), n: 0, words });
    phrases.get(key).n += 1;
  }
  // Words already covered by a trade term, so "Valid Class" is not kept next to "Class 5 licence".
  const termStems = new Set();
  for (const t of out) {
    const g = new RegExp(t.re.source, 'g');
    let mm;
    while ((mm = g.exec(orig)) !== null) { tokenize(mm[0]).forEach((w) => termStems.add(stem(w))); if (!mm[0]) g.lastIndex += 1; }
  }
  const phraseStems = new Set();
  for (const [key, p] of phrases) {
    if (key.split(' ').some((w) => termStems.has(w))) continue;
    if (seen.has(normalizeText(p.label))) continue;
    if (out.some((t) => t.kind === 'term' && t.re.test(normalizeText(p.label)))) continue;
    out.push({ label: p.label, kind: 'phrase', stems: key.split(' '), weight: 2 + Math.min(p.n, 3) });
    key.split(' ').forEach((s) => phraseStems.add(s));
  }

  // 3. Single words left over, counted by their plural-folded stem.
  const counts = new Map();
  for (const t of tokenize(norm)) {
    if (/^\d+$/.test(t)) continue;
    if (t.length < 4 && !KEEP_SHORT.has(t)) continue;
    if (STOP.has(t)) continue;
    const s = stem(t);
    if (STOP.has(s) || phraseStems.has(s)) continue;
    if (!counts.has(s)) counts.set(s, { label: t, n: 0 });
    counts.get(s).n += 1;
  }
  for (const [s, c] of counts) {
    out.push({ label: c.label, kind: 'word', stems: [s], weight: Math.min(c.n, 3) });
  }

  out.sort((a, b) => b.weight - a.weight || (a.kind === 'word') - (b.kind === 'word') || b.label.length - a.label.length);
  return out.slice(0, limit);
}

export function buildCorpus(texts) {
  const text = normalizeText(texts.filter(Boolean).join(' \n '));
  return { text, stems: tokenize(text).map(stem) };
}

function hasSequence(stems, seq) {
  outer: for (let i = 0; i <= stems.length - seq.length; i += 1) {
    for (let j = 0; j < seq.length; j += 1) if (stems[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

export function matchKeyword(kw, corpus) {
  if (kw.kind === 'term') return new RegExp(kw.re.source).test(corpus.text);
  return hasSequence(corpus.stems, kw.stems);
}

export function scoreMatch(posting, texts) {
  const keywords = extractKeywords(posting);
  if (!keywords.length) return null;
  const corpus = buildCorpus(texts);
  const found = [];
  const missing = [];
  let hit = 0;
  let total = 0;
  for (const k of keywords) {
    total += k.weight;
    if (matchKeyword(k, corpus)) { found.push(k); hit += k.weight; } else missing.push(k);
  }
  return { score: total ? Math.round((100 * hit) / total) : 0, found, missing, total: keywords.length };
}
