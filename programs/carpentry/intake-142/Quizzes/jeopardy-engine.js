/* Build Your Score engine: seeded boards, secret tiles, events, grading and round codes.
   No DOM. Works in the browser (window.JeopardyEngine) and in Node (module.exports).
   Every random choice uses its own stream from the round seed, so one round code replays the same game.
   Functions that take settings expect them already normalized with normalizeSettings(). */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const EV = root.JeopardyEvents || (node ? require('./jeopardy-events.js') : null);
  const shared = root.QuizShared || (node ? require('./quiz-shared.js') : null);
  const { seeded, shuffle } = shared;

  /* ---------- random streams ---------- */
  function hash(text) { let h = 2166136261 >>> 0; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function stream(seed, name) { return seeded(hash(String(seed).toUpperCase() + '|' + name)); }
  function pickWeighted(items, random) {
    const total = items.reduce((n, x) => n + (x.weight || 1), 0); let r = random() * total;
    for (const x of items) { r -= (x.weight || 1); if (r < 0) return x; }
    return items[items.length - 1];
  }
  const pick = (list, random) => list[Math.floor(random() * list.length)];

  /* ---------- settings and round codes ---------- */
  const CHANCES = [0, 10, 20, 35], TIMERS = [0, 30, 60, 90];
  const EVENT_IDS = EV ? EV.EVENTS.map(e => e.id) : [];
  const FLAG_KEYS = Object.freeze(['secret', 'pitfalls', 'penalties', 'events', 'final', 'steals', 'mathOnly']);
  const NUMBER_KEYS = Object.freeze(['chance', 'timer', 'rows', 'columns']);
  const DEFAULTS = Object.freeze({ secret: true, pitfalls: true, penalties: false, events: true, chance: 20, final: true, steals: true, timer: 0, mathOnly: true, rows: 5, columns: 5, eventsOff: [] });
  function normalizeSettings(input) {
    const s = Object.assign({}, DEFAULTS, input || {});
    for (const k of FLAG_KEYS) s[k] = Boolean(s[k]);
    s.chance = CHANCES.includes(Number(s.chance)) ? Number(s.chance) : DEFAULTS.chance;
    s.timer = TIMERS.includes(Number(s.timer)) ? Number(s.timer) : 0;
    s.rows = Number(s.rows) === 4 ? 4 : 5;
    s.columns = [3, 4, 5].includes(Number(s.columns)) ? Number(s.columns) : 5;
    s.eventsOff = Array.isArray(s.eventsOff) ? EVENT_IDS.filter(id => s.eventsOff.includes(id)) : [];
    return s;
  }
  function packSettings(s) {
    let n = 0;
    FLAG_KEYS.forEach((k, i) => { if (s[k]) n += 2 ** i; });
    n += CHANCES.indexOf(s.chance) * 2 ** 7 + TIMERS.indexOf(s.timer) * 2 ** 9 + (s.rows === 4 ? 2 ** 11 : 0) + (5 - s.columns) * 2 ** 12;
    EVENT_IDS.forEach((id, i) => { if (s.eventsOff.includes(id)) n += 2 ** (14 + i); });
    return n.toString(36).toUpperCase();
  }
  function unpackSettings(text) {
    const n = parseInt(text, 36); if (!Number.isFinite(n) || n < 0 || n >= 2 ** (14 + EVENT_IDS.length)) throw new Error('The round code settings are not valid.');
    const bit = i => Math.floor(n / 2 ** i) % 2 === 1, s = {};
    FLAG_KEYS.forEach((k, i) => { s[k] = bit(i); });
    s.chance = CHANCES[Math.floor(n / 2 ** 7) % 4]; s.timer = TIMERS[Math.floor(n / 2 ** 9) % 4];
    s.rows = bit(11) ? 4 : 5; s.columns = 5 - Math.floor(n / 2 ** 12) % 4;
    s.eventsOff = EVENT_IDS.filter((id, i) => bit(14 + i));
    return normalizeSettings(s);
  }
  const MAX_TEAMS = 16;
  const validTeamCount = n => Number.isInteger(n) && n >= 1 && n <= MAX_TEAMS;
  const boardKey = id => String(id).toUpperCase().replace(/[^A-Z0-9]/g, '');
  function encodeCode(boardId, teams, settings, seed) { return 'J2-' + boardKey(boardId) + '-T' + teams + '-' + packSettings(settings) + '-' + String(seed).toUpperCase(); }
  function decodeCode(code) {
    const m = String(code || '').trim().toUpperCase().match(/^J2-([A-Z0-9]{2,40})-T([1-9]|1[0-6])-([0-9A-Z]{1,8})-([0-9A-Z]{1,8})$/);
    if (!m) throw new Error('Use a full round code, such as J2-W03L01-T2-3DZ-ABC123.');
    return { key: m[1], teams: Number(m[2]), settings: unpackSettings(m[3]), seed: m[4] };
  }

  /* ---------- boards ---------- */
  const onePerSkill = board => board.pick === 'one-per-skill';
  function usable(q, settings, exclude) { return !(settings.mathOnly && (q.meta || q.offTopic)) && !(exclude && exclude.has(q.id)); }
  /* Row n holds level n. With 4 rows, the last row takes level 4 or 5. */
  function rowBuckets(rows) { return rows === 4 ? [[1], [2], [3], [4, 5]] : [[1], [2], [3], [4], [5]]; }
  /* Skill boards have more categories than columns. The seed picks which ones, in their listed order. */
  function boardCategories(board, seed, settings) {
    const cats = board.categories.slice();
    if (board.kind === 'skill' && settings.columns < cats.length) {
      const keep = new Set(shuffle(cats, stream(seed, 'columns')).slice(0, settings.columns));
      return cats.filter(c => keep.has(c));
    }
    return cats;
  }
  function boardRows(board, settings) {
    if (!onePerSkill(board)) return settings.rows;
    return Math.ceil(new Set(board.questions.map(q => q.skill)).size / board.categories.length);
  }
  /* Value follows difficulty: row n draws a question of level n where the column allows. */
  function makeBoard(board, seed, settings, options) {
    const exclude = options && options.exclude;
    const rows = boardRows(board, settings), random = stream(seed, 'board'), choiceRandom = stream(seed, 'choices');
    const categories = boardCategories(board, seed, settings);
    const pool = board.questions.filter(q => usable(q, settings, exclude));
    const tiles = [];
    if (onePerSkill(board)) {
      const skills = [...new Set(board.questions.map(q => q.skill))];
      const chosen = skills.map(skill => { const p = pool.filter(q => q.skill === skill); return pick(p.length ? p : board.questions.filter(q => q.skill === skill), random); });
      categories.forEach((category, column) => {
        chosen.filter(q => q.category === category).sort((a, b) => a.level - b.level || a.id.localeCompare(b.id)).slice(0, rows)
          .forEach((q, row) => tiles.push(tile(q, category, column, row, choiceRandom)));
      });
      return tiles;
    }
    const buckets = rowBuckets(rows);
    categories.forEach((category, column) => {
      let left = shuffle(pool.filter(q => q.category === category), random);
      const picked = [];
      buckets.forEach(levels => {
        if (!left.length) return;
        let found = left.find(q => levels.includes(Number(q.level)));
        if (!found) { const target = levels[0]; found = left.slice().sort((a, b) => Math.abs(a.level - target) - Math.abs(b.level - target))[0]; }
        picked.push(found); left = left.filter(q => q !== found);
      });
      picked.sort((a, b) => (a.level || 0) - (b.level || 0) || String(a.id).localeCompare(String(b.id)))
        .forEach((q, row) => tiles.push(tile(q, category, column, row, choiceRandom)));
    });
    return tiles;
  }
  function tile(q, category, column, row, random) {
    return { key: 'c' + column + 'r' + row, questionId: q.id, category, column, row, value: (row + 1) * 100, choices: q.type === 'choice' ? shuffle(q.choices, random) : null, mod: null, state: 'open', result: null };
  }

  /* ---------- secret tiles and pitfalls ---------- */
  function assignModifiers(tiles, seed, settings, teams) {
    const random = stream(seed, 'mods'), big = tiles.length >= 20;
    const out = {}; let free = shuffle(tiles.map(t => t.key), random);
    const take = (count, filter, mod) => { for (let i = 0; i < count; i++) { const k = free.find(filter); if (!k) return; out[k] = mod; free = free.filter(x => x !== k); } };
    const byKey = Object.fromEntries(tiles.map(t => [t.key, t]));
    const rowsHigh = Math.max(...tiles.map(t => t.row));
    if (settings.secret) {
      take(big ? 2 : 1, k => byKey[k].row >= Math.min(2, rowsHigh), 'foreman');
      take(big ? 2 : 1, () => true, 'double');
      take(big ? 1 : (random() < 0.5 ? 1 : 0), () => true, 'crib');
    }
    if (settings.pitfalls) {
      const kinds = teams > 1 ? ['hazard', 'bentnail', 'rework'].concat(settings.steals ? ['openbid'] : []) : ['hazard'];
      const count = big ? 3 : 1 + (random() < 0.5 ? 1 : 0);
      for (let i = 0; i < count; i++) take(1, () => true, pick(kinds, random));
    }
    return out;
  }

  /* ---------- events ---------- */
  function eventDeck(settings, teams) { return EV ? EV.EVENTS.filter(e => !settings.eventsOff.includes(e.id) && teams >= e.minTeams) : []; }
  /* Roll after finished board turn number turnNumber (1, 2, ...). Keyed by turn, so a replay gives the same rolls. */
  function rollEvent(seed, turnNumber, ctx) {
    const settings = ctx.settings;
    if (!settings.events || settings.chance === 0 || ctx.phase !== 'board') return null;
    if ((ctx.eventsCount || 0) >= 3 || ctx.lastEventTurn === turnNumber - 1) return null;
    const random = stream(seed, 'event:' + turnNumber);
    if (random() * 100 >= settings.chance) return null;
    const deck = eventDeck(settings, ctx.teams).filter(e => !((e.id === 'changeorder' || e.id === 'shortage') && (ctx.openCount || 0) < 2));
    return deck.length ? pickWeighted(deck, random).id : null;
  }
  function eventRandom(seed, turnNumber) { return stream(seed, 'event-detail:' + turnNumber); }

  /* ---------- special questions ---------- */
  function pickFinal(board, seed, usedIds, settings) {
    const used = new Set(usedIds || []);
    const base = board.questions.filter(q => usable(q, settings) && !used.has(q.id));
    for (const test of [q => q.type === 'number' && q.level >= 4, q => q.level >= 4, () => true]) { const list = base.filter(test); if (list.length) return pick(list, stream(seed, 'final')); }
    return board.questions[0];
  }
  function pickTiebreak(board, seed, usedIds, round) {
    const used = new Set(usedIds || []);
    let list = board.questions.filter(q => q.type === 'number' && !used.has(q.id) && !q.meta && !q.offTopic);
    if (!list.length) list = board.questions.filter(q => q.type === 'number');
    return list.length ? pick(list, stream(seed, 'tiebreak:' + round)) : null;
  }
  function pickStandDown(pools, seed, turnNumber) {
    const list = pools.filter(q => q && q.type === 'choice');
    return list.length ? pick(list, stream(seed, 'standdown:' + turnNumber)) : null;
  }
  function wagerLimits(score, topValue) { return { min: 5, max: Math.max(score, topValue, 5) }; }
  function finalWagerMax(score) { return score > 0 ? score : 200; }

  /* ---------- grading ---------- */
  const fractions = { '½':'1/2', '⅓':'1/3', '⅔':'2/3', '¼':'1/4', '¾':'3/4', '⅕':'1/5', '⅖':'2/5', '⅗':'3/5', '⅘':'4/5', '⅙':'1/6', '⅚':'5/6', '⅛':'1/8', '⅜':'3/8', '⅝':'5/8', '⅞':'7/8' };
  const UNIT_WORDS = {
    degrees: ['degrees', 'degree', 'deg', '°'], percent: ['%', 'percent'], dollars: ['dollars', 'dollar', '$'],
    in: ['inches', 'inch', 'in', '"'], ft: ['feet', 'foot', 'ft', "'"], mm: ['millimetres', 'millimeters', 'mm'], cm: ['centimetres', 'centimeters', 'cm'],
    m: ['metres', 'meters', 'm'], m2: ['m²', 'm2', 'square metres', 'square meters'], m3: ['m³', 'm3', 'cubic metres', 'cubic meters'],
    cm2: ['cm²', 'cm2', 'square centimetres', 'square centimeters'], mm2: ['mm²', 'mm2'], mm3: ['mm³', 'mm3'], yd3: ['yd³', 'yd3', 'cubic yards', 'cubic yard'], l: ['litres', 'liters', 'l']
  };
  const UNIT_SAME = { '°': 'degrees', '%': 'percent', '$': 'dollars' };
  function unitKey(unit) { const k = String(unit || '').toLowerCase().replace(/²/g, '2').replace(/³/g, '3').trim(); return UNIT_SAME[k] || k; }
  function unitEndings(unit) { return (UNIT_WORDS[unitKey(unit)] || [String(unit || '')]).filter(Boolean).sort((a, b) => b.length - a.length); }
  function mentionsUnit(input, unit) {
    if (!unit) return true;
    const text = String(input || '').trim().toLowerCase();
    if (unitKey(unit) === 'dollars' && /^\$/.test(text)) return true;
    return unitEndings(unit).some(s => text.endsWith(s.toLowerCase()) && (s.length > 1 || /[\d\s]$/.test(text.slice(0, -1)) || !/[a-z]/.test(s)));
  }
  function parseNumber(input, unit) {
    let text = String(input).trim().replace(/[−–]/g, '-');
    if (!text) return { error: 'Enter an answer first.' };
    text = text.replace(/([0-9])([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '$1 $2');
    text = text.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, c => fractions[c]);
    const lower = text.toLowerCase();
    for (const suffix of unitEndings(unit)) {
      if (lower.endsWith(suffix.toLowerCase())) { text = text.slice(0, -suffix.length).trim(); break; }
    }
    if (unitKey(unit) === 'dollars') text = text.replace(/^\$\s*/, '');
    if (/,/.test(text)) {
      if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return { error: 'Use a decimal point, or group thousands as 1,200.' };
      text = text.replace(/,/g, '');
    }
    let value, match;
    if ((match = text.match(/^([+-]?\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
      if (+match[3] === 0) return { error: 'A fraction cannot have a zero denominator.' };
      const sign = match[1].startsWith('-') ? -1 : 1;
      value = sign * (Math.abs(+match[1]) + (+match[2] / +match[3]));
    } else if ((match = text.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/))) {
      if (+match[2] === 0) return { error: 'A fraction cannot have a zero denominator.' };
      value = +match[1] / +match[2];
    } else if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) value = Number(text);
    else return { error: 'Enter a number, decimal or fraction, such as 12.5, 3/8 or 1 3/4' + (unit ? ', in ' + unit + '.' : '.') };
    return Number.isFinite(value) ? { value } : { error: 'Enter a finite number.' };
  }
  function grade(question, input) {
    if (question.type === 'choice') {
      if (!question.choices.includes(input)) return { error: 'Choose one answer.' };
      return { correct: input === question.answer };
    }
    const parsed = parseNumber(input, question.unit);
    if (parsed.error) return parsed;
    const tolerance = Number(question.tolerance || 0) + Math.max(1, Math.abs(question.answer)) * 1e-10;
    return { correct: Math.abs(parsed.value - question.answer) <= tolerance, value: parsed.value };
  }
  /* Closest Cut: smallest distance to the key wins. Returns indexes of the closest entries. */
  function closest(answers, key) {
    const dist = answers.map(a => (a == null || !Number.isFinite(a)) ? Infinity : Math.abs(a - key));
    const best = Math.min(...dist);
    return best === Infinity ? [] : dist.map((d, i) => Math.abs(d - best) < 1e-9 ? i : -1).filter(i => i >= 0);
  }
  /* Teams sorted by score, high to low. Equal scores share a rank. */
  function ranking(scores) {
    const order = scores.map((s, i) => ({ team: i, score: s })).sort((a, b) => b.score - a.score || a.team - b.team);
    order.forEach((x, i) => { x.rank = i && order[i - 1].score === x.score ? order[i - 1].rank : i + 1; });
    return order;
  }

  /* ---------- skill board files ---------- */
  /* Checks a registered board and fixes it in place: unreadable questions are removed and numbers are made numeric. */
  function validateBoard(board) {
    if (!board || typeof board !== 'object' || !board.id || !Array.isArray(board.categories) || !Array.isArray(board.questions)) return { ok: false, problems: ['The board needs id, categories and questions.'], thin: [], board: null };
    const problems = [], seen = new Set();
    board.questions = board.questions.filter(q => {
      const bad = !q || !q.id || seen.has(q.id) || !board.categories.includes(q.category) || !['choice', 'number'].includes(q.type) || !q.prompt || q.displayAnswer == null || !q.explanation ||
        (q.type === 'choice' && (!Array.isArray(q.choices) || !q.choices.includes(q.answer))) || (q.type === 'number' && !Number.isFinite(Number(q.answer)));
      if (bad) { problems.push(q && q.id ? q.id : 'question without id'); return false; }
      seen.add(q.id); q.level = Number(q.level) || 1; if (q.type === 'number') q.answer = Number(q.answer);
      return true;
    });
    board.kind = board.kind || 'skill';
    const thin = board.categories.filter(c => board.questions.filter(q => q.category === c).length < 3);
    return { ok: board.questions.length > 0 && thin.length < board.categories.length - 2, problems, thin, board };
  }

  const api = { MAX_TEAMS, validTeamCount, hash, stream, DEFAULTS, FLAG_KEYS, NUMBER_KEYS, normalizeSettings, packSettings, unpackSettings, boardKey, encodeCode, decodeCode,
    boardCategories, boardRows, makeBoard, assignModifiers, eventDeck, rollEvent, eventRandom, pickFinal, pickTiebreak, pickStandDown, wagerLimits, finalWagerMax,
    parseNumber, grade, mentionsUnit, closest, ranking, validateBoard };
  if (node) module.exports = api;
  else root.JeopardyEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
