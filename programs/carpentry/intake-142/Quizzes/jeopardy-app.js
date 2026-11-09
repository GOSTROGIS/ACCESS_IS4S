/* Build Your Score: page controller. Uses QUIZ_DATA (lecture bank), QuizShared (random and dates), JeopardyEvents (tiles and events),
   JeopardyEngine (seeded boards and grading) and skill boards from boards/<skill>.js (window.JEOPARDY_BOARDS), loaded only when needed. */
(function () {
  'use strict';
  const data = window.QUIZ_DATA, engine = window.JeopardyEngine, EV = window.JeopardyEvents, S = window.QuizShared;
  const $ = id => document.getElementById(id);
  const put = (id, value) => { $(id).textContent = value; };
  const show = (id, visible) => { $(id).hidden = !visible; };
  const fmt = n => Number(n).toLocaleString('en-CA');
  const el = (tag, props, children) => {
    const node = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v; else if (k === 'class') node.className = v; else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children || [])) if (c != null) node.append(c);
    return node;
  };
  const art = name => el('span', { class: 'card-art', html: EV.ART[name] || '' });
  const FINAL = EV.SPECIAL.final.title, CUT = EV.SPECIAL.tiebreak.title;
  const calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  function animate(node, frames, duration) { if (node && node.animate && !calm.matches) node.animate(frames, { duration, easing: 'ease-out' }); }
  const pulse = node => animate(node, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: .35 }, { transform: 'scale(1)' }], 500);
  const flip = node => animate(node, [{ transform: 'perspective(900px) rotateY(88deg)', opacity: .3 }, { transform: 'perspective(900px) rotateY(0)', opacity: 1 }], 400);
  function asInstructor(fn) {
    const gate = window.ACCESSInstructorGate;
    if (!gate) { announce('Instructor tools are not available on this copy of the page.'); return; }
    gate.request(fn);
  }
  function announce(message) { put('status', ''); setTimeout(() => put('status', message), 30); }
  const lectureDate = iso => S.lectureDate(iso, false);

  /* ---------- skill boards, loaded on demand ---------- */
  const SKILLS = [['reading', 'Reading'], ['writing', 'Writing'], ['numeracy', 'Numeracy'], ['digital', 'Digital'], ['problem-solving', 'Problem-solving'],
    ['communication', 'Communication'], ['collaboration', 'Collaboration'], ['adaptability', 'Adaptability'], ['creativity-innovation', 'Creativity and innovation']];
  const skillState = Object.fromEntries(SKILLS.map(([key, title]) => [key, { key, title, file: 'boards/' + key + '.js', status: 'idle', board: null, note: '', loading: null }]));
  window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
  const skillKeyOf = id => { const m = /^SK-(.+)$/i.exec(String(id || '')); return m ? m[1].toLowerCase() : null; };
  function registeredFor(key) { return window.JEOPARDY_BOARDS.find(b => b && (b.skill === key || String(b.id).toUpperCase() === 'SK-' + key.toUpperCase())); }
  function loadSkill(key) {
    const s = skillState[key];
    if (!s) return Promise.resolve(null);
    if (s.loading) return s.loading;
    s.status = 'loading';
    s.loading = new Promise(resolve => {
      const done = () => {
        const raw = registeredFor(key);
        if (!raw) { s.status = 'missing'; s.note = 'The file ' + s.file + ' loaded but did not register a board.'; return resolve(null); }
        const checked = engine.validateBoard(raw);
        s.board = checked.board;
        if (!checked.ok) { s.status = 'invalid'; s.note = 'The board in ' + s.file + ' is incomplete.'; return resolve(null); }
        s.status = 'ready'; s.note = checked.problems.length ? checked.problems.length + ' question(s) skipped because they are incomplete.' : '';
        resolve(s.board);
      };
      if (registeredFor(key)) return done();
      const script = document.createElement('script'); script.src = s.file;
      script.onload = done;
      script.onerror = () => { s.status = 'missing'; s.note = 'This board is not available yet. The file ' + s.file + ' was not found.'; resolve(null); };
      document.head.append(script);
    });
    return s.loading;
  }
  const loadSkills = keys => Promise.all((keys || SKILLS.map(([k]) => k)).map(loadSkill));
  function readySkillBoards() { return SKILLS.map(([k]) => skillState[k]).filter(s => s.status === 'ready').map(s => s.board); }
  function findBoard(id) { return data.lectures.find(l => l.id === id) || readySkillBoards().find(b => b.id === id); }
  const isSkill = b => Boolean(b) && (b.kind === 'skill' || /^SK-/.test(b.id));
  const searchText = new Map(data.lectures.map(l => [l.id, [l.topic, l.id, l.date, 'week ' + l.week, 'day ' + l.day, lectureDate(l.date)].join(' ').toLowerCase()]));

  /* ---------- saved state: preferences in one key, each board's round in its own key ---------- */
  const PREF_KEY = 'carpentry-142-jeopardy-v2', ROUND_KEY = PREF_KEY + ':round:', OLD_KEY = 'carpentry-142-lecture-quiz-v1', LOG_CAP = 200;
  let prefs = { music: true, volume: 18, effects: false, effectsVolume: 25, settings: {}, notTaught: [], showHidden: false };
  let storageOk = true;
  function readStore(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { storageOk = false; return null; } }
  function writeStore(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { if (storageOk) announce('This browser cannot save progress. Keep this tab open to continue your round.'); storageOk = false; }
  }
  (function loadPrefs() {
    const v2 = readStore(PREF_KEY);
    if (v2 && typeof v2 === 'object') {
      if (v2.rounds && typeof v2.rounds === 'object') { for (const [id, r] of Object.entries(v2.rounds)) writeStore(ROUND_KEY + id, r); delete v2.rounds; writeStore(PREF_KEY, v2); }
      prefs = Object.assign(prefs, v2);
    } else {
      const v1 = readStore(OLD_KEY);
      if (v1 && typeof v1 === 'object') {
        prefs.music = v1.music !== false; prefs.volume = Number(v1.volume) || 18; prefs.board = v1.lecture;
        for (const [id, r] of Object.entries(v1.rounds || {})) { const migrated = migrateV1(id, r); if (migrated) writeStore(ROUND_KEY + id, migrated); }
        writeStore(PREF_KEY, prefs);
      }
    }
    prefs.notTaught = Array.isArray(prefs.notTaught) ? prefs.notTaught : [];
  })();
  /* v1 rounds keep their questions and answers. They have no hidden tiles or events. */
  function migrateV1(id, r) {
    const lec = data.lectures.find(l => l.id === id);
    if (!lec || !r || !Array.isArray(r.tiles) || !r.results || ![1, 2, 3, 4].includes(r.teams)) return null;
    const settings = engine.normalizeSettings({ secret: false, pitfalls: false, events: false, final: false });
    const scores = Array(r.teams).fill(0);
    const tiles = r.tiles.map(t => {
      const res = r.results[t.questionId];
      if (res) scores[res.team || 0] += res.awarded || 0;
      return { key: 'c' + t.column + 'r' + t.row, questionId: t.questionId, category: t.category, column: t.column, row: t.row, value: t.value, choices: t.choices, mod: null, origMod: null,
        state: res ? 'done' : 'open', result: res ? { status: res.status, team: res.team || 0, awarded: res.awarded || 0, response: res.response || '' } : null };
    });
    if (!tiles.every(t => lec.questions.some(q => q.id === t.questionId))) return null;
    const played = tiles.filter(t => t.state === 'done').length;
    const seed = /^[A-Z0-9]{1,8}$/i.test(String(r.code || '')) ? String(r.code).toUpperCase() : 'V1';
    const out = newRoundShape({ code: engine.encodeCode(id, r.teams, settings, seed), boardId: id, seed, teams: r.teams, settings, tiles, turn: played % r.teams, turnNumber: played, finished: Boolean(r.finished), phase: r.finished ? 'done' : 'board', migrated: true });
    out.scores = scores;
    if (out.finished) out.winners = leaders(scores);
    return out;
  }
  /* Saves are queued and written once per task, so one turn writes once. */
  let flushQueued = false;
  function persist() { if (flushQueued) return; flushQueued = true; setTimeout(flush, 0); }
  function flush() {
    flushQueued = false; prefs.board = board.id;
    writeStore(PREF_KEY, prefs); writeStore(ROUND_KEY + board.id, round);
  }
  window.addEventListener('pagehide', () => { if (flushQueued) flush(); });

  /* ---------- settings from the instructor panel, and from the address after the instructor code ---------- */
  const params = new URLSearchParams(location.search);
  const PARAM_NAMES = Object.fromEntries(engine.FLAG_KEYS.map(k => [k, [k.toLowerCase()].concat(k === 'secret' ? ['bonuses'] : [])]));
  function urlSettings() {
    const s = {};
    for (const k of engine.FLAG_KEYS) for (const p of PARAM_NAMES[k]) if (params.has(p)) s[k] = !['0', 'false', 'off', 'no'].includes(params.get(p).toLowerCase());
    for (const k of engine.NUMBER_KEYS) if (params.has(k)) s[k] = Number(params.get(k));
    if (params.has('eventsoff')) s.eventsOff = params.get('eventsoff').split(',');
    return s;
  }
  let fromUrl = {};
  function currentSettings() { return engine.normalizeSettings(Object.assign({}, prefs.settings, fromUrl)); }
  if (params.has('sounds')) prefs.effects = !['0', 'false', 'off'].includes(params.get('sounds'));
  if (params.has('teams')) { const t = Number(params.get('teams')); if ([1, 2, 3, 4].includes(t)) $('team-count').value = String(t); }

  /* ---------- round state ---------- */
  let board = data.lectures.find(l => l.id === params.get('lecture')) || data.lectures.find(l => l.id === prefs.board) || data.lectures[0];
  let round = null, play = null, timer = null, undo = [], customMusicURL = null, focusKey = null, lastOpenedKey = null, pendingSeed = S.freshCode();
  const music = $('background-music');
  function newRoundShape(r) {
    return Object.assign({ v: 2, scores: Array(r.teams).fill(0), turn: 0, turnNumber: 0, skipNext: Array(r.teams).fill(false), tokens: Array.from({ length: r.teams }, () => ({ hint: 0, fifty: 0, retry: 0 })),
      effects: { inspector: false, rush: false }, locks: {}, events: [], lastEventTurn: -9, log: [], logCount: 0, phase: 'board', final: null, tiebreaks: [], winners: [], finished: false }, r);
  }
  function question(id) { return board.questions.find(q => q.id === id); }
  function teamName(i) { return round && round.teams > 1 ? 'Team ' + String.fromCharCode(65 + i) : 'You'; }
  function openTiles() { return round ? round.tiles.filter(t => t.state === 'open') : []; }
  function tileByKey(key) { return round && round.tiles.find(t => t.key === key); }
  function isLocked(t) { return Boolean(round) && round.locks[t.key] > round.turnNumber; }
  function leaders(scores) { return engine.ranking(scores).filter(r => r.rank === 1).map(r => r.team); }
  function trailers(scores) { const r = engine.ranking(scores), last = r[r.length - 1].rank; return r.filter(x => x.rank === last).map(x => x.team); }
  function log(entry) {
    round.logCount = (round.logCount || round.log.length) + 1;
    round.log.push(Object.assign({ n: round.logCount, turn: round.turnNumber }, entry));
    if (round.log.length > LOG_CAP) round.log.splice(0, round.log.length - LOG_CAP);
  }
  function addScore(team, delta, why) { if (!delta) return; round.scores[team] += delta; log({ kind: 'score', team, delta, note: why }); bumpScore(team); }
  /* Undo snapshots leave the log out and keep only its length. */
  function pushUndo() { const log0 = round.log; round.log = []; undo.push({ snap: JSON.stringify(round), logLength: log0.length }); round.log = log0; if (undo.length > 30) undo.shift(); }
  function popUndo() { const u = undo.pop(), log0 = round.log; round = JSON.parse(u.snap); round.log = log0.slice(0, u.logLength); }

  /* One description of a finished tile, used by the board, the review and screen-reader labels. */
  function statusOf(r) {
    if (!r) return { cls: 'practice', label: 'Practice', aria: 'not played', review: 'Not played' };
    if (r.status === 'correct') return { cls: 'correct', label: 'Correct', aria: 'correct', review: 'Correct' };
    if (r.steal && r.steal.awarded) return { cls: 'correct', label: 'Stolen', aria: 'stolen by ' + teamName(r.steal.team), review: 'Stolen by ' + teamName(r.steal.team) };
    if (r.status === 'incorrect' || r.status === 'timeout') return { cls: 'incorrect', label: 'Review', aria: 'review answer', review: 'Review' };
    if (r.status === 'void') return { cls: 'practice', label: 'Not yet taught', aria: 'not yet taught', review: 'Not yet taught' };
    return { cls: 'practice', label: 'Practice', aria: 'skipped or revealed', review: 'Practice or skipped' };
  }
  /* Picture for a question: a bank asset or a file path given by a skill board. */
  function figureFor(q) {
    const asset = q.image && data.assets && data.assets[q.image];
    if (asset) return { src: 'assets/' + q.image + '.png', alt: asset.alt, caption: asset.source + ' · ' + (q.image.startsWith('hub-') ? 'Use the values stated in the question.' : 'Read the dimension labels. The drawing is not a ruler.') };
    if (q.image && /\.(png|jpe?g|svg|webp|gif)$/i.test(q.image)) return { src: q.image, alt: q.imageAlt || q.alt || 'Diagram for this question.', caption: q.imageCredit || '' };
    return null;
  }
  function figureNode(q) {
    const f = figureFor(q); if (!f) return null;
    const cap = el('figcaption', { text: f.caption });
    const img = el('img', { src: f.src, alt: f.alt, onerror: () => { img.hidden = true; cap.textContent = 'Diagram unavailable. ' + f.alt; } });
    return el('figure', { class: 'figure' }, [img, cap]);
  }
  /* A masked input for wagers and answers that other teams should not see. */
  function hiddenAnswerForm(id, label, help, submitText, onSubmit) {
    const err = el('p', { class: 'input-error', id: id + '-error', role: 'alert' });
    const input = el('input', { class: 'card-input', id, type: 'password', autocomplete: 'off', 'data-autofocus': true, 'aria-describedby': (help ? id + '-help ' : '') + id + '-error' });
    const form = el('form', { novalidate: true }, [el('label', { for: id, text: label }), help ? el('p', { id: id + '-help', text: help }) : null, input, err, el('button', { class: 'button', type: 'submit', text: submitText })]);
    form.addEventListener('submit', e => { e.preventDefault(); err.textContent = ''; onSubmit(input.value, msg => { err.textContent = msg; input.setAttribute('aria-invalid', 'true'); input.focus(); }); });
    return { form, input };
  }
  function choiceFieldset(name, choices, legend, autofocus) {
    const fs = el('fieldset', {}, [el('legend', { text: legend })]);
    choices.forEach((c, j) => fs.append(el('label', { for: name + '-' + j }, [el('input', { type: 'radio', name, id: name + '-' + j, value: c, 'data-autofocus': Boolean(autofocus) && j === 0 }), c])));
    return fs;
  }
  const checkedValue = (scope, name) => { const p = scope.querySelector('input[name="' + name + '"]:checked'); return p ? p.value : null; };

  /* ---------- sound effects (Web Audio, no files, off by default) ---------- */
  let audio = null;
  function sfx(name) {
    if (!prefs.effects) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const vol = Math.min(50, Math.max(0, Number(prefs.effectsVolume) || 0)) / 100;
      const notes = { right: [[660, .09], [880, .16]], wrong: [[150, .28, 'square']], bonus: [[523, .1], [659, .1], [784, .1], [1047, .25]], hazard: [[90, .35, 'triangle']], event: [[330, .18, 'sawtooth'], [330, .25, 'sawtooth']], tick: [[1000, .05]], win: [[523, .12], [659, .12], [784, .12], [1047, .4]] }[name] || [];
      let at = audio.currentTime;
      for (const [freq, dur, type] of notes) {
        const osc = audio.createOscillator(), gain = audio.createGain(); osc.type = type || 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol * .5, at); gain.gain.exponentialRampToValueAtTime(.0001, at + dur);
        osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + dur + .02); at += dur * .9;
      }
    } catch (_) { /* audio blocked. Sound never carries information on its own. */ }
  }
  function updateEffects() {
    $('effects-toggle').setAttribute('aria-pressed', String(Boolean(prefs.effects))); put('effects-toggle', prefs.effects ? 'Effects: on' : 'Effects: off');
    $('effects-volume').value = prefs.effectsVolume;
  }

  /* ---------- lecture or skill panel ---------- */
  function updateBoardPanel() {
    const skill = isSkill(board);
    if (skill) {
      put('lecture-meta', 'SKILL BOARD · IS4S SKILLS FOR SUCCESS');
      put('lecture-title', board.title || board.id);
      put('lecture-reference', 'Questions from the ' + (board.title || '') + ' lessons' + (board.source ? ' (' + board.source + ')' : '') + '.');
    } else {
      put('lecture-meta', 'DAY ' + String(board.day).padStart(2, '0') + ' · ' + lectureDate(board.date) + ' · ' + board.start + '–' + board.end);
      put('lecture-title', board.topic);
      put('lecture-reference', board.reading.replace(/^Textbook/, 'The textbook'));
      $('pdf-link').href = 'PDF/' + board.id + '.pdf'; $('generator-link').href = 'generator.html?lecture=' + board.id;
      $('pdf-link').setAttribute('aria-label', 'Open fillable PDF for ' + board.topic);
    }
    show('pdf-link', !skill); show('generator-link', !skill);
    const s = currentSettings(), rows = engine.boardRows(board, s), cols = engine.boardCategories(board, pendingSeed, s).length;
    put('ready-note', (board.pick === 'one-per-skill' ? new Set(board.questions.map(q => q.skill)).size + ' core skills' : rows * cols + ' questions') + ' · a fresh board each round');
    try { const url = new URL(location.href); url.searchParams.delete(skill ? 'lecture' : 'board'); url.searchParams.set(skill ? 'board' : 'lecture', board.id); url.searchParams.delete('round'); history.replaceState(null, '', url); } catch (_) {}
    buildBoard();
  }
  function loadRound() {
    round = null; undo = []; play = null;
    const c = readStore(ROUND_KEY + board.id);
    if (c && c.v === 2 && Array.isArray(c.tiles) && Array.isArray(c.scores) && [1, 2, 3, 4].includes(c.teams) && c.tiles.every(t => question(t.questionId))) { round = c; round.settings = engine.normalizeSettings(round.settings); round.log = round.log || []; }
    if (round) $('team-count').value = String(round.teams);
  }

  /* ---------- board: built once per round, then patched tile by tile ---------- */
  function buildBoard() {
    const host = $('board'); host.replaceChildren();
    const settings = round ? round.settings : currentSettings();
    const rows = round ? Math.max(...round.tiles.map(t => t.row)) + 1 : engine.boardRows(board, settings);
    const categories = round ? [...new Set(round.tiles.slice().sort((a, b) => a.column - b.column || a.row - b.row).map(t => t.category))] : engine.boardCategories(board, pendingSeed, settings);
    host.style.setProperty('--cols', String(categories.length));
    host.className = 'board cols-' + categories.length;
    categories.forEach((category, column) => {
      const group = el('section', { class: 'column', 'aria-label': category }, [el('h3', { class: 'category', text: category })]);
      for (let row = 0; row < rows; row++) {
        const t = round && round.tiles.find(x => x.column === column && x.row === row);
        const b = el('button', { class: 'tile', type: 'button', tabindex: '-1' });
        if (t) b.dataset.key = t.key;
        else { b.textContent = round ? '—' : String((row + 1) * 100); b.disabled = true; b.setAttribute('aria-label', round ? category + ', no question in this row.' : category + ', ' + ((row + 1) * 100) + ' points. Start quiz to play.'); }
        group.append(b);
      }
      host.append(group);
    });
    refreshBoard();
    const tiles = [...host.querySelectorAll('.tile')];
    const target = tiles.find(b => b.dataset.key && b.dataset.key === focusKey) || tiles.find(b => b.dataset.key && !b.classList.contains('done') && b.getAttribute('aria-disabled') !== 'true') || tiles.find(b => !b.disabled) || tiles[0];
    if (target) target.tabIndex = 0;
  }
  function paintTile(b, t) {
    const reveal = round.finished && prefs.showHidden;
    b.className = 'tile'; b.removeAttribute('aria-disabled'); b.replaceChildren();
    if (t.state === 'done') {
      const r = t.result || {}, st = statusOf(r), stolen = r.steal && r.steal.awarded;
      b.classList.add('done', st.cls);
      b.append(r.status === 'correct' ? (r.awarded >= 0 ? '+' : '') + fmt(r.awarded) : stolen ? '+' + fmt(r.steal.awarded) : r.awarded < 0 ? fmt(r.awarded) : '—', el('span', { class: 'tile-status', text: st.label }));
      b.setAttribute('aria-label', t.category + ', ' + t.value + ' points, ' + st.aria + '. Open to review.');
    } else if (isLocked(t)) {
      b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); b.append(String(t.value), el('span', { class: 'tile-status', text: 'Locked' }));
      b.setAttribute('aria-label', t.category + ', ' + t.value + ' points, locked by a material shortage for ' + (round.locks[t.key] - round.turnNumber) + ' more turn(s).');
    } else {
      b.append(String(t.value));
      if (t.reworked) { b.classList.add('reworked'); b.append(el('span', { class: 'tile-status', text: 'Rework' })); }
      b.setAttribute('aria-label', t.category + ', ' + t.value + ' points' + (t.reworked ? ', back on the board for rework' : '') + (round.phase !== 'board' ? '. The board is closed.' : ''));
      if (round.phase !== 'board') b.setAttribute('aria-disabled', 'true');
    }
    if (reveal && t.origMod) b.prepend(el('span', { class: 'tile-mod', text: EV.TILES[t.origMod].title }));
  }
  function refreshBoard() {
    if (round) for (const b of $('board').querySelectorAll('.tile[data-key]')) { const t = tileByKey(b.dataset.key); if (t) paintTile(b, t); }
    renderScores(); renderStatusLine();
  }
  $('board').addEventListener('click', e => { const b = e.target.closest('.tile[data-key]'); const t = b && tileByKey(b.dataset.key); if (t) onTile(t); });
  $('board').addEventListener('keydown', e => {
    const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Home: 'home', End: 'end' };
    if (!(e.key in keys)) return;
    const cols = [...$('board').querySelectorAll('.column')].map(c => [...c.querySelectorAll('.tile')]);
    let ci = cols.findIndex(c => c.includes(document.activeElement)); if (ci < 0) return;
    let ri = cols[ci].indexOf(document.activeElement);
    if (keys[e.key] === 'home') { ci = 0; ri = 0; } else if (keys[e.key] === 'end') { ci = cols.length - 1; ri = cols[ci].length - 1; }
    else { const [dx, dy] = keys[e.key]; ci = Math.max(0, Math.min(cols.length - 1, ci + dx)); ri = Math.max(0, Math.min(cols[ci].length - 1, ri + dy)); }
    e.preventDefault(); focusButton(cols[ci][ri]);
  });
  $('board').addEventListener('focusin', e => { if (e.target.classList.contains('tile')) { for (const b of $('board').querySelectorAll('.tile')) b.tabIndex = b === e.target ? 0 : -1; focusKey = e.target.dataset.key || null; } });
  function focusButton(b) { if (!b) return; for (const x of $('board').querySelectorAll('.tile')) x.tabIndex = -1; b.tabIndex = 0; b.focus(); focusKey = b.dataset.key || null; }
  function focusTile(key) { const all = [...$('board').querySelectorAll('.tile')]; focusButton(all.find(x => x.dataset.key === key) || all.find(x => x.tabIndex === 0)); }
  function renderScores() {
    const host = $('scores'); host.replaceChildren();
    if (!round) return;
    const lead = round.teams > 1 && Math.max(...round.scores) > 0 ? leaders(round.scores) : [];
    round.scores.forEach((score, i) => {
      const active = round.phase === 'board' && !round.finished && round.turn === i;
      const card = el('div', { class: 'score-card' + (active ? ' active' : '') }, [
        el('p', { class: 'score-label', text: teamName(i) + (active ? ' · your turn' : '') + (lead.includes(i) ? ' · leading' : '') }),
        el('p', { class: 'score-number', id: 'score-' + i, text: fmt(score) })]);
      const tk = round.tokens[i], chips = [];
      if (tk.hint) chips.push(el('span', { class: 'chip', text: 'Hint × ' + tk.hint }));
      if (tk.fifty) chips.push(el('span', { class: 'chip', text: '50/50 × ' + tk.fifty }));
      if (tk.retry) chips.push(el('span', { class: 'chip', text: 'Measure Twice × ' + tk.retry }));
      if (round.skipNext[i]) chips.push(el('span', { class: 'chip warn', text: 'Loses next turn' }));
      if (chips.length) card.append(el('div', { class: 'score-extra' }, chips));
      host.append(card);
    });
  }
  function bumpScore(team) { requestAnimationFrame(() => pulse($('score-' + team))); }
  function renderStatusLine() {
    if (!round) {
      put('progress', 'Choose Start quiz to unlock the board.'); put('round-code', ''); put('start-game', 'Start quiz'); put('event-ticker', '');
      put('round-message', 'Correct answers earn points. Watch for hidden tiles.'); $('review-round').disabled = true; $('team-count').disabled = false; show('continue-final', false); return;
    }
    const done = round.tiles.filter(t => t.state === 'done').length, phaseTitle = round.phase === 'final' ? FINAL : CUT;
    put('progress', done + ' of ' + round.tiles.length + ' tiles played' + (round.finished ? ' · round complete' : round.phase === 'board' ? '' : ' · ' + phaseTitle));
    put('round-code', 'Round ' + round.code);
    const e = round.events[round.events.length - 1];
    $('event-ticker').replaceChildren(); if (e) $('event-ticker').append('Last site event: ', el('strong', { text: EV.EVENTS.find(x => x.id === e.id).title }), ' · ' + e.summary);
    put('round-message', round.finished ? 'Review the methods, then try a fresh round.' : round.phase !== 'board' ? 'The board is closed. Finish the ' + phaseTitle + '.' : round.teams > 1 ? teamName(round.turn) + ': choose your next tile.' : 'Choose any tile. Work it out before checking.');
    put('start-game', 'New round');
    $('review-round').disabled = false; put('review-round', round.finished ? 'Review results' : 'Finish and review');
    $('team-count').disabled = !round.finished;
    show('continue-final', !round.finished && round.phase !== 'board');
    put('continue-final', 'Go to ' + phaseTitle);
  }

  /* ---------- start a round ---------- */
  function startRound(codeText) {
    let teams = Math.min(4, Math.max(1, Number($('team-count').value) || 1)), settings = currentSettings(), seed = pendingSeed;
    if (codeText) {
      try {
        const c = engine.decodeCode(codeText);
        if (c.key === engine.boardKey(board.id)) { teams = c.teams; settings = c.settings; seed = c.seed; $('team-count').value = String(teams); }
        else announce('That round code is for a different board. A fresh round was started.');
      } catch (_) { if (/^[a-z0-9]{1,8}$/i.test(codeText)) seed = codeText.toUpperCase(); }
    }
    pendingSeed = S.freshCode();
    const tiles = engine.makeBoard(board, seed, settings, { exclude: new Set(prefs.notTaught) });
    const mods = engine.assignModifiers(tiles, seed, settings, teams);
    tiles.forEach(t => { t.mod = mods[t.key] || null; t.origMod = t.mod; });
    round = newRoundShape({ code: engine.encodeCode(board.id, teams, settings, seed), boardId: board.id, seed, teams, settings, tiles });
    undo = []; focusKey = null; play = null;
    persist(); buildBoard(); playMusic();
    announce('New round ' + round.code + ' is ready. ' + (teams > 1 ? 'Team A starts.' : 'Choose any point tile.'));
    const first = $('board').querySelector('.tile[tabindex="0"]'); if (first) first.focus();
  }

  /* ---------- opening a tile ---------- */
  function onTile(t) {
    if (!round) return;
    lastOpenedKey = t.key;
    if (t.state === 'done') return openQuestion(t, { review: true });
    if (round.phase !== 'board') { announce('The board is closed. ' + (round.finished ? 'Start a new round to play again.' : 'Continue the ' + (round.phase === 'final' ? FINAL : CUT) + '.')); return; }
    if (isLocked(t)) { announce('That tile is locked by a material shortage for ' + (round.locks[t.key] - round.turnNumber) + ' more turn(s). Choose another tile.'); return; }
    play = { key: t.key, team: round.turn, mult: t.mod === 'double' ? 2 : 1, wager: null, inspector: round.effects.inspector, rush: round.effects.rush, phase: 'answer', stealQueue: [], stealValue: 0, tried: [], removed: [], hint: false };
    if (t.mod) return revealTile(t);
    openQuestion(t);
  }
  function tileValue(t) { return play && play.wager != null ? play.wager : Math.round(t.value * (play ? play.mult : 1) * (play && play.rush ? 1.5 : 1)); }
  function openCard(kind, build) {
    const dlg = $('card-dialog'), body = $('card-body');
    dlg.className = kind || ''; body.replaceChildren();
    build(body);
    if (!dlg.open) dlg.showModal();
    flip(body);
    const h = body.querySelector('h2'); if (h) { h.id = 'card-heading'; h.tabIndex = -1; }
    const auto = body.querySelector('[data-autofocus]');
    (auto || h || body).focus();
  }
  function closeCard() { const d = $('card-dialog'); if (d.open) d.close(); }
  $('card-dialog').addEventListener('cancel', e => { e.preventDefault(); });
  function revealTile(t) {
    const def = EV.TILES[t.mod], team = play.team, value = Math.round(t.value * play.mult);
    sfx(def.kind === 'bonus' ? 'bonus' : 'hazard');
    let line = def.text;
    if (t.mod === 'hazard') line += ' This tile is worth ' + value + '. A wrong answer costs ' + value + ' points.';
    if (t.mod === 'double') line += ' This tile now pays ' + value + '.';
    announce(def.title + '. ' + teamName(team) + (t.mod === 'foreman' ? ', enter a wager.' : '. ' + line));
    openCard(def.kind === 'pitfall' ? 'pitfall' : 'bonus', body => {
      body.append(art(def.art), el('p', { class: 'card-kicker', text: def.kind === 'bonus' ? 'Secret bonus tile' : 'Pitfall tile' }), el('h2', { text: def.title }), el('p', { class: 'card-effect', text: line }));
      if (t.mod === 'foreman') {
        const top = Math.max(...round.tiles.map(x => x.value)), lim = engine.wagerLimits(round.scores[team], top);
        const input = el('input', { class: 'card-input', id: 'wager-input', type: 'number', inputmode: 'numeric', min: lim.min, max: lim.max, step: '5', 'data-autofocus': true, 'aria-describedby': 'wager-help wager-error' });
        const err = el('p', { class: 'input-error', id: 'wager-error', role: 'alert' });
        const form = el('form', { novalidate: true }, [el('label', { for: 'wager-input', text: teamName(team) + ': your wager' }), el('p', { id: 'wager-help', text: 'Enter a whole number from ' + lim.min + ' to ' + fmt(lim.max) + '.' }), input, err, el('button', { class: 'button', type: 'submit', text: 'Lock in the wager' })]);
        form.addEventListener('submit', e => {
          e.preventDefault(); const w = Number(input.value);
          if (!Number.isInteger(w) || w < lim.min || w > lim.max) { err.textContent = 'Enter a whole number from ' + lim.min + ' to ' + fmt(lim.max) + '.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
          play.wager = w; log({ kind: 'wager', team, delta: 0, note: "Foreman's Call wager " + w }); closeCard(); openQuestion(t);
        });
        body.append(form);
      } else body.append(el('div', { class: 'card-actions' }, [el('button', { class: 'button', type: 'button', id: 'reveal-continue', text: 'Show the question', onclick: () => { closeCard(); openQuestion(t); } })]));
    });
  }

  /* ---------- question dialog ---------- */
  function banner(kind, artName, title, text) { return el('div', { class: 'q-banner ' + kind }, [el('span', { html: EV.ART[artName] || '' }), el('span', {}, [el('strong', { text: title }), text])]); }
  function openQuestion(t, opts) {
    const review = Boolean(opts && opts.review), q = question(t.questionId);
    lastOpenedKey = t.key; playMusic();
    if (!review && !play) return;
    const value = review ? t.value : tileValue(t);
    put('question-heading', t.category + ' · ' + value + ' points');
    put('question-turn', review ? 'Review this question' : teamName(play.team) + (round.teams > 1 ? ' is playing' : ' · work at your own pace'));
    put('question-kicker', q.skill || (isSkill(board) ? (q.lesson ? 'Lesson ' + q.lesson : board.title) : board.topic));
    put('question-prompt', q.prompt); put('answer-error', ''); $('answer-input').value = ''; $('answer-input').disabled = false; $('answer-input').removeAttribute('aria-invalid');
    const ban = $('q-banners'); ban.replaceChildren();
    if (!review) {
      if (t.mod) { const def = EV.TILES[t.mod]; ban.append(banner(def.kind, def.art, def.title, t.mod === 'foreman' ? 'Wager: ' + fmt(play.wager) + ' points. Right adds it, wrong takes it away.' : t.mod === 'hazard' ? 'A wrong answer costs ' + value + ' points.' : def.text)); }
      if (play.rush) ban.append(banner('event', 'clock', 'Rush Job', 'This question pays × 1.5' + (round.settings.timer ? ' and has half the time.' : '.')));
      if (play.inspector) ban.append(banner('event', 'inspector', 'Inspector Visit', q.type === 'number' && q.unit ? 'Write the unit (' + q.unit + ') with your answer. Pass: +100. Fail: −100.' : 'Answer right to pass inspection (+100). A wrong answer costs 100.'));
      if (round.settings.penalties && !['foreman', 'hazard'].includes(t.mod)) ban.append(banner('pitfall', 'hazard', 'Penalties are on', 'A wrong answer costs ' + value + ' points.'));
    }
    const fig = figureFor(q);
    show('question-figure', Boolean(fig));
    if (fig) {
      $('question-image').hidden = false; $('question-image').alt = fig.alt; put('image-source', fig.caption);
      $('question-image').onerror = () => { $('question-image').hidden = true; put('image-source', 'Diagram unavailable. ' + fig.alt); };
      $('question-image').src = fig.src;
    }
    show('choices', q.type === 'choice'); show('numeric-answer', q.type === 'number');
    $('choice-list').replaceChildren();
    if (q.type === 'choice') {
      (t.choices || q.choices).forEach((choice, i) => {
        const label = el('label', { class: 'choice', for: 'choice-' + i }, [el('input', { type: 'radio', name: 'choice', value: choice, id: 'choice-' + i, onchange: () => put('answer-error', '') }), el('span', { class: 'choice-letter', text: String.fromCharCode(65 + i) }), el('span', { text: choice })]);
        label.dataset.value = choice;
        $('choice-list').append(label);
      });
    } else put('answer-label', 'Your answer' + (q.unit ? ' · ' + q.unit : ''));
    show('feedback', false); show('after-answer', false); show('retry-box', false); show('hint-box', false); show('answer-actions', !review);
    if (!review) { updateTokenRow(q); applyStrikes(); } else show('token-row', false);
    put('skip-question', round.teams > 1 && round.settings.steals ? 'Pass to the next team' : 'Skip');
    $('question-dialog').showModal(); $('question-dialog').scrollTop = 0;
    if (review) { show('timer-row', false); showFeedback(q, t.result || { status: 'skipped' }, t); return; }
    startTimer(play.rush ? Math.ceil(round.settings.timer / 2) : round.settings.timer);
    focusAnswer(q);
  }
  function focusAnswer(q) { if (q.type === 'number') $('answer-input').focus(); else { const f = $('choice-list').querySelector('input:not(:disabled)'); if (f) f.focus(); } }
  function answeringTeam() { return play.phase === 'steal' ? play.stealTeam : play.team; }
  function updateTokenRow(q) {
    const tk = play && round.tokens[answeringTeam()];
    const canHint = Boolean(tk && tk.hint > 0 && !play.hint), canFifty = Boolean(tk && tk.fifty > 0 && q.type === 'choice' && !play.removed.length);
    show('token-row', Boolean(play && play.phase !== 'done' && (canHint || canFifty)));
    show('use-hint', canHint); show('use-fifty', canFifty);
  }
  function applyStrikes() {
    for (const l of $('choice-list').querySelectorAll('label.choice')) {
      const gone = play.removed.includes(l.dataset.value) || play.tried.includes(l.dataset.value);
      l.classList.toggle('struck', gone); l.querySelector('input').disabled = gone;
    }
  }
  $('use-hint').addEventListener('click', () => {
    const q = question(currentTile().questionId), who = answeringTeam();
    round.tokens[who].hint--; play.hint = true;
    put('hint-box', 'Hint: ' + String(q.explanation).split(/(?<=\.)\s/)[0]); show('hint-box', true);
    log({ kind: 'token', team: who, note: 'Hint used' }); persist(); renderScores(); updateTokenRow(q); announce('Hint shown.');
  });
  $('use-fifty').addEventListener('click', () => {
    const t = currentTile(), q = question(t.questionId), who = answeringTeam();
    play.removed = S.shuffle((t.choices || q.choices).filter(c => c !== q.answer && !play.tried.includes(c)), engine.stream(round.seed, 'fifty:' + t.key)).slice(0, 2);
    round.tokens[who].fifty--; applyStrikes();
    log({ kind: 'token', team: who, note: '50/50 used' }); persist(); renderScores(); updateTokenRow(q); announce('Two wrong choices removed.');
    focusAnswer(q);
  });

  /* ---------- timer: off by default, with pause and extend for WCAG 2.2.1 ---------- */
  function startTimer(seconds, onEnd, displayId) {
    stopTimer(); const id = displayId || 'timer';
    if (!displayId) show('timer-row', Boolean(seconds));
    if (!seconds) return;
    timer = { left: seconds, paused: false, id, onEnd: onEnd || timeUp, handle: setInterval(tick, 1000) };
    for (const b of document.querySelectorAll('[data-timer=pause],#timer-pause')) b.textContent = 'Pause timer';
    paintTimer();
  }
  function tick() {
    if (!timer || timer.paused) return;
    timer.left--; paintTimer();
    if (timer.left <= 5 && timer.left > 0) sfx('tick');
    if (timer.left === 10) announce('10 seconds left.');
    if (timer.left <= 0) { const end = timer.onEnd; stopTimer(); end(); }
  }
  function paintTimer() { const n = $(timer.id); if (!n) return; n.textContent = (timer.paused ? 'Paused · ' : '') + timer.left + ' s left'; n.classList.toggle('low', timer.left <= 10); }
  function stopTimer() { if (timer) clearInterval(timer.handle); timer = null; }
  function pauseTimer() { if (!timer) return; timer.paused = !timer.paused; paintTimer(); for (const b of document.querySelectorAll('[data-timer=pause],#timer-pause')) b.textContent = timer.paused ? 'Resume timer' : 'Pause timer'; announce(timer.paused ? 'Timer paused.' : 'Timer running.'); }
  function extendTimer() { if (!timer) return; timer.left += 30; paintTimer(); announce('30 seconds added.'); }
  $('timer-pause').addEventListener('click', pauseTimer); $('timer-extend').addEventListener('click', extendTimer);
  function timeUp() {
    if (!play || play.phase === 'done') return;
    announce('Time is up.'); sfx('wrong');
    if (play.phase === 'steal') stealAnswer(false, 'Time ran out');
    else resolve('timeout', 'Time ran out');
  }

  /* ---------- answering ---------- */
  function currentTile() { return play && tileByKey(play.key); }
  $('answer-form').addEventListener('submit', e => {
    e.preventDefault(); if (!play || play.phase === 'done') return;
    const q = question(currentTile().questionId);
    const input = q.type === 'choice' ? checkedValue($('choice-list'), 'choice') : $('answer-input').value;
    const result = engine.grade(q, input);
    if (result.error) { put('answer-error', result.error); if (q.type === 'number') { $('answer-input').setAttribute('aria-invalid', 'true'); $('answer-input').focus(); } return; }
    $('answer-input').removeAttribute('aria-invalid');
    if (play.phase === 'steal') { stealAnswer(result.correct, input); return; }
    if (!result.correct && q.type === 'number' && round.tokens[play.team].retry > 0 && !play.retryOffered) {
      play.retryOffered = true; play.pendingInput = input;
      put('retry-text', 'Not quite. ' + teamName(play.team) + ' has a Measure Twice token. Use it for one more try?');
      show('retry-box', true); show('answer-actions', false); $('retry-use').focus(); return;
    }
    resolve(result.correct ? 'correct' : 'incorrect', input);
  });
  $('retry-use').addEventListener('click', () => {
    round.tokens[play.team].retry--; log({ kind: 'token', team: play.team, note: 'Measure Twice used' }); persist(); renderScores();
    show('retry-box', false); show('answer-actions', true); $('answer-input').value = ''; announce('Measure Twice used. Try once more.'); $('answer-input').focus();
  });
  $('retry-decline').addEventListener('click', () => { show('retry-box', false); resolve('incorrect', play.pendingInput); });
  $('show-solution').addEventListener('click', () => { if (!play) return; if (play.phase === 'steal') { play.stealQueue = []; finishSteal(); } else resolve('solution', 'Solution requested'); });
  $('skip-question').addEventListener('click', () => {
    if (!play) return;
    if (play.phase === 'steal') { stealAnswer(false, 'Passed', true); return; }
    resolve('skipped', round.teams > 1 && round.settings.steals ? 'Passed to the next team' : 'Skipped');
  });
  $('void-question').addEventListener('click', () => asInstructor(() => {
    const t = currentTile(); if (!t) return;
    pushUndo(); stopTimer();
    t.state = 'done'; t.result = { status: 'void', team: play.team, awarded: 0, response: 'Marked not yet taught by the instructor' };
    if (!prefs.notTaught.includes(t.questionId)) prefs.notTaught.push(t.questionId);
    log({ kind: 'void', team: play.team, key: t.key, note: 'Not yet taught: ' + t.questionId });
    play = null; persist(); $('question-dialog').close(); refreshBoard();
    announce('Marked not yet taught. The turn stays with ' + teamName(round.turn) + '. Later rounds skip this question.');
    afterBoardChange();
  }));

  function resolve(status, response) {
    const t = currentTile(); if (!t || play.phase === 'done') return;
    const q = question(t.questionId), team = play.team;
    pushUndo(); stopTimer();
    const value = tileValue(t), right = status === 'correct', wrong = status === 'incorrect' || status === 'timeout';
    let delta = 0;
    if (right) delta = value;
    else if (t.mod === 'foreman' && play.wager != null) delta = -play.wager;
    else if (wrong && (t.mod === 'hazard' || round.settings.penalties)) delta = -value;
    const notes = [];
    addScore(team, delta, right ? 'Correct' : t.mod === 'foreman' ? "Foreman's Call wager lost" : 'Penalty');
    if (play.inspector) {
      const pass = right && engine.mentionsUnit(response, q.type === 'number' ? q.unit : '');
      addScore(team, pass ? 100 : -100, pass ? 'Passed inspection' : 'Failed inspection');
      notes.push(pass ? 'Passed inspection: +100.' : right ? 'Right number, but no unit. Failed inspection: −100.' : 'Failed inspection: −100.');
      round.effects.inspector = false;
    }
    if (play.rush) round.effects.rush = false;
    if (right && t.mod === 'crib') {
      const kinds = ['hint', 'fifty', 'retry'], kind = kinds[Math.floor(engine.stream(round.seed, 'crib:' + t.key)() * 3)];
      round.tokens[team][kind]++; notes.push('Tool Crib: ' + teamName(team) + ' wins a ' + EV.TOKENS[kind].title + ' token.');
    }
    if (wrong && t.mod === 'bentnail' && round.teams > 1) { round.skipNext[team] = true; notes.push('Bent Nail: ' + teamName(team) + ' loses its next turn.'); }
    log({ kind: 'answer', team, key: t.key, status, delta, mod: t.mod });
    sfx(right ? 'right' : 'wrong');
    if (wrong && t.mod === 'rework') {
      t.mod = null; t.reworked = true; play.phase = 'done';
      notes.push('Rework: this tile goes back on the board at ' + t.value + ' points.');
      showFeedback(q, { status, team, awarded: delta, response }, t, notes, true);
      persist(); refreshBoard(); return;
    }
    t.result = { status, team, awarded: delta, response: String(response || '') };
    if (round.teams > 1 && round.settings.steals && ((wrong && t.mod === 'openbid') || status === 'skipped')) { beginSteal(t, q, notes); return; }
    t.state = 'done'; play.phase = 'done';
    showFeedback(q, t.result, t, notes);
    persist(); refreshBoard();
  }
  function beginSteal(t, q, notes) {
    play.phase = 'steal'; play.stealValue = Math.round(t.value * play.mult / 2);
    for (let i = 1; i < round.teams; i++) play.stealQueue.push((play.team + i) % round.teams);
    if (q.type === 'choice' && q.choices.includes(t.result.response)) play.tried.push(t.result.response);
    play.stealNotes = notes;
    nextStealer();
  }
  function nextStealer() {
    if (!play.stealQueue.length) return finishSteal();
    const q = question(currentTile().questionId);
    play.stealTeam = play.stealQueue.shift();
    persist(); refreshBoard();
    $('q-banners').replaceChildren(banner('pitfall', 'gavel', 'Open Bid', teamName(play.stealTeam) + ' may steal for ' + play.stealValue + ' points. A wrong steal costs nothing.'));
    put('question-turn', teamName(play.stealTeam) + ' is stealing');
    put('skip-question', 'Pass'); show('answer-actions', true); show('feedback', false); show('after-answer', false);
    $('answer-input').value = ''; $('answer-input').disabled = false; put('answer-error', '');
    for (const i of $('choice-list').querySelectorAll('input')) i.checked = false;
    applyStrikes(); updateTokenRow(q);
    announce('Open Bid. ' + teamName(play.stealTeam) + ' may steal for ' + play.stealValue + ' points.');
    startTimer(round.settings.timer);
    focusAnswer(q);
  }
  function stealAnswer(correct, input, passed) {
    const t = currentTile(), q = question(t.questionId); stopTimer(); pushUndo();
    if (correct) {
      addScore(play.stealTeam, play.stealValue, 'Steal');
      t.result.steal = { team: play.stealTeam, awarded: play.stealValue };
      log({ kind: 'steal', team: play.stealTeam, key: t.key, delta: play.stealValue });
      sfx('right'); play.stealQueue = []; return finishSteal(teamName(play.stealTeam) + ' steals ' + play.stealValue + ' points.');
    }
    if (q.type === 'choice' && input && q.choices.includes(input)) play.tried.push(input);
    log({ kind: 'steal', team: play.stealTeam, key: t.key, delta: 0, note: passed ? 'passed' : 'wrong' });
    if (!passed) sfx('wrong');
    announce(teamName(play.stealTeam) + (passed ? ' passes.' : ' did not steal it.'));
    nextStealer();
  }
  function finishSteal(note) {
    const t = currentTile();
    t.state = 'done'; play.phase = 'done';
    showFeedback(question(t.questionId), t.result, t, (play.stealNotes || []).concat(note ? [note] : ['Nobody stole this tile.'])); persist(); refreshBoard();
  }
  function showFeedback(q, result, t, notes, reworked) {
    show('answer-actions', false); show('retry-box', false); show('token-row', false); show('feedback', true); show('after-answer', true); show('timer-row', false);
    const st = statusOf(result), ok = result.status === 'correct', stolen = result.steal && result.steal.awarded;
    $('feedback').className = 'feedback' + (st.cls === 'practice' ? '' : ' ' + st.cls);
    const lost = result.awarded < 0 ? ' ' + fmt(result.awarded) + ' points.' : '';
    put('feedback-title', ok ? 'Correct. ' + (result.awarded >= 0 ? '+' : '') + fmt(result.awarded) + ' points' : stolen ? 'Stolen by ' + teamName(result.steal.team) + '. +' + result.steal.awarded : result.status === 'timeout' ? 'Time is up. Here is the method.' + lost : result.status === 'incorrect' ? 'Not quite. Here is the method.' + lost : result.status === 'void' ? 'Marked not yet taught.' : 'Practice this one when you are ready.' + lost);
    put('feedback-detail', (notes || []).join(' ')); show('feedback-detail', Boolean(notes && notes.length));
    put('solution-answer', reworked ? '' : q.displayAnswer); put('explanation', reworked ? 'This tile stays in play, so the answer stays hidden for now.' : q.explanation); put('question-reference', String(q.reference || '').replace(/^Textbook/, 'The textbook'));
    show('solution-answer', !reworked);
    $('answer-input').disabled = true; if (q.type === 'number' && result.response) $('answer-input').value = result.response;
    for (const l of $('choice-list').querySelectorAll('label.choice')) {
      l.querySelector('input').disabled = true;
      if (!reworked) { l.classList.toggle('correct-choice', l.dataset.value === q.answer); l.classList.toggle('wrong-choice', (result.status === 'incorrect' || result.status === 'timeout') && l.dataset.value === result.response); }
    }
    const live = play && play.phase === 'done';
    put('next-team', live ? (round.teams === 1 ? 'Your next tile is ready.' : 'Back to the board for the next turn.') : '');
    if (live) announce($('feedback-title').textContent + ' ' + (notes || []).join(' '));
    $('back-to-board').focus();
  }
  $('back-to-board').addEventListener('click', () => $('question-dialog').close());
  $('close-question').addEventListener('click', () => $('question-dialog').close());
  $('question-dialog').addEventListener('close', () => {
    stopTimer();
    if (play && play.phase === 'done') { play = null; endTurn(); return; }
    if (play && play.phase === 'steal') { play.stealQueue = []; finishSteal(); play = null; endTurn(); return; }
    play = null; focusTile(lastOpenedKey);
  });

  /* ---------- turns and events ---------- */
  function advanceFrom(team, notes) {
    let t = (team + 1) % round.teams;
    for (let i = 0; i < round.teams; i++) {
      if (round.skipNext[t]) { round.skipNext[t] = false; notes.push(teamName(t) + ' loses this turn.'); t = (t + 1) % round.teams; } else break;
    }
    return t;
  }
  function endTurn() {
    const notes = [];
    round.turnNumber++;
    if (round.teams > 1) round.turn = advanceFrom(round.turn, notes);
    releaseLocksIfStuck();
    persist(); refreshBoard();
    if (afterBoardChange()) return;
    const id = engine.rollEvent(round.seed, round.turnNumber, { settings: round.settings, teams: round.teams, phase: round.phase, eventsCount: round.events.length, lastEventTurn: round.lastEventTurn, openCount: openTiles().filter(t => !isLocked(t)).length });
    if (id) { runEvent(id); return; }
    announce((notes.length ? notes.join(' ') + ' ' : '') + (round.teams > 1 ? teamName(round.turn) + ', choose a tile.' : 'Choose your next tile.'));
    focusTile(lastOpenedKey);
  }
  function releaseLocksIfStuck() {
    const open = openTiles();
    if (open.length && open.every(isLocked)) { round.locks = {}; announce('The delivery arrived. Locked tiles are open again.'); }
  }
  /* Returns true when the board is finished and the round moves on. */
  function afterBoardChange() {
    if (round.phase !== 'board' || openTiles().length) return false;
    if (round.settings.final) startFinal(); else finishScoring();
    return true;
  }
  function runEvent(id) {
    const def = EV.EVENTS.find(e => e.id === id), rnd = engine.eventRandom(round.seed, round.turnNumber);
    pushUndo();
    const entry = { turn: round.turnNumber, id, summary: def.effect };
    round.events.push(entry); round.lastEventTurn = round.turnNumber;
    sfx('event');
    let extra = '', afterCard = null;
    const open = openTiles().filter(t => !isLocked(t));
    if (id === 'inspector') round.effects.inspector = true;
    if (id === 'rush') round.effects.rush = true;
    if (id === 'shortage') {
      const cols = [...new Set(open.map(t => t.column))], col = cols[Math.floor(rnd() * cols.length)];
      const target = open.filter(t => t.column === col).sort((a, b) => b.value - a.value)[0];
      if (target) { round.locks[target.key] = round.turnNumber + 2; extra = 'The ' + target.value + ' tile in ' + target.category + ' is locked for 2 turns.'; }
      releaseLocksIfStuck();
    }
    if (id === 'changeorder') {
      const pair = S.shuffle(open, rnd).slice(0, 2);
      if (pair.length === 2) { const v = pair[0].value; pair[0].value = pair[1].value; pair[1].value = v; extra = pair[0].category + ' now shows ' + pair[0].value + ' and ' + pair[1].category + ' now shows ' + pair[1].value + '.'; }
    }
    if (id === 'payday') {
      const who = trailers(round.scores);
      who.forEach(i => addScore(i, 200, 'Payday')); extra = who.map(teamName).join(' and ') + ' get' + (who.length === 1 ? 's' : '') + ' +200.';
    }
    if (id === 'weather') { const lost = round.turn; round.turn = advanceFrom(lost, []); extra = teamName(lost) + ' loses this turn. ' + teamName(round.turn) + ' plays next.'; }
    if (id === 'measuretwice') { round.tokens[round.turn].retry++; extra = teamName(round.turn) + ' gets a Measure Twice token.'; }
    if (id === 'crewswap') { const chooser = (round.turn - 1 + round.teams) % round.teams; extra = teamName(chooser) + ' picks the next team.'; afterCard = () => crewSwap(chooser); }
    if (id === 'standdown') afterCard = () => standDown();
    if (extra) entry.summary = extra;
    log({ kind: 'event', id, note: entry.summary });
    persist(); refreshBoard();
    announce(def.title + '. ' + def.text + ' ' + (extra || def.effect));
    openCard('event', body => {
      body.append(art(def.art), el('p', { class: 'card-kicker', text: 'Site event' }), el('h2', { text: def.title }), el('p', { text: def.text }), el('p', { class: 'card-effect', text: extra || def.effect }),
        el('div', { class: 'card-actions' }, [el('button', { class: 'button', type: 'button', id: 'event-continue', text: afterCard ? 'Continue' : 'Back to the board', onclick: () => { if (afterCard) afterCard(); else { closeCard(); afterEventClosed(); } } })]));
    });
  }
  function afterEventClosed() { refreshBoard(); announce(round.teams > 1 ? teamName(round.turn) + ', choose a tile.' : 'Choose your next tile.'); focusTile(lastOpenedKey); }
  function crewSwap(chooser) {
    openCard('event', body => {
      body.append(art('swap'), el('h2', { text: teamName(chooser) + ', pick the next team' }));
      const row = el('div', { class: 'team-buttons' });
      for (let i = 0; i < round.teams; i++) row.append(el('button', { class: 'button', type: 'button', text: teamName(i), onclick: () => { round.turn = i; log({ kind: 'event', id: 'crewswap', note: teamName(chooser) + ' picked ' + teamName(i) }); round.events[round.events.length - 1].summary = teamName(chooser) + ' picked ' + teamName(i) + ' to play next.'; persist(); closeCard(); afterEventClosed(); } }));
      body.append(row);
    });
  }
  const STAND_DOWN_SKILLS = ['communication', 'reading', 'problem-solving'];
  function standDownPool() {
    const fromSkills = STAND_DOWN_SKILLS.flatMap(k => skillState[k].status === 'ready' ? skillState[k].board.questions.map(q => Object.assign({ boardTitle: skillState[k].title }, q)) : []);
    if (fromSkills.some(q => q.type === 'choice')) return fromSkills;
    const used = new Set(round.tiles.map(t => t.questionId));
    const own = board.questions.filter(q => !used.has(q.id) && q.type === 'choice' && !q.meta && !q.offTopic);
    return own.filter(q => q.level <= 2).length ? own.filter(q => q.level <= 2) : own;
  }
  async function standDown() {
    await loadSkills(STAND_DOWN_SKILLS);
    const q = engine.pickStandDown(standDownPool(), round.seed, round.turnNumber);
    if (!q) { closeCard(); afterEventClosed(); return; }
    const choices = S.shuffle(q.choices, engine.stream(round.seed, 'standdown-choices:' + round.turnNumber));
    openCard('event', body => {
      body.append(el('p', { class: 'card-kicker', text: EV.SPECIAL.stand.title + (q.boardTitle ? ' · ' + q.boardTitle : '') }), el('h2', { text: 'Quick question for everyone' }));
      const form = el('form', { novalidate: true });
      for (let i = 0; i < round.teams; i++) form.append(choiceFieldset('sd-' + i, choices, teamName(i)));
      const err = el('p', { class: 'input-error', role: 'alert' });
      form.append(err, el('button', { class: 'button', type: 'submit', text: 'Check answers' }));
      form.addEventListener('submit', e => {
        e.preventDefault();
        const picks = Array.from({ length: round.teams }, (_, i) => checkedValue(form, 'sd-' + i));
        if (picks.some(p => p == null)) { err.textContent = 'Every team needs to choose an answer.'; return; }
        const list = el('ul', { class: 'result-list' });
        picks.forEach((p, i) => { const ok = p === q.answer; if (ok) addScore(i, 100, EV.SPECIAL.stand.title); list.append(el('li', { text: teamName(i) + ': ' + (ok ? 'right, +100' : 'not this time') })); });
        round.events[round.events.length - 1].summary = 'Stand-down answers: ' + picks.map((p, i) => teamName(i) + (p === q.answer ? ' +100' : ' 0')).join(', ') + '.';
        persist(); renderScores();
        form.replaceWith(el('div', {}, [el('p', { class: 'card-answer', text: 'Answer: ' + q.displayAnswer }), el('p', { text: q.explanation }), list]));
        body.append(el('div', { class: 'card-actions' }, [el('button', { class: 'button', type: 'button', id: 'sd-done', text: 'Back to the board', onclick: () => { closeCard(); afterEventClosed(); } })]));
        $('sd-done').focus(); announce('Stand-down results. ' + list.textContent);
      });
      body.append(el('div', { class: 'card-question' }, [el('p', { class: 'question-prompt', text: q.prompt }), form]));
    });
  }

  /* ---------- Final Inspection ---------- */
  function startFinal() {
    if (!round || round.finished) return;
    if (!round.settings.final) { finishScoring(); return; }
    for (const t of round.tiles) if (t.state === 'open') { t.state = 'done'; t.result = { status: 'skipped', team: round.turn, awarded: 0, response: 'Not played before the ' + FINAL }; }
    round.phase = 'final';
    if (!round.final) {
      const q = engine.pickFinal(board, round.seed, round.tiles.map(t => t.questionId), round.settings);
      round.final = { questionId: q.id, step: 'intro', wagers: [], answers: [], results: [], team: 0, revealed: 0 };
      log({ kind: 'final', note: FINAL + ' started' });
    }
    persist(); refreshBoard(); runFinal();
  }
  /* Lowest score first. Equal scores reveal in team order. */
  function finalOrder() { return round.scores.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i).map(x => x.i); }
  function runFinal() {
    const f = round.final, q = question(f.questionId);
    if (f.step === 'intro') {
      sfx('event'); announce(FINAL + '. The category is ' + q.category + '. Each team wagers next.');
      return openCard('final', body => body.append(art(EV.SPECIAL.final.art), el('p', { class: 'card-kicker', text: 'Final round' }), el('h2', { text: FINAL }), el('p', { text: 'Category: ' + q.category }),
        el('p', { class: 'card-effect', text: 'Each team wagers from 0 up to its score. A team at 0 or below may wager up to 200. Wagers stay hidden.' }),
        el('div', { class: 'card-actions' }, [el('button', { class: 'button', type: 'button', id: 'final-go', text: 'Take wagers', onclick: () => { f.step = 'wager'; f.team = 0; persist(); runFinal(); } })])));
    }
    if (f.step === 'wager') {
      const i = f.team, max = engine.finalWagerMax(round.scores[i]);
      announce(teamName(i) + ', enter a hidden wager from 0 to ' + max + '.');
      return openCard('final', body => {
        const { form } = hiddenAnswerForm('final-wager', teamName(i) + ': hidden wager', 'Score ' + fmt(round.scores[i]) + '. Enter a whole number from 0 to ' + fmt(max) + '. Other teams look away.', 'Lock in the wager', (value, fail) => {
          if (!/^\d+$/.test(value.trim()) || Number(value) > max) return fail('Enter a whole number from 0 to ' + fmt(max) + '.');
          f.wagers[i] = Number(value); f.team++; if (f.team >= round.teams) { f.step = 'question'; f.team = 0; }
          persist(); runFinal();
        });
        body.append(el('h2', { text: 'Final wagers' }), form);
      });
    }
    if (f.step === 'question') {
      return openCard('final', body => {
        const wrap = el('div', { class: 'card-question' }, [el('p', { class: 'question-kicker', text: q.category }), el('p', { class: 'question-prompt', text: q.prompt }), figureNode(q)]);
        wrap.append(el('div', { class: 'timer-row' }, [el('p', { class: 'timer', id: 'final-timer', role: 'timer', 'aria-live': 'off' }), el('button', { class: 'button secondary small', type: 'button', 'data-timer': 'pause', text: 'Pause timer', onclick: pauseTimer }), el('button', { class: 'button secondary small', type: 'button', text: 'Extend time +30 s', onclick: extendTimer })]),
          el('p', { text: 'Every team writes its answer on paper. Then enter the answers one team at a time.' }),
          el('button', { class: 'button', type: 'button', id: 'final-enter', text: 'Enter the answers', onclick: () => { stopTimer(); f.step = 'answer'; f.team = 0; persist(); runFinal(); } }));
        body.append(el('p', { class: 'card-kicker', text: FINAL }), el('h2', { text: 'The question' }), wrap);
        startTimer(round.settings.timer || 60, () => { announce('Time is up. Enter the answers you wrote down.'); sfx('wrong'); }, 'final-timer');
        announce(FINAL + ' question. ' + q.prompt);
      });
    }
    if (f.step === 'answer') {
      const i = f.team;
      const save = raw => { f.answers[i] = String(raw); f.results[i] = engine.grade(q, raw).correct; f.team++; if (f.team >= round.teams) { f.step = 'reveal'; f.revealed = 0; f.order = finalOrder(); } persist(); runFinal(); };
      return openCard('final', body => {
        const wrap = el('div', { class: 'card-question' }, [el('p', { class: 'question-prompt', text: q.prompt })]);
        if (q.type === 'number') {
          wrap.append(hiddenAnswerForm('final-answer', teamName(i) + ': answer' + (q.unit ? ' in ' + q.unit : '') + ' (hidden)', null, 'Lock in the answer', (raw, fail) => { const g = engine.grade(q, raw); if (g.error) return fail(g.error); save(raw); }).form);
        } else {
          const err = el('p', { class: 'input-error', role: 'alert' });
          const form = el('form', { novalidate: true }, [choiceFieldset('fa', q.choices, teamName(i) + ': choose an answer', true), err, el('button', { class: 'button', type: 'submit', text: 'Lock in the answer' })]);
          form.addEventListener('submit', e => { e.preventDefault(); const raw = checkedValue(form, 'fa'); if (raw == null) { err.textContent = 'Choose one answer.'; return; } save(raw); });
          wrap.append(form);
        }
        body.append(el('p', { class: 'card-kicker', text: FINAL }), el('h2', { text: teamName(i) + ', your answer' }), wrap);
      });
    }
    if (f.step === 'reveal') {
      const order = f.order || finalOrder();
      return openCard('final', body => {
        const more = f.revealed < order.length;
        body.append(el('p', { class: 'card-kicker', text: FINAL }), el('h2', { text: more ? 'The reveal' : 'Inspection complete' }), el('p', { text: 'Answers are revealed from the lowest score to the highest.' }));
        if (f.revealed) body.append(el('ul', { class: 'result-list' }, order.slice(0, f.revealed).map(i => el('li', { text: teamName(i) + ' answered ' + f.answers[i] + ' · ' + (f.results[i] ? 'right' : 'wrong') + ' · wager ' + fmt(f.wagers[i]) + ' · score ' + fmt(round.scores[i]) }))));
        if (!more) body.append(el('p', { class: 'card-answer', text: 'Answer: ' + q.displayAnswer }), el('p', { text: q.explanation }));
        body.append(el('div', { class: 'card-actions' }, [el('button', { class: 'button', type: 'button', id: 'final-next', 'data-autofocus': true, text: more ? 'Reveal ' + teamName(order[f.revealed]) : 'See the winner', onclick: () => {
          if (!more) { f.step = 'done'; persist(); finishScoring(); return; }
          const i = order[f.revealed], d = f.results[i] ? f.wagers[i] : -f.wagers[i]; pushUndo();
          addScore(i, d, FINAL); log({ kind: 'final', team: i, delta: d });
          sfx(f.results[i] ? 'right' : 'wrong');
          f.revealed++; persist(); renderScores(); runFinal();
          announce(teamName(i) + ' answered ' + f.answers[i] + '. ' + (f.results[i] ? 'Right. Plus ' : 'Wrong. Minus ') + fmt(f.wagers[i]) + '. Score ' + fmt(round.scores[i]) + '.');
        } })]));
      });
    }
    if (f.step === 'done') finishScoring();
  }

  /* ---------- tie-break and winner ---------- */
  function usedIds() { return round.tiles.map(t => t.questionId).concat(round.final ? [round.final.questionId] : [], round.tiebreaks.map(t => t.questionId)); }
  function finishScoring() {
    stopTimer();
    if (round.teams > 1) {
      const tied = leaders(round.scores), last = round.tiebreaks[round.tiebreaks.length - 1];
      if (last && !last.done) { round.phase = 'tiebreak'; persist(); refreshBoard(); return runTiebreak(); }
      if (tied.length > 1 && !round.tiebreaks.length) {
        const q = engine.pickTiebreak(board, round.seed, usedIds(), 1);
        if (q) { round.tiebreaks.push({ questionId: q.id, teams: tied, answers: [], step: 0, done: false, winners: [] }); round.phase = 'tiebreak'; persist(); refreshBoard(); return runTiebreak(); }
      }
      round.winners = last && last.done ? last.winners : tied;
    } else round.winners = [0];
    round.phase = 'done'; round.finished = true; music.pause();
    log({ kind: 'finish', note: 'Winner: ' + round.winners.map(teamName).join(', ') });
    closeCard(); persist(); refreshBoard(); sfx('win');
    announce(winnerText() + ' Review the round next.');
    openReview();
  }
  function winnerText() {
    if (round.teams === 1) return 'Round complete. Your score: ' + fmt(round.scores[0]) + '.';
    const w = round.winners.map(teamName);
    const cut = round.tiebreaks.length && round.tiebreaks[round.tiebreaks.length - 1].done && w.length === 1 ? ' and the closest cut in the tie-break' : '';
    return w.length === 1 ? w[0] + ' wins with ' + fmt(round.scores[round.winners[0]]) + ' points' + cut + '.' : 'Shared win: ' + w.join(' and ') + ' with ' + fmt(round.scores[round.winners[0]]) + ' points each.';
  }
  function runTiebreak() {
    const tb = round.tiebreaks[round.tiebreaks.length - 1], q = question(tb.questionId);
    if (tb.step < tb.teams.length) {
      const i = tb.teams[tb.step];
      announce(CUT + ' tie-break. ' + teamName(i) + ', enter a hidden answer.');
      return openCard('final', body => {
        body.append(art(EV.SPECIAL.tiebreak.art), el('p', { class: 'card-kicker', text: 'Tie-break ' + round.tiebreaks.length + ' of up to 3' }), el('h2', { text: CUT }), el('p', { text: tb.teams.map(teamName).join(' and ') + ' are tied. The answer closest to the key wins.' }));
        const { form } = hiddenAnswerForm('tb-answer', teamName(i) + ': your answer' + (q.unit ? ' in ' + q.unit : '') + ' (hidden)', null, 'Lock in', (raw, fail) => {
          const p = engine.parseNumber(raw, q.unit); if (p.error) return fail(p.error);
          tb.answers[tb.step] = p.value; tb.step++; persist(); runTiebreak();
        });
        body.append(el('div', { class: 'card-question' }, [el('p', { class: 'question-prompt', text: q.prompt }), form]));
      });
    }
    if (!tb.done) { tb.winners = engine.closest(tb.answers, q.answer).map(k => tb.teams[k]); tb.done = true; log({ kind: 'tiebreak', note: 'Closest: ' + tb.winners.map(teamName).join(', ') }); persist(); }
    const decided = tb.winners.length === 1, again = !decided && round.tiebreaks.length < 3;
    announce(decided ? teamName(tb.winners[0]) + ' cuts closest and wins.' : again ? 'Still tied. Another ' + CUT + '.' : 'Still tied after three cuts. It is a shared win.');
    openCard('final', body => {
      body.append(art(EV.SPECIAL.tiebreak.art), el('h2', { text: decided ? teamName(tb.winners[0]) + ' cuts closest' : 'Still tied' }), el('p', { class: 'card-answer', text: 'Key: ' + q.displayAnswer }),
        el('ul', { class: 'result-list' }, tb.teams.map((i, k) => el('li', { text: teamName(i) + ': ' + fmt(tb.answers[k]) + ' · off by ' + fmt(Math.round(Math.abs(tb.answers[k] - q.answer) * 1e6) / 1e6) }))),
        el('div', { class: 'card-actions' }, [el('button', { class: 'button', type: 'button', id: 'tb-next', text: again ? 'Next ' + CUT : 'See the results', onclick: () => {
          if (again) {
            const nq = engine.pickTiebreak(board, round.seed, usedIds(), round.tiebreaks.length + 1);
            if (nq) { round.tiebreaks.push({ questionId: nq.id, teams: tb.winners.slice(), answers: [], step: 0, done: false, winners: [] }); persist(); return runTiebreak(); }
          }
          finishScoring();
        } })]));
    });
  }
  $('continue-final').addEventListener('click', () => { if (round.phase === 'final') runFinal(); else if (round.phase === 'tiebreak') runTiebreak(); });

  /* ---------- review ---------- */
  function reviewItem(title, status, q) { return el('section', { class: 'review-item' }, [el('h3', { text: title }), el('p', { class: 'result-label', text: status }), el('p', { text: 'Answer: ' + q.displayAnswer }), el('p', { text: q.explanation }), el('p', { class: 'review-reference', text: q.reference || '' })]); }
  function reviewItems(target) {
    target.replaceChildren();
    round.tiles.slice().sort((a, b) => a.column - b.column || a.row - b.row).forEach((t, i) => {
      const q = question(t.questionId), r = t.result;
      const state = statusOf(r).review + (r && round.teams > 1 ? ' · ' + teamName(r.team) : '') + (r ? ' · ' + (r.awarded > 0 ? '+' : '') + fmt(r.awarded) + ' points' : '') + (t.origMod ? ' · ' + EV.TILES[t.origMod].title : '') + (r && r.response ? ' · Response: ' + r.response : '');
      target.append(reviewItem((i + 1) + '. ' + t.category + ' ' + t.value + ' · ' + q.prompt, state, q));
    });
    if (round.final && round.final.answers.length) target.append(reviewItem(FINAL + ' · ' + question(round.final.questionId).prompt, round.final.answers.map((a, i) => teamName(i) + ': ' + (a == null ? 'no answer' : a + (round.final.results[i] ? ' (right, +' : ' (wrong, −') + fmt(round.final.wagers[i] || 0) + ')')).join(' · '), question(round.final.questionId)));
    round.tiebreaks.forEach((tb, k) => target.append(reviewItem(CUT + ' ' + (k + 1) + ' · ' + question(tb.questionId).prompt, tb.teams.map((i, j) => teamName(i) + ': ' + (tb.answers[j] == null ? '—' : fmt(tb.answers[j]))).join(' · '), question(tb.questionId))));
  }
  function openReview() {
    music.pause(); stopTimer();
    put('review-lecture', (isSkill(board) ? board.title : board.topic) + ' · Round ' + round.code);
    const w = $('review-winner'); w.replaceChildren();
    if (round.finished) w.append(el('div', { class: 'winner-banner', id: 'winner-banner' }, [el('span', { html: EV.ART.star }), el('div', {}, [el('strong', { text: round.teams === 1 ? 'Round complete' : round.winners.length === 1 ? teamName(round.winners[0]) + ' wins' : 'Shared win' }), el('span', { text: winnerText() })])]));
    const rank = engine.ranking(round.scores);
    if (round.teams > 1) {
      w.append(el('table', { class: 'rank-table' }, [el('caption', { class: 'sr-only', text: 'Team scores and ranks' }), el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'Rank' }), el('th', { scope: 'col', text: 'Team' }), el('th', { scope: 'col', text: 'Score' })])]),
        el('tbody', {}, rank.map(r => el('tr', {}, [el('td', { text: String(r.rank) }), el('th', { scope: 'row', text: teamName(r.team) + (round.finished && round.winners.includes(r.team) ? ' (winner)' : '') }), el('td', { text: fmt(r.score) })])))]));
    }
    const graded = round.tiles.map(t => t.result).filter(r => r && ['correct', 'incorrect', 'timeout'].includes(r.status)), correct = graded.filter(r => r.status === 'correct').length;
    $('review-summary').replaceChildren(...[[fmt(rank[0].score), round.teams === 1 ? 'your points' : 'top score'], [correct + ' / ' + graded.length, 'correct / attempted'], [round.tiles.length - graded.length, 'practice / skipped'], [round.events.length, 'site events']]
      .map(([n, l]) => el('div', { class: 'summary-box' }, [el('strong', { text: String(n) }), el('span', { text: l })])));
    const ev = $('review-events'); ev.replaceChildren();
    const mods = round.tiles.filter(t => t.origMod).map(t => EV.TILES[t.origMod].title + ': ' + t.category + ', row ' + (t.row + 1));
    if (mods.length) ev.append(el('h3', { text: 'Hidden tiles this round' }), el('ul', { class: 'event-list' }, mods.map(m => el('li', { text: m }))));
    if (round.events.length) ev.append(el('h3', { text: 'Site events' }), el('ul', { class: 'event-list' }, round.events.map(e => el('li', { text: 'After turn ' + e.turn + ': ' + EV.EVENTS.find(x => x.id === e.id).title + '. ' + e.summary }))));
    reviewItems($('review-list'));
    if (!$('review-dialog').open) $('review-dialog').showModal();
    $('review-dialog').scrollTop = 0; $('close-review').focus();
  }
  function finishRound() {
    pushUndo(); stopTimer();
    for (const t of round.tiles) if (t.state === 'open') { t.state = 'done'; t.result = { status: 'skipped', team: round.turn, awarded: 0, response: 'Not attempted' }; }
    if (round.final) round.final.step = 'done';
    for (const tb of round.tiebreaks) tb.done = true;
    round.winners = round.teams === 1 ? [0] : leaders(round.scores);
    round.phase = 'done'; round.finished = true; persist(); refreshBoard(); openReview();
  }
  $('review-round').addEventListener('click', () => {
    if (round.finished) return openReview();
    const left = openTiles().length;
    put('finish-notice', (left ? left + ' tile' + (left === 1 ? ' is' : 's are') + ' still unplayed. ' : '') + 'Finishing now ends the round without a ' + FINAL + ' and reveals the worked solutions.');
    $('finish-dialog').showModal(); $('keep-playing').focus();
  });
  $('finish-now').addEventListener('click', () => { $('finish-dialog').close(); closeCard(); finishRound(); });
  for (const id of ['keep-playing', 'close-finish']) $(id).addEventListener('click', () => $('finish-dialog').close());
  $('close-review').addEventListener('click', () => $('review-dialog').close());
  $('new-round-review').addEventListener('click', () => { $('review-dialog').close(); startRound(); });
  $('start-game').addEventListener('click', () => {
    if (round && !round.finished && round.tiles.some(t => t.state === 'done')) { announce('Finish and review this round before starting another, or choose a different board.'); $('review-round').focus(); return; }
    const code = params.get('round'); params.delete('round'); startRound(code);
  });
  $('print-results').addEventListener('click', () => {
    const items = el('div'); reviewItems(items);
    $('print-area').replaceChildren(el('h1', { text: 'Math quiz results' }), el('h2', { text: isSkill(board) ? board.title : board.topic }), el('p', { text: board.id + ' · Round ' + round.code + ' · ' + winnerText() + ' · ' + round.scores.map((s, i) => teamName(i) + ' ' + fmt(s)).join(' · ') }), items);
    window.print();
  });

  /* ---------- board picker ---------- */
  function selectTab(which) {
    const lec = which === 'lectures';
    $('tab-lectures').setAttribute('aria-selected', String(lec)); $('tab-skills').setAttribute('aria-selected', String(!lec));
    $('tab-lectures').tabIndex = lec ? 0 : -1; $('tab-skills').tabIndex = lec ? -1 : 0;
    show('panel-lectures', lec); show('panel-skills', !lec);
    if (!lec) { renderSkills(); loadSkills().then(() => { if ($('lecture-dialog').open) renderSkills(); }); }
  }
  $('tab-lectures').addEventListener('click', () => selectTab('lectures'));
  $('tab-skills').addEventListener('click', () => selectTab('skills'));
  document.querySelector('.tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault();
    const toSkills = e.key === 'End' || (e.key !== 'Home' && document.activeElement === $('tab-lectures'));
    selectTab(toSkills ? 'skills' : 'lectures'); (toSkills ? $('tab-skills') : $('tab-lectures')).focus();
  });
  function chooseBoard(b) {
    music.pause(); stopTimer(); if (flushQueued) flush(); board = b; pendingSeed = S.freshCode(); loadRound(); persist(); updateBoardPanel(); if ($('lecture-dialog').open) $('lecture-dialog').close();
    announce('Selected ' + (isSkill(b) ? b.title + ' skill board' : b.topic) + '.'); $('start-game').focus();
  }
  function renderLibrary() {
    const query = $('lecture-search').value.trim().toLowerCase();
    const list = data.lectures.filter(l => searchText.get(l.id).includes(query));
    show('clear-search', Boolean(query)); put('library-count', list.length + ' of ' + data.lectures.length + ' lectures'); show('no-results', !list.length);
    $('lecture-list').replaceChildren(...list.map(l => el('button', { class: 'lecture-item', type: 'button', 'aria-current': String(l.id === board.id), onclick: () => chooseBoard(l) }, [el('strong', { text: l.topic }), el('span', { text: 'Day ' + l.day + ' · ' + lectureDate(l.date) + ' · ' + l.start + ' · ' + l.id })])));
  }
  function renderSkills() {
    const states = SKILLS.map(([k]) => skillState[k]), ready = states.filter(s => s.status === 'ready').length;
    put('skill-count', ready + ' of 9 skill boards ready' + (states.some(s => s.status === 'loading' || s.status === 'idle') ? ' · loading' : ''));
    $('skill-list').replaceChildren(...states.map(s => s.status === 'ready'
      ? el('button', { class: 'lecture-item', type: 'button', 'data-skill': s.key, 'aria-current': String(board.id === s.board.id), onclick: () => chooseBoard(s.board) }, [el('strong', { text: s.board.title || s.title }), el('span', { text: s.board.questions.length + ' questions · ' + s.board.categories.length + ' columns' + (s.note ? ' · ' + s.note : '') })])
      : el('button', { class: 'lecture-item missing', type: 'button', 'data-skill': s.key, 'aria-disabled': 'true', onclick: () => announce(s.title + ': ' + (s.note || 'still loading.')) }, [el('strong', { text: s.title }), el('span', { text: s.note || 'Loading…' })])));
  }
  function openLibrary() { $('lecture-search').value = ''; renderLibrary(); $('lecture-dialog').showModal(); selectTab(isSkill(board) ? 'skills' : 'lectures'); (isSkill(board) ? $('tab-skills') : $('lecture-search')).focus(); }
  $('choose-lecture').addEventListener('click', openLibrary); $('change-lecture').addEventListener('click', openLibrary); $('close-library').addEventListener('click', () => $('lecture-dialog').close());
  $('lecture-search').addEventListener('input', renderLibrary); $('clear-search').addEventListener('click', () => { $('lecture-search').value = ''; renderLibrary(); $('lecture-search').focus(); });

  /* ---------- instructor settings ---------- */
  $('event-toggles').append(...EV.EVENTS.map(e => el('label', {}, [el('input', { type: 'checkbox', name: 'ev-' + e.id }), ' ' + e.title + (e.minTeams > 1 ? ' (' + e.minTeams + '+ teams)' : '')])));
  function fillSettings() {
    const s = currentSettings(), f = $('settings-form');
    for (const k of engine.FLAG_KEYS) f.elements[k].checked = s[k];
    for (const k of engine.NUMBER_KEYS) f.elements[k].value = String(s[k]);
    f.elements.showHidden.checked = Boolean(prefs.showHidden);
    for (const e of EV.EVENTS) f.elements['ev-' + e.id].checked = !s.eventsOff.includes(e.id);
    const rows = $('fix-rows');
    if (round && !round.finished) rows.replaceChildren(...round.scores.map((s2, i) => el('div', { class: 'fix-row' }, [el('span', { text: teamName(i) + ' ' + fmt(s2) }),
      el('button', { class: 'button secondary small', type: 'button', text: '+100', 'aria-label': 'Add 100 points to ' + teamName(i), onclick: () => adjust(i, 100) }),
      el('button', { class: 'button secondary small', type: 'button', text: '−100', 'aria-label': 'Take 100 points from ' + teamName(i), onclick: () => adjust(i, -100) })])));
    else rows.replaceChildren(el('p', { class: 'settings-note', text: 'Score fixes appear here during a round.' }));
    $('undo-last').disabled = !undo.length; $('start-final').disabled = !round || round.finished || round.phase !== 'board' || !round.settings.final;
    put('not-taught-note', prefs.notTaught.length ? prefs.notTaught.length + ' question(s) are marked not yet taught for this intake. Later rounds skip them.' : 'No questions are marked not yet taught.');
  }
  function adjust(team, delta) { pushUndo(); addScore(team, delta, 'Instructor fix'); log({ kind: 'adjust', team, delta }); persist(); refreshBoard(); fillSettings(); announce(teamName(team) + (delta > 0 ? ' plus ' : ' minus ') + Math.abs(delta) + '. Score ' + fmt(round.scores[team]) + '.'); }
  $('open-settings').addEventListener('click', () => asInstructor(() => { fillSettings(); put('settings-saved', ''); $('settings-dialog').showModal(); }));
  $('close-settings').addEventListener('click', () => $('settings-dialog').close());
  $('settings-form').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target, s = {};
    for (const k of engine.FLAG_KEYS) s[k] = f.elements[k].checked;
    for (const k of engine.NUMBER_KEYS) s[k] = Number(f.elements[k].value);
    s.eventsOff = EV.EVENTS.filter(x => !f.elements['ev-' + x.id].checked).map(x => x.id);
    prefs.settings = engine.normalizeSettings(s); prefs.showHidden = f.elements.showHidden.checked; fromUrl = {};
    persist(); if (!round) updateBoardPanel(); else refreshBoard();
    put('settings-saved', 'Saved. New rounds use these settings.'); announce('Instructor settings saved.');
  });
  $('reset-settings').addEventListener('click', () => { prefs.settings = {}; fromUrl = {}; persist(); fillSettings(); put('settings-saved', 'Defaults restored.'); });
  $('undo-last').addEventListener('click', () => { if (!undo.length) return; popUndo(); play = null; persist(); buildBoard(); fillSettings(); announce('Last result undone.'); });
  $('start-final').addEventListener('click', () => { $('settings-dialog').close(); startFinal(); });
  $('clear-not-taught').addEventListener('click', () => { prefs.notTaught = []; persist(); fillSettings(); announce('The not-yet-taught list is clear.'); });

  /* ---------- music ---------- */
  async function playMusic() {
    if (!prefs.music || !round || round.finished || document.hidden) { music.pause(); return; }
    try { await music.play(); put('music-error', ''); } catch (_) { /* autoplay blocked. Music waits for the next press. */ }
  }
  function updateMusic() {
    prefs.volume = Math.min(50, Math.max(0, Number(prefs.volume) || 0));
    music.volume = prefs.volume / 100; $('volume').value = prefs.volume;
    $('music-toggle').setAttribute('aria-pressed', String(Boolean(prefs.music))); put('music-toggle', prefs.music ? 'Music: on' : 'Music: off');
    if (!prefs.music) music.pause();
  }
  $('music-toggle').addEventListener('click', () => { prefs.music = !prefs.music; updateMusic(); persist(); if (prefs.music) playMusic(); });
  $('volume').addEventListener('input', () => { prefs.volume = +$('volume').value; updateMusic(); persist(); });
  $('effects-toggle').addEventListener('click', () => { prefs.effects = !prefs.effects; updateEffects(); persist(); if (prefs.effects) sfx('right'); announce(prefs.effects ? 'Sound effects on.' : 'Sound effects off.'); });
  $('effects-volume').addEventListener('input', () => { prefs.effectsVolume = +$('effects-volume').value; persist(); });
  $('music-settings').addEventListener('click', () => $('music-dialog').showModal()); $('close-music').addEventListener('click', () => $('music-dialog').close());
  $('reset-music').addEventListener('click', () => { music.pause(); if (customMusicURL) URL.revokeObjectURL(customMusicURL); customMusicURL = null; music.src = 'assets/quiz-show-loop.wav'; $('music-file').value = ''; put('music-file-status', 'Current track: original quiz-show loop'); put('music-error', ''); playMusic(); });
  $('music-file').addEventListener('change', () => {
    const file = $('music-file').files[0]; if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) { put('music-error', 'Choose an audio file such as MP3, WAV or OGG.'); return; }
    music.pause(); if (customMusicURL) URL.revokeObjectURL(customMusicURL); customMusicURL = URL.createObjectURL(file); music.src = customMusicURL; put('music-file-status', 'Current track: ' + file.name); put('music-error', ''); playMusic();
  });
  music.addEventListener('error', () => { put('music-error', 'This audio could not play. Choose another file or use the original loop.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else playMusic(); });
  window.addEventListener('beforeunload', () => { if (customMusicURL) URL.revokeObjectURL(customMusicURL); });

  /* ---------- start up ---------- */
  loadRound(); updateMusic(); updateEffects(); updateBoardPanel();
  if (round && !round.finished) announce('Your saved round is ready. ' + (round.phase === 'board' ? 'Choose a tile to continue.' : 'Continue the ' + (round.phase === 'final' ? FINAL : CUT) + '.'));
  const asked = urlSettings();
  if (Object.keys(asked).length) asInstructor(() => { fromUrl = asked; if (!round) updateBoardPanel(); announce('Settings from the address apply to new rounds.'); });
  /* A skill board is loaded only when the address, the round code or the last session asks for one. */
  const wantedSkill = (() => {
    const code = params.get('round'); let fromCode = null;
    if (code) { try { const k = engine.decodeCode(code).key; if (/^SK/.test(k)) fromCode = SKILLS.map(([key]) => key).find(key => engine.boardKey('SK-' + key) === k) || null; } catch (_) { /* a v1 code keeps the current board */ } }
    return skillKeyOf(params.get('board')) || fromCode || (!params.get('lecture') ? skillKeyOf(prefs.board) : null);
  })();
  const ready = (wantedSkill ? loadSkill(wantedSkill) : Promise.resolve(null)).then(b => {
    if (wantedSkill && b) { board = b; pendingSeed = S.freshCode(); loadRound(); updateBoardPanel(); }
    else if (wantedSkill && params.get('board')) announce(skillState[wantedSkill] ? skillState[wantedSkill].title + ' board: ' + skillState[wantedSkill].note + ' Showing ' + board.topic + '.' : 'That board was not found. Showing ' + board.topic + '.');
  });
  window.JeopardyApp = { getBoard: () => board.id, getRound: () => round, getPlay: () => play, ready, skillState, loadSkills, openLibrary, startRound: code => startRound(code),
    selectBoard: async id => { const key = skillKeyOf(id); if (key) await loadSkill(key); const b = findBoard(id); if (b) chooseBoard(b); return Boolean(b); } };
})();
