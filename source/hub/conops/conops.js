/* Construction Operations tab of the Numeracy Hub.
   Part A: the Red Seal route into BCIT's BTech in Construction Management, with a checklist, a GPA checker and a final-exam calculator.
   Part B: reading drawings. Part C: estimating. Each lesson has a worked example and practice tasks with fresh numbers.
   Needs TI30 (source/calc2/ti30.js) and TIKeys (tikeys.js). Progress is saved in this browser only. */
(function (G) {
  'use strict';

  /* Formatting and task numbers: copied unchanged from the Carpentry tab (the CP block of its src-carp page). */
  /* ---------- formatting (the same rules as the other hub pages) ---------- */
  function nudge(x) { return x === 0 ? 0 : x + (x > 0 ? 1 : -1) * Math.abs(x) * 1e-12 }
  function clean(x) { return Number((+x).toPrecision(12)) }
  function grp(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
  /* round half up (away from zero) on the decimal digits */
  function fmt(n, dp) {
    var f = Math.pow(10, dp), r = Math.round(Number((Math.abs(n) * f).toPrecision(13))) / f
    var p = r.toFixed(dp).split('.')
    return (n < 0 && r !== 0 ? '−' : '') + grp(p[0]) + (p[1] ? '.' + p[1] : '')
  }
  function trim(n, dp) { var s = fmt(n, dp == null ? 6 : dp); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s }
  function rnd(n, dp) { var f = Math.pow(10, dp); return Math.round(Number((n * f).toPrecision(13))) / f }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  function g4(s) { return String(s).replace(/(^|[^\d.,])(\d{4,})(?!\d)/g, function (all, pre, d) { return pre + grp(d) }) }
  function B(s) { return '<b>' + g4(s) + '</b>' }
  function plural(n, one, many) { return n === 1 ? one : many }

  function mkR(rng) {
    rng = rng || Math.random
    return {
      int: function (a, b) { return a + Math.floor(rng() * (b - a + 1)) },
      pick: function (arr) { return arr[Math.floor(rng() * arr.length)] },
      dec: function (a, b, dp) { var f = Math.pow(10, dp); return clean((Math.round(a * f) + Math.floor(rng() * (Math.round((b - a) * f) + 1))) / f) },
      step: function (a, b, s) { return a + s * Math.floor(rng() * (Math.floor((b - a) / s) + 1)) },
      shuffle: function (arr) {
        var a = arr.slice(), i = a.length - 1
        while (i > 0) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; i-- }
        return a
      }
    }
  }
  var L4 = 'ABCD'
  function kn(x) { return String(Number((+x).toFixed(10))) }

  /* Seeds and the random-number generator: copied unchanged from ExamCore in the Carpentry tab. */
  /* ---------- random numbers ---------- */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function freshSeed() {
    try {
      var b = new Uint32Array(1);
      (G.crypto || require('crypto').webcrypto).getRandomValues(b);
      return b[0] >>> 0;
    } catch (e) { return Math.floor(Math.random() * 4294967296) >>> 0; }
  }

  /* Answer reading and checking: copied from the Carpentry tab (CP); only UNIT_WORDS is widened. */
  /* ---------- answer parsing and checking ---------- */
  function cleanIn(s) { return String(s == null ? '' : s).toLowerCase().replace(/[’‘′`´]/g, "'").replace(/[”“″]/g, '"').replace(/[−–\u2014]/g, '-').replace(/,/g, '').replace(/\s+/g, ' ').trim() }
  /* Carpentry's unit words, plus this tab's units (ft, kg, t, yd³, loads, doors and $). m², m³ and yd³ come first so the
     m inside them is not taken on its own. */
  var UNIT_WORDS = /m²|m³|yd³|\b(mm|cm|m|m2|m3|studs?|joists?|sheets?|risers?|in 12|in|percent|ft|kg|t|yd3|loads?|doors?)\b|%|\$/g
  function parseNum(raw) {
    var s = cleanIn(raw).replace(/^1 in\s+/, '').replace(UNIT_WORDS, ' ').replace(/\s+/g, ' ').trim()
    var neg = false
    if (s.charAt(0) === '+') s = s.slice(1).trim()
    else if (s.charAt(0) === '-') { neg = true; s = s.slice(1).trim() }
    var m = s.match(/^(\d+(?:\.\d*)?|\.\d+)$/)
    if (!m) return { v: NaN }
    return { v: neg ? -parseFloat(m[1]) : parseFloat(m[1]) }
  }
  /* a choice answer: its letter (A to D), the letter with the option words, its number (1 to 4), or the option words */
  function readChoice(sol, raw) {
    var s = cleanIn(raw).replace(/[.)]+$/, '').replace(/^\(/, '').trim(), i
    if (!s) return -1
    var lead = s.match(/^([a-d])[.)]\s+\S/)
    if (lead) s = lead[1]
    if (/^[a-d]$/.test(s)) { i = L4.toLowerCase().indexOf(s); return i < sol.options.length ? i : -2 }
    if (/^[1-4]$/.test(s)) { i = +s - 1; return i < sol.options.length ? i : -2 }
    i = sol.options.map(function (o) { return cleanIn(o).replace(/[.)]+$/, '') }).indexOf(s)
    return i >= 0 ? i : -2
  }
  function check(sol, raw) {
    if (!String(raw || '').trim()) return { res: 'hint', msg: 'Type your answer in the box first.' }
    if (sol.kind === 'choice') {
      var c = readChoice(sol, raw)
      if (c < 0) return { res: 'hint', msg: 'Type the letter of your choice, ' + L4.slice(0, sol.options.length).split('').join(', ') + ', or its number, 1 to ' + sol.options.length + '.' }
      return { res: c === sol.ans ? 'right' : 'wrong' }
    }
    var r = parseNum(raw)
    if (isNaN(r.v)) return { res: 'hint', msg: 'Type a number, like 2650 or 0.84.' }
    if (sol.kind === 'int' && Math.abs(r.v - Math.round(r.v)) > 1e-9) return { res: 'hint', msg: 'Give a whole number.' }
    return { res: Math.abs(r.v - sol.ans) <= sol.tol + 1e-9 ? 'right' : 'wrong', v: r.v }
  }

  var doc = G.document, TIK = G.TIKeys;
  var STORE = 'access-conops-v1';
  var S = { done: {}, seeds: {}, chk: {}, gpa: [], fx: {} };
  try { var saved = JSON.parse(G.localStorage.getItem(STORE) || 'null'); if (saved) Object.keys(S).forEach(function (k) { if (saved[k] != null) S[k] = saved[k]; }); } catch (e) { /* storage blocked */ }
  function save() { try { G.localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }

  function money(x) { return '$' + fmt(x, 2); }
  function ceil(x) { return Math.ceil(x - 1e-9); }
  function rngFor(seed) { return mkR(makeRng(seed)); }
  /* One row of calculator keys, read from the same written expression the step shows. expect is the value the page
     computed for that quantity on its own, so a check can confirm the keys reach it. */
  function K(label, expr, expect) {
    var r = TIK ? TIK.fromExpr(expr) : null;
    return { label: label, seq: r ? r.seq : null, value: r ? r.value : null, expr: expr, expect: expect };
  }

  /* ---------- drawing helpers (paper colours stay fixed in both themes) ---------- */
  function svg(w, h, title, body) { return '<svg class="dg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(title) + '">' + body + '</svg>'; }
  function t(x, y, s, cls, anchor) { return '<text x="' + x + '" y="' + y + '"' + (cls ? ' class="' + cls + '"' : '') + ' text-anchor="' + (anchor || 'middle') + '">' + s + '</text>'; }
  function ln(x1, y1, x2, y2, cls, extra) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="' + cls + '"' + (extra || '') + '/>'; }
  function dimH(x1, x2, y, label, cls) { return ln(x1, y, x2, y, cls || 'dim', ' marker-start="url(#arw)" marker-end="url(#arw)"') + ln(x1, y - 8, x1, y + 8, 'ext') + ln(x2, y - 8, x2, y + 8, 'ext') + t((x1 + x2) / 2, y - 10, label, cls === 'unk' ? 'u' : ''); }
  function dimV(x, y1, y2, label, cls, side) { var tx = side === 'l' ? x - 10 : x + 10; return ln(x, y1, x, y2, cls || 'dim', ' marker-start="url(#arw)" marker-end="url(#arw)"') + ln(x - 8, y1, x + 8, y1, 'ext') + ln(x - 8, y2, x + 8, y2, 'ext') + t(tx, (y1 + y2) / 2 + 6, label, cls === 'unk' ? 'u' : '', side === 'l' ? 'end' : 'start'); }
  function rect(x, y, w, h, cls) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" class="' + cls + '"/>'; }
  function fig(s) { return '<figure class="paper">' + s + '</figure>'; }
  function table(caption, head, rows) {
    var h = '<div class="sched"><table class="k"><caption>' + caption + '</caption><thead><tr>' + head.map(function (c) { return '<th scope="col">' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) { h += '<tr>' + r.map(function (c, i) { return i === 0 ? '<th scope="row">' + c + '</th>' : '<td class="num">' + c + '</td>'; }).join('') + '</tr>'; });
    return h + '</tbody></table></div>';
  }

  /* ---------- fixed values ---------- */
  var METRIC = [50, 100, 200, 500];
  var IMP = [
    { lab: '1/8″ = 1′-0″', s: 0.125 }, { lab: '3/16″ = 1′-0″', s: 0.1875 }, { lab: '1/4″ = 1′-0″', s: 0.25 },
    { lab: '1/2″ = 1′-0″', s: 0.5 }, { lab: '3/4″ = 1′-0″', s: 0.75 }
  ];
  var DISC = [
    ['A', 'Architect (architectural)'], ['S', 'Structural engineer'], ['M', 'Mechanical engineer'],
    ['E', 'Electrical engineer'], ['C', 'Civil engineer'], ['L', 'Landscape architect']
  ];
  /* Read from MasterFormat 2016 Numbers and Titles (CSI and CSC, April 2016). */
  var MF_DIV = [
    ['00', 'Procurement and Contracting Requirements'], ['01', 'General Requirements'], ['02', 'Existing Conditions'],
    ['03', 'Concrete'], ['04', 'Masonry'], ['05', 'Metals'], ['06', 'Wood, Plastics, and Composites'],
    ['07', 'Thermal and Moisture Protection'], ['08', 'Openings'], ['09', 'Finishes'], ['10', 'Specialties'],
    ['21', 'Fire Suppression'], ['22', 'Plumbing'], ['23', 'Heating, Ventilating, and Air Conditioning (HVAC)'],
    ['26', 'Electrical'], ['31', 'Earthwork'], ['32', 'Exterior Improvements'], ['33', 'Utilities']
  ];
  var MF_SEC = [
    ['01 50 00', 'Temporary Facilities and Controls'], ['02 41 00', 'Demolition'], ['03 20 00', 'Concrete Reinforcing'],
    ['03 30 00', 'Cast-in-Place Concrete'], ['04 20 00', 'Unit Masonry'], ['05 12 00', 'Structural Steel Framing'],
    ['06 10 00', 'Rough Carpentry'], ['07 21 00', 'Thermal Insulation'], ['07 46 00', 'Siding'],
    ['08 11 00', 'Metal Doors and Frames'], ['08 50 00', 'Windows'], ['09 29 00', 'Gypsum Board'],
    ['09 65 00', 'Resilient Flooring'], ['09 91 00', 'Painting'], ['22 11 00', 'Facility Water Distribution'],
    ['22 40 00', 'Plumbing Fixtures'], ['23 31 00', 'HVAC Ducts and Casings'], ['26 05 00', 'Common Work Results for Electrical'],
    ['26 51 00', 'Interior Lighting'], ['31 23 00', 'Excavation and Fill'], ['32 12 00', 'Flexible Paving'], ['33 41 00', 'Subdrainage']
  ];
  function divTitle(code) { for (var i = 0; i < MF_DIV.length; i++) if (MF_DIV[i][0] === code) return MF_DIV[i][1]; return ''; }
  /* CSA G30.18 nominal masses, kg/m (RSIC / IAAC Standards Practice Manual) */
  var BARS = { '10M': 0.785, '15M': 1.570, '20M': 2.355, '25M': 3.925 };
  function bar(size) { return fmt(BARS[size], 3); }
  var SHEET_W = 1.22, SHEET_H = 2.44, SHEET = SHEET_W * SHEET_H;     /* one drywall sheet, m² */
  var DOOR_W = 0.915, DOOR_H = 2.134;                                  /* door opening used in the tasks, m */
  var YD3 = 0.764555;                                                  /* m³ in one cubic yard (0.9144³, rounded) */
  var GST = 0.05;

  /* ---------- figures ---------- */
  function figWall(paperLab, scaleLab) {
    return svg(560, 230, 'Plan of a wall with its length measured on the paper',
      rect(40, 90, 480, 34, 'shape') + ln(40, 107, 520, 107, 'cl') + dimH(40, 520, 62, paperLab, 'unk') +
      t(280, 168, 'PLAN', 's') + t(280, 196, scaleLab, ''));
  }
  function figImp(lab, s) {
    var u = 120, ticks = '';
    for (var i = 0; i <= 4; i++) ticks += ln(40 + i * u, 120, 40 + i * u, 140, 'dim') + t(40 + i * u, 166, i + ' in', 's');
    return svg(560, 200, 'Scale bar for ' + lab,
      rect(40, 120, 4 * u, 20, 'shape') + ticks + t(280, 60, 'SCALE: ' + lab, '') + t(280, 92, '1 in on paper = ' + trim(1 / s, 3) + ' ft real', 's'));
  }
  function figCallout(n, sheet) {
    return svg(560, 220, 'Detail callout ' + n + ' over ' + sheet + ' and a section mark',
      '<circle cx="150" cy="110" r="56" class="bub"/>' + ln(94, 110, 206, 110, 'dim') + t(150, 96, String(n), 'm') + t(150, 140, sheet, 'm') +
      ln(206, 110, 300, 110, 'cl') + t(150, 198, 'DETAIL CALLOUT', 's') +
      '<circle cx="420" cy="110" r="40" class="bub"/>' + ln(380, 110, 460, 110, 'dim') + t(420, 100, 'A', 'm') + t(420, 134, 'A-301', 'm') +
      '<path d="M460,110 L500,110 L490,96 Z" class="ah"/>' + t(420, 198, 'SECTION MARK', 's'));
  }
  function figSlope(H, L, R) {
    return svg(560, 240, 'Driveway profile from the garage slab down to the curb',
      '<polygon points="40,90 520,160 520,210 40,210" class="soil"/>' + ln(40, 90, 520, 160, 'grade') +
      '<circle cx="40" cy="90" r="5" class="ah"/><circle cx="520" cy="160" r="5" class="ah"/>' +
      t(40, 70, fmt(H, 3), 'm', 'start') + t(520, 140, fmt(L, 3), 'm', 'end') +
      dimH(40, 520, 30, 'run ' + trim(R, 2) + ' m') + t(280, 196, 'slope = ?', 'u'));
  }
  function figCut(E, D) {
    var cut = E > D, y1 = 110, y2 = cut ? 160 : 70;
    return svg(560, 230, 'Existing grade and design grade at a building corner',
      rect(40, Math.min(y1, y2), 480, 180 - Math.min(y1, y2), 'soil') + ln(40, y1, 520, y1, 'grade') + ln(40, y2, 520, y2, 'lvl') +
      t(60, y1 - 8, 'existing ' + fmt(E, 3), 'm', 'start') + t(60, y2 + (cut ? 22 : -8), 'design ' + fmt(D, 3), 'm', 'start') +
      dimV(470, Math.min(y1, y2), Math.max(y1, y2), '?', 'unk', 'l'));
  }
  function figLevels(a, b, lab1, lab2, stair) {
    var s = '', n = 8;
    if (stair) for (var i = 0; i < n; i++) s += ln(200 + i * 30, 170 - i * 15, 230 + i * 30, 170 - i * 15, 'grade') + ln(230 + i * 30, 170 - i * 15, 230 + i * 30, 155 - i * 15, 'grade');
    return svg(560, 230, 'Building section with two level datums',
      ln(40, 50, 520, 50, 'lvl') + ln(40, 170, 520, 170, 'lvl') + '<path d="M40,50 l10,-12 l-20,0 z" class="ahu"/><path d="M40,170 l10,-12 l-20,0 z" class="ahu"/>' +
      t(60, 40, lab2 + ' ' + fmt(b, 3), 'm', 'start') + t(60, 160, lab1 + ' ' + fmt(a, 3), 'm', 'start') + s +
      dimV(480, 50, 170, '?', 'unk', 'l'));
  }
  function figFooting(L, W, D) {
    return svg(620, 240, 'Strip footing plan and section',
      rect(40, 70, 300, 30, 'conc') + dimH(40, 340, 52, 'L ' + trim(L, 2) + ' m') + t(190, 130, 'PLAN', 's') +
      rect(400, 100, 120, 60, 'conc') + dimH(400, 520, 82, trim(W, 3) + ' m') + dimV(532, 100, 160, trim(D, 3) + ' m') + t(460, 196, 'SECTION', 's'));
  }
  function figPit(L, W, D) {
    return svg(560, 240, 'Excavation section with bank and loose soil',
      '<polygon points="40,70 140,70 160,190 400,190 420,70 520,70 520,220 40,220" class="soil"/>' + ln(140, 70, 160, 190, 'grade') + ln(400, 190, 420, 70, 'grade') +
      dimH(150, 410, 50, trim(L, 2) + ' m × ' + trim(W, 2) + ' m') + dimV(450, 70, 190, trim(D, 2) + ' m'));
  }
  function figRoom(Lr, Wr, h) {
    return svg(620, 240, 'Room wall elevation with a door and a window opening',
      rect(40, 50, 480, 150, 'shape') + rect(90, 90, 60, 110, 'wall') + rect(300, 90, 90, 60, 'wall') +
      t(120, 80, 'door', 's') + t(345, 80, 'window', 's') + dimV(530, 50, 200, trim(h, 2) + ' m') +
      t(280, 228, 'perimeter 2 × (' + trim(Lr, 2) + ' + ' + trim(Wr, 2) + ') m', 's'));
  }
  function figStuds(L, sp) {
    var s = '';
    for (var i = 0; i <= 10; i++) s += rect(36 + i * 48, 100, 8, 40, 'stud');
    return svg(560, 220, 'Wall plan with studs at regular spacing',
      rect(36, 92, 488, 8, 'shape') + rect(36, 140, 488, 8, 'shape') + s + dimH(40, 88, 76, sp + ' mm o.c.') + dimH(40, 520, 186, 'wall ' + trim(L, 2) + ' m'));
  }
  function figBars(n, len, size) {
    var s = '';
    for (var i = 0; i < 6; i++) s += ln(60, 70 + i * 18, 500, 70 + i * 18, 'bar');
    return svg(560, 220, 'Bundle of reinforcing bars',
      s + dimH(60, 500, 50, size + ' bars, ' + trim(len, 2) + ' m long') + t(280, 196, n + ' bars', 'u'));
  }

  /* ---------- lessons ---------- */
  var MODS = [
    /* ===== Part B: reading drawings ===== */
    { key: 'scale', sec: 'draw', title: 'Metric drawing scales', short: '1:50, 1:100, 1:200 and 1:500, paper to real and back',
      why: '<b>On the job:</b> drawings are smaller than the building by a fixed ratio. At 1:100, 1 mm on paper stands for 100 mm on site. Read the written dimensions first. Scale a drawing only when a dimension is missing, and check that the print is full size, because a reduced print changes every measurement.',
      info: table('Line types you will meet on every sheet', ['Line', 'What it shows'], [
        ['Thick continuous line', 'An edge you can see in that view'], ['Dashed line', 'An edge hidden behind something, or above the cut on a plan'],
        ['Long dash, short dash', 'A centre line: the middle of a wall, column, opening or pipe'], ['Thin line with arrows or ticks and a number', 'A dimension: a measured size'],
        ['Zigzag break line', 'The drawing stops short but the object carries on']]) + '<p class="note">Each office sets its own line weights and symbols. The legend on the cover sheet or the first sheet of each discipline tells you what this set uses.</p>',
      ex: { task: 0, p: { s: 100, paper: 84 } },
      tasks: [
        { chip: 'Paper to real', gen: function (R) { var s = R.pick(METRIC); var hi = { 50: 150, 100: 180, 200: 160, 500: 120 }[s]; return { s: s, paper: R.int(15, hi) }; },
          make: function (p) {
            var mm = p.paper * p.s, m = mm / 1000, x1 = p.paper + ' × ' + p.s, x2 = x1 + ' ÷ 1000';
            return { q: 'On a plan drawn at ' + B('1:' + p.s) + ', a wall measures ' + B(p.paper + ' mm') + ' with your scale rule. How long is the real wall?',
              fig: figWall(p.paper + ' mm on paper', 'SCALE 1:' + p.s), fields: [{ label: 'Real length', unit: 'm', ans: m, dp: 2 }],
              steps: [['1 mm on paper = ' + p.s + ' mm real', x1 + ' = ' + trim(mm, 0) + ' mm'], ['Change millimetres to metres', x2 + ' = ' + trim(m, 3) + ' m']],
              keys: [K('Real length in metres', x2, m)], answer: trim(m, 3) + ' m' };
          } },
        { chip: 'Real to paper', gen: function (R) { var s = R.pick(METRIC); return { s: s, real: s === 50 ? R.dec(1.2, 7.5, 1) : s === 100 ? R.dec(2, 15, 1) : s === 200 ? R.step(4, 30, 0.5) : R.step(10, 60, 1) }; },
          make: function (p) {
            var mm = p.real * 1000, pp = mm / p.s, x2 = kn(p.real) + ' × 1000 ÷ ' + p.s;
            return { q: 'You are drawing a site sketch at ' + B('1:' + p.s) + '. The real wall is ' + B(trim(p.real, 2) + ' m') + ' long. How long do you draw it on the paper?',
              fig: figWall('? mm on paper', 'SCALE 1:' + p.s), fields: [{ label: 'Length on paper', unit: 'mm', ans: pp, dp: 1 }],
              steps: [['Change metres to millimetres', kn(p.real) + ' × 1000 = ' + trim(mm, 0) + ' mm'], ['Divide by the scale', x2 + ' = ' + trim(pp, 2) + ' mm']],
              keys: [K('Length on paper in millimetres', x2, pp)], answer: trim(pp, 2) + ' mm' };
          } }
      ] },
    { key: 'imperial', sec: 'draw', title: 'Imperial architectural scales', short: '1/8″, 3/16″, 1/4″, 1/2″ and 3/4″ to the foot',
      why: '<b>On the job:</b> older drawings, many house plans and US product drawings use an architect\'s scale. At 1/4″ = 1′-0″, a quarter inch on the paper is one foot on site. That is the same ratio as 1:48. A metric 1:50 rule is close, but it is not the same scale.',
      ex: { task: 0, p: { i: 2, x: 3.5 } },
      tasks: [
        { chip: 'Paper inches to feet', gen: function (R) { return { i: R.int(0, IMP.length - 1), x: R.step(1, 9, 0.25) }; },
          make: function (p) {
            var sc = IMP[p.i], ft = p.x / sc.s, x = kn(p.x) + ' ÷ ' + sc.s;
            return { q: 'A drawing is at ' + B(sc.lab) + '. A wall measures ' + B(trim(p.x, 2) + ' in') + ' on the paper. How long is the real wall, in feet?',
              fig: figImp(sc.lab, sc.s), fields: [{ label: 'Real length', unit: 'ft', ans: ft, dp: 2 }],
              steps: [['At ' + sc.lab + ', ' + sc.s + ' in on paper = 1 ft', 'each inch on paper = 1 ÷ ' + sc.s + ' = ' + trim(1 / sc.s, 3) + ' ft'], ['Divide the paper length by the scale', x + ' = ' + trim(ft, 3) + ' ft']],
              keys: [K('Real length in feet', x, ft)], answer: trim(ft, 3) + ' ft' };
          } },
        { chip: 'Scale as a ratio', gen: function (R) { return { i: R.int(0, IMP.length - 1) }; },
          make: function (p) {
            var sc = IMP[p.i], n = 12 / sc.s, x = '12 ÷ ' + sc.s;
            return { q: 'Write the scale ' + B(sc.lab) + ' as a ratio 1 : N. What is N?', fields: [{ label: 'N', unit: '', ans: n, dp: 0, exact: true }],
              steps: [['1 ft = 12 in, so ' + sc.s + ' in on paper stands for 12 in', 'N = 12 ÷ ' + sc.s], ['Divide', x + ' = ' + trim(n, 0) + ', so the ratio is 1:' + trim(n, 0)]],
              keys: [K('N', x, n)], answer: '1:' + trim(n, 0) };
          } }
      ] },
    { key: 'sheets', sec: 'draw', title: 'Sheets, title blocks and callouts', short: 'Find the detail, find the discipline',
      why: '<b>On the job:</b> a drawing set can run to hundreds of sheets. The title block, the sheet number and the callout bubbles are how you move through it without getting lost, and how you name the exact sheet in a question to the consultant.',
      info: '<div class="path-grid info"><div class="card"><h3>What a title block usually holds</h3><ul><li>Project name and address, owner, and the consultant who drew the sheet</li><li>Sheet title and sheet number</li><li>Scale (or "as noted" when views use different scales)</li><li>Date, revision number and revision notes</li><li>Drawn by, checked by, and the professional seal where one is required</li></ul></div>' +
        '<div class="card"><h3>Discipline letters (common practice)</h3><p>Many sets put a letter in front of each sheet number. Check the drawing list on the cover sheet, because offices differ.</p>' +
        '<ul>' + DISC.map(function (d) { return '<li><b>' + d[0] + '</b>: ' + d[1] + '</li>'; }).join('') + '</ul></div></div>' +
        '<p class="note">A <b>detail callout</b> bubble has the detail number on top and the sheet it is drawn on underneath. A <b>section mark</b> works the same way, and its arrow points the way you are looking at the cut.</p>',
      ex: { task: 0, p: { n: 3, d: 'A', sh: 501, o: 7 } },
      tasks: [
        { chip: 'Read a callout', gen: function (R) { return { n: R.int(1, 12), d: R.pick(['A', 'S']), sh: R.int(301, 599), o: R.int(1, 1000) }; },
          make: function (p) {
            var sheet = p.d + '-' + p.sh;
            return { q: 'A detail callout bubble shows ' + B(String(p.n)) + ' above the line and ' + B(sheet) + ' below it. Where is the detail?', fig: figCallout(p.n, sheet),
              pick: { legend: 'Where is the detail?', opts: ['Detail ' + p.n + ', drawn on sheet ' + sheet, 'Detail ' + p.sh + ', drawn on sheet ' + p.d + '-' + p.n, 'Grid line ' + p.n + ' at level ' + p.sh, 'Specification section ' + p.n + ', page ' + p.sh], ans: 0, seed: p.o },
              steps: [['Top half of the bubble', 'the detail number: ' + p.n], ['Bottom half of the bubble', 'the sheet it is drawn on: ' + sheet]], answer: 'Detail ' + p.n + ', drawn on sheet ' + sheet };
          } },
        { chip: 'Which discipline?', gen: function (R) { return { k: R.int(0, DISC.length - 1), sh: R.int(101, 499), o: R.int(1, 1000) }; },
          make: function (p) {
            var d = DISC[p.k], others = DISC.filter(function (x) { return x[0] !== d[0]; }).map(function (x) { return x[1]; });
            return { q: 'The drawing list shows sheet ' + B(d[0] + '-' + p.sh) + '. In a set that uses the common discipline letters, who issues that sheet?',
              pick: { legend: 'Who issues sheet ' + d[0] + '-' + p.sh + '?', opts: [d[1]].concat(rngFor(p.o).shuffle(others).slice(0, 3)), ans: 0, seed: p.o },
              steps: [['Read the letter in front of the number', d[0]], ['Match it to the discipline', d[0] + ' = ' + d[1]]], answer: d[1] };
          } }
      ] },
    { key: 'site', sec: 'draw', title: 'Site plans: slopes, cut and fill', short: 'Spot elevations, slope in percent, dig or fill',
      why: '<b>On the job:</b> site and survey plans show property lines, setbacks, services, and the existing and design grades. Elevations are in metres to three decimals, which is to the millimetre. Two numbers come up every day: the slope between two spot elevations, and how far to dig or fill at a point.',
      ex: { task: 0, p: { L: 100.65, d: 0.6, R: 12 } },
      tasks: [
        { chip: 'Slope in percent', gen: function (R) { return { L: R.dec(99, 100.5, 3), d: R.dec(0.12, 1.2, 2), R: R.step(6, 30, 0.5) }; },
          make: function (p) {
            var H = rnd(p.L + p.d, 3), sl = p.d / p.R * 100, x = '(' + fmt(H, 3) + ' − ' + fmt(p.L, 3) + ') ÷ ' + kn(p.R) + ' × 100';
            return { q: 'Spot elevations on the site plan: garage slab ' + B(fmt(H, 3)) + ', curb ' + B(fmt(p.L, 3)) + '. The driveway runs ' + B(trim(p.R, 2) + ' m') + ' between them. What is its slope?',
              fig: figSlope(H, p.L, p.R), fields: [{ label: 'Slope', unit: '%', ans: sl, dp: 2 }],
              steps: [['Drop = high − low', fmt(H, 3) + ' − ' + fmt(p.L, 3) + ' = ' + fmt(p.d, 3) + ' m'], ['Slope = drop ÷ run × 100 (brackets first)', x + ' = ' + trim(sl, 3) + ' %']],
              keys: [K('Slope in percent', x, sl)], answer: trim(sl, 2) + ' %' };
          } },
        { chip: 'Cut or fill', gen: function (R) { return { E: R.dec(100, 102, 3), dd: R.int(60, 450) * (R.int(0, 1) ? 1 : -1) }; },
          make: function (p) {
            var D = rnd(p.E - p.dd / 1000, 3), mm = (p.E - D) * 1000, cut = mm > 0, x = '(' + fmt(p.E, 3) + ' − ' + fmt(D, 3) + ') × 1000';
            return { q: 'At a building corner, existing grade is ' + B(fmt(p.E, 3)) + ' and design grade is ' + B(fmt(D, 3)) + '. Work out existing − design in millimetres. A positive answer is a cut (dig), a negative answer is a fill.',
              fig: figCut(p.E, D), fields: [{ label: 'Existing − design', unit: 'mm', ans: mm, dp: 0 }],
              steps: [['Existing − design', fmt(p.E, 3) + ' − ' + fmt(D, 3) + ' = ' + fmt(mm / 1000, 3) + ' m'], ['Metres to millimetres', x + ' = ' + trim(mm, 0) + ' mm, a ' + (cut ? 'cut' : 'fill')]],
              keys: [K('Existing − design in millimetres', x, mm)], answer: trim(mm, 0) + ' mm (' + (cut ? 'cut' : 'fill') + ' of ' + trim(Math.abs(mm), 0) + ' mm)' };
          } }
      ] },
    { key: 'levels', sec: 'draw', title: 'Elevations and sections: levels and stairs', short: 'Floor-to-floor heights from level datums, number of risers',
      why: '<b>On the job:</b> building sections and elevations mark each floor with a level datum, such as "Level 2, top of slab 103.150". Subtracting datums gives floor-to-floor heights, which feed stair layout, wall heights and material quantities.',
      ex: { task: 1, p: { rise: 3150, max: 190 } },
      tasks: [
        { chip: 'Floor to floor', gen: function (R) { return { a: R.dec(102.8, 104.5, 3), h: R.int(2750, 4200) }; },
          make: function (p) {
            var b = rnd(p.a + p.h / 1000, 3), mm = (b - p.a) * 1000, x = '(' + fmt(b, 3) + ' − ' + fmt(p.a, 3) + ') × 1000';
            return { q: 'The building section shows Level 2, top of slab ' + B(fmt(p.a, 3)) + ' and Level 3, top of slab ' + B(fmt(b, 3)) + '. What is the floor-to-floor height?',
              fig: figLevels(p.a, b, 'L2 T/O SLAB', 'L3 T/O SLAB'), fields: [{ label: 'Floor-to-floor height', unit: 'mm', ans: mm, dp: 0 }],
              steps: [['Upper level − lower level', fmt(b, 3) + ' − ' + fmt(p.a, 3) + ' = ' + fmt(mm / 1000, 3) + ' m'], ['Metres to millimetres', x + ' = ' + trim(mm, 0) + ' mm']],
              keys: [K('Floor-to-floor in millimetres', x, mm)], answer: trim(mm, 0) + ' mm' };
          } },
        { chip: 'Number of risers', gen: function (R) { return { rise: R.int(2600, 3600), max: R.pick([180, 190, 200]) }; },
          make: function (p) {
            var n = ceil(p.rise / p.max), u = p.rise / n, x1 = p.rise + ' ÷ ' + p.max, x2 = p.rise + ' ÷ ' + n;
            return { q: 'Floor to floor is ' + B(p.rise + ' mm') + '. The stair design for this job limits each riser to ' + B(p.max + ' mm') + ' (job data). What is the fewest number of risers, and the unit rise?',
              fig: figLevels(100, rnd(100 + p.rise / 1000, 3), 'LEVEL 1', 'LEVEL 2', true),
              fields: [{ label: 'Number of risers', unit: 'risers', ans: n, dp: 0, exact: true }, { label: 'Unit rise', unit: 'mm', ans: u, dp: 1 }],
              steps: [['Divide by the biggest riser allowed', x1 + ' = ' + trim(p.rise / p.max, 3)], ['Round up to a whole riser', n + ' risers'], ['Unit rise = total rise ÷ risers', x2 + ' = ' + trim(u, 2) + ' mm']],
              keys: [K('Risers before rounding up', x1, p.rise / p.max), K('Unit rise', x2, u)], answer: n + ' risers at ' + trim(u, 1) + ' mm' };
          } }
      ] },
    { key: 'schedules', sec: 'draw', title: 'Schedules and reflected ceiling plans', short: 'Count doors, total the window area',
      why: '<b>On the job:</b> the plan shows where an item is, the schedule shows what it is. Door, window, finish and fixture schedules list each type with its size and details. A reflected ceiling plan (RCP) shows the ceiling as if you saw it in a mirror on the floor: ceiling heights, grids, lights and diffusers. When a plan and a schedule disagree, send a request for information (RFI) instead of guessing.',
      ex: { task: 1, p: { w: [1200, 900, 1800], h: [1200, 1500, 600], q: [6, 4, 2] } },
      tasks: [
        { chip: 'Door count', gen: function (R) { var q = []; for (var i = 0; i < 4; i++) q.push([R.int(0, 6), R.int(0, 6), R.int(0, 6)]); return { q: q, ty: R.int(0, 3) }; },
          make: function (p) {
            var types = [['A', '915 × 2134'], ['B', '865 × 2134'], ['C', '1830 × 2134 (pair)'], ['D', '815 × 2134']];
            var row = p.q[p.ty], tot = row[0] + row[1] + row[2], L = types[p.ty][0], x = row.join(' + ');
            return { q: 'The door schedule lists each type and how many are on each level. How many type ' + B(L) + ' doors does the supplier need for the whole building?',
              table: table('Door schedule', ['Type', 'Size (mm)', 'Level 1', 'Level 2', 'Level 3'], types.map(function (ty, i) { return [ty[0], ty[1]].concat(p.q[i]); })),
              fields: [{ label: 'Type ' + L + ' doors', unit: 'doors', ans: tot, dp: 0, exact: true }],
              steps: [['Find the type ' + L + ' row', 'Level 1: ' + row[0] + ', Level 2: ' + row[1] + ', Level 3: ' + row[2]], ['Add the levels', x + ' = ' + tot]],
              keys: [K('Total', x, tot)], answer: tot + ' doors' };
          } },
        { chip: 'Window area', gen: function (R) { var w = [], h = [], q = []; for (var i = 0; i < 3; i++) { w.push(R.pick([600, 900, 1200, 1500, 1800])); h.push(R.pick([600, 750, 900, 1200, 1500])); q.push(R.int(1, 8)); } return { w: w, h: h, q: q }; },
          make: function (p) {
            var a = 0, rows = [], parts = [];
            for (var i = 0; i < 3; i++) { a += p.w[i] * p.h[i] * p.q[i]; rows.push(['W' + (i + 1), p.w[i], p.h[i], p.q[i]]); parts.push(p.w[i] + ' × ' + p.h[i] + ' × ' + p.q[i]); }
            var m2 = a / 1e6, sum = parts.join(' + '), x = '(' + sum + ') ÷ 1000000';
            return { q: 'Use the window schedule to find the total window area (width × height) for the building, in square metres.',
              table: table('Window schedule', ['Type', 'Width (mm)', 'Height (mm)', 'Quantity'], rows), fields: [{ label: 'Total window area', unit: 'm²', ans: m2, dp: 2 }],
              steps: [['Area of each type = width × height × quantity, all in mm²', sum + ' = ' + trim(a, 0) + ' mm²'], ['Multiply before you add (BEDMAS), then mm² to m²: divide by 1 000 000', x + ' = ' + trim(m2, 4) + ' m²']],
              keys: [K('Total area in m²', x, m2)], answer: trim(m2, 2) + ' m²' };
          } }
      ] },
    { key: 'masterformat', sec: 'draw', title: 'Specifications and MasterFormat', short: 'Division numbers and section titles in the project manual',
      why: '<b>On the job:</b> the drawings show where and how much, the specifications say what quality and which products. Together with the contract they make up the contract documents. Specifications in the project manual are filed by MasterFormat number, so the concrete spec is always in Division 03 and the paint spec in Division 09, on every project.',
      info: '<div class="card info"><h3>MasterFormat divisions you will use most</h3><p>A number such as <b>03 30 00</b> reads as division 03, Concrete, section Cast-in-Place Concrete. Divisions 00 and 01 cover procurement and the general requirements that apply to every trade.</p><ul class="mf">' +
        MF_DIV.map(function (d) { return '<li><b>' + d[0] + '</b>' + d[1] + '</li>'; }).join('') + '</ul></div>',
      ex: { task: 0, p: { k: 11, o: 5 } },
      tasks: [
        { chip: 'Which division?', gen: function (R) { return { k: R.int(0, MF_SEC.length - 1), o: R.int(1, 1000) }; },
          make: function (p) {
            var sec = MF_SEC[p.k], code = sec[0].slice(0, 2), right = code + ' ' + divTitle(code);
            var others = MF_DIV.filter(function (d) { return d[0] !== code; }).map(function (d) { return d[0] + ' ' + d[1]; });
            return { q: 'Specification section ' + B(sec[0] + ' ' + sec[1]) + ' is filed in which division of the project manual?',
              pick: { legend: 'Division for ' + sec[0], opts: [right].concat(rngFor(p.o).shuffle(others).slice(0, 3)), ans: 0, seed: p.o },
              steps: [['The first two digits are the division', sec[0] + ' starts with ' + code], ['Match the division title', right]], answer: 'Division ' + right };
          } },
        { chip: 'Find the section', gen: function (R) { return { k: R.int(0, MF_SEC.length - 1), o: R.int(1, 1000) }; },
          make: function (p) {
            var sec = MF_SEC[p.k], others = MF_SEC.filter(function (s) { return s[0] !== sec[0]; }).map(function (s) { return s[0]; });
            return { q: 'You need the specification for ' + B(sec[1]) + '. Which MasterFormat section number do you look up?',
              pick: { legend: 'Section number for ' + sec[1], opts: [sec[0]].concat(rngFor(p.o).shuffle(others).slice(0, 3)), ans: 0, seed: p.o },
              steps: [['Think of the division first', sec[1] + ' belongs to Division ' + sec[0].slice(0, 2) + ' ' + divTitle(sec[0].slice(0, 2))], ['The section in that division', sec[0] + ' ' + sec[1]]], answer: sec[0] + ' ' + sec[1] };
          } }
      ] },

    /* ===== Part C: estimating ===== */
    { key: 'concrete', sec: 'est', title: 'Concrete: footings and slabs', short: 'Volume in m³, waste allowance, round up to the supplier\'s step',
      why: '<b>On the job:</b> concrete is ordered by the cubic metre and a short load stops the pour. Work out the neat volume from the drawings, add the waste allowance the job uses, then round up to the step the supplier sells in. Keep every size in metres before you multiply.',
      ex: { task: 0, p: { L: 24, W: 0.6, D: 0.3, w: 5, inc: 0.5 } },
      tasks: [
        { chip: 'Strip footing', gen: function (R) { return { L: R.step(12, 60, 0.5), W: R.pick([0.4, 0.45, 0.5, 0.6]), D: R.pick([0.2, 0.25, 0.3]), w: R.pick([3, 5, 8, 10]), inc: R.pick([0.25, 0.5]) }; },
          make: function (p) {
            var v = p.L * p.W * p.D, vw = v * (1 + p.w / 100), st = ceil(vw / p.inc), o = st * p.inc, f = kn(1 + p.w / 100);
            var xv = kn(p.L) + ' × ' + kn(p.W) + ' × ' + kn(p.D), xw = xv + ' × ' + f, xs = xw + ' ÷ ' + p.inc;
            return { q: 'A strip footing is ' + B(trim(p.L, 2) + ' m') + ' long, ' + B(trim(p.W, 3) + ' m') + ' wide and ' + B(trim(p.D, 3) + ' m') + ' deep. Job data: add ' + B(p.w + '%') + ' waste, and the supplier sells in steps of ' + B(trim(p.inc, 2) + ' m³') + '. Find the neat volume and the amount to order.',
              fig: figFooting(p.L, p.W, p.D), fields: [{ label: 'Neat volume', unit: 'm³', ans: v, dp: 2 }, { label: 'Order', unit: 'm³', ans: o, dp: 2 }],
              steps: [['Volume = length × width × depth', xv + ' = ' + trim(v, 4) + ' m³'], ['Add the waste: × ' + f, xw + ' = ' + trim(vw, 4) + ' m³'], ['Divide by the ' + trim(p.inc, 2) + ' m³ step and round up', xs + ' = ' + trim(vw / p.inc, 3) + ', up to ' + st + ' steps = ' + fmt(o, 2) + ' m³']],
              keys: [K('Neat volume', xv, v), K('Volume with waste, in supplier steps', xs, vw / p.inc)],
              answer: 'Neat ' + trim(v, 3) + ' m³, order ' + fmt(o, 2) + ' m³' };
          } },
        { chip: 'Slab on grade', gen: function (R) { return { L: R.step(6, 20, 0.5), W: R.step(4, 12, 0.5), T: R.pick([100, 125, 150]), w: R.pick([3, 5, 8, 10]), inc: R.pick([0.25, 0.5]) }; },
          make: function (p) {
            var vw = p.L * p.W * p.T / 1000 * (1 + p.w / 100), st = ceil(vw / p.inc), o = st * p.inc, f = kn(1 + p.w / 100);
            var xs = kn(p.L) + ' × ' + kn(p.W) + ' × ' + p.T + ' ÷ 1000 × ' + f + ' ÷ ' + p.inc;
            return { q: 'A slab is ' + B(trim(p.L, 2) + ' m × ' + trim(p.W, 2) + ' m') + ' and ' + B(p.T + ' mm') + ' thick. Job data: add ' + B(p.w + '%') + ' waste, and the supplier sells in steps of ' + B(trim(p.inc, 2) + ' m³') + '. How much do you order?',
              fields: [{ label: 'Order', unit: 'm³', ans: o, dp: 2 }],
              steps: [['Thickness in metres', p.T + ' ÷ 1000 = ' + trim(p.T / 1000, 3) + ' m'], ['Volume with waste, in supplier steps', xs + ' = ' + trim(vw / p.inc, 3)], ['Round up to whole steps', st + ' × ' + p.inc + ' = ' + fmt(o, 2) + ' m³']],
              keys: [K('Volume with waste, in supplier steps', xs, vw / p.inc)], answer: 'Order ' + fmt(o, 2) + ' m³' };
          } }
      ] },
    { key: 'excavation', sec: 'est', title: 'Excavation: bank volume, swell and truckloads', short: 'Soil in the ground versus soil on the truck',
      why: '<b>On the job:</b> soil measured in the ground is bank volume. Once it is dug it loosens and takes more room, which is called swell. Trucking is priced on loose volume, so the swell allowance (job data here, because it depends on the soil) changes how many loads you book.',
      ex: { task: 0, p: { L: 12, W: 9, D: 2.4, sw: 25, tr: 10 } },
      tasks: [
        { chip: 'Basement dig', gen: function (R) { return { L: R.step(8, 20, 0.5), W: R.step(6, 14, 0.5), D: R.dec(1.2, 3, 1), sw: R.pick([15, 20, 25, 30]), tr: R.pick([8, 10, 12]) }; },
          make: function (p) {
            var b = p.L * p.W * p.D, l = b * (1 + p.sw / 100), n = ceil(l / p.tr), f = kn(1 + p.sw / 100);
            var xb = kn(p.L) + ' × ' + kn(p.W) + ' × ' + kn(p.D), xl = xb + ' × ' + f, xn = xl + ' ÷ ' + p.tr;
            return { q: 'A basement excavation is ' + B(trim(p.L, 2) + ' m × ' + trim(p.W, 2) + ' m') + ' and ' + B(trim(p.D, 2) + ' m') + ' deep (ignore the side slopes). Job data: swell ' + B(p.sw + '%') + ', trucks carry ' + B(p.tr + ' m³') + ' loose. Find the bank volume, the loose volume and the number of loads.',
              fig: figPit(p.L, p.W, p.D), fields: [{ label: 'Bank volume', unit: 'm³', ans: b, dp: 1 }, { label: 'Loose volume', unit: 'm³', ans: l, dp: 1 }, { label: 'Truckloads', unit: 'loads', ans: n, dp: 0, exact: true }],
              steps: [['Bank = length × width × depth', xb + ' = ' + trim(b, 3) + ' m³'], ['Loose = bank × ' + f, xl + ' = ' + trim(l, 3) + ' m³'], ['Loads = loose ÷ truck, rounded up', xn + ' = ' + trim(l / p.tr, 3) + ', so ' + n + ' loads']],
              keys: [K('Bank volume', xb, b), K('Loose volume', xl, l), K('Loads before rounding up', xn, l / p.tr)],
              answer: 'Bank ' + trim(b, 1) + ' m³, loose ' + trim(l, 1) + ' m³, ' + n + ' loads' };
          } },
        { chip: 'Service trench', gen: function (R) { return { L: R.step(15, 80, 1), W: R.pick([450, 600, 750, 900]), D: R.dec(0.9, 1.8, 1), sw: R.pick([15, 20, 25, 30]), tr: R.pick([8, 10, 12]) }; },
          make: function (p) {
            var l = p.L * p.W / 1000 * p.D * (1 + p.sw / 100), n = ceil(l / p.tr), f = kn(1 + p.sw / 100);
            var xl = kn(p.L) + ' × ' + p.W + ' ÷ 1000 × ' + kn(p.D) + ' × ' + f, xn = xl + ' ÷ ' + p.tr;
            return { q: 'A water service trench is ' + B(trim(p.L, 0) + ' m') + ' long, ' + B(p.W + ' mm') + ' wide and ' + B(trim(p.D, 2) + ' m') + ' deep. Job data: swell ' + B(p.sw + '%') + ', trucks carry ' + B(p.tr + ' m³') + '. Find the loose volume and the number of loads to haul it all away.',
              fields: [{ label: 'Loose volume', unit: 'm³', ans: l, dp: 1 }, { label: 'Truckloads', unit: 'loads', ans: n, dp: 0, exact: true }],
              steps: [['Width in metres', p.W + ' ÷ 1000 = ' + trim(p.W / 1000, 3) + ' m'], ['Loose = length × width × depth × ' + f, xl + ' = ' + trim(l, 3) + ' m³'], ['Loads, rounded up', xn + ' = ' + trim(l / p.tr, 3) + ', so ' + n + ' loads']],
              keys: [K('Loose volume', xl, l), K('Loads before rounding up', xn, l / p.tr)],
              answer: 'Loose ' + trim(l, 1) + ' m³, ' + n + ' loads' };
          } }
      ] },
    { key: 'drywall', sec: 'est', title: 'Wall area and drywall sheets', short: 'Gross area, deduct openings, add waste, count sheets',
      why: '<b>On the job:</b> wall finishes are measured by area. Take the gross wall area, deduct the openings, add the waste allowance, then divide by the area of one sheet. A ' + SHEET_W + ' m × ' + SHEET_H + ' m sheet covers ' + SHEET_W + ' × ' + SHEET_H + ' = ' + kn(SHEET) + ' m². Sheets come whole, so always round up.',
      ex: { task: 0, p: { Lr: 4.8, Wr: 3.6, h: 2.44, nd: 1, nw: 1, ww: 1.2, wh: 1.2, w: 10 } },
      tasks: [
        { chip: 'One room, one face', gen: function (R) { return { Lr: R.dec(3, 7, 1), Wr: R.dec(2.8, 6, 1), h: R.pick([2.44, 2.74]), nd: R.int(1, 2), nw: R.int(0, 2), ww: R.pick([0.9, 1.2, 1.5]), wh: R.pick([0.9, 1.2]), w: R.pick([5, 10, 15]) }; },
          make: function (p) {
            var g = 2 * (p.Lr + p.Wr) * p.h, op = p.nd * DOOR_W * DOOR_H + p.nw * p.ww * p.wh, net = g - op, f = kn(1 + p.w / 100), s = ceil(net * (1 + p.w / 100) / SHEET);
            var xd = p.nd + ' × ' + DOOR_W + ' × ' + DOOR_H, xw = p.nw + ' × ' + p.ww + ' × ' + p.wh, xg = '2 × (' + kn(p.Lr) + ' + ' + kn(p.Wr) + ') × ' + p.h;
            var xnet = xg + ' − ' + xd + (p.nw ? ' − ' + xw : ''), netR = rnd(net, 4), xs = kn(netR) + ' × ' + f + ' ÷ ' + kn(SHEET);
            return { q: 'A room is ' + B(trim(p.Lr, 2) + ' m × ' + trim(p.Wr, 2) + ' m') + ' with walls ' + B(trim(p.h, 2) + ' m') + ' high. It has ' + B(p.nd + ' door opening' + (p.nd > 1 ? 's' : '')) + ' of ' + trim(DOOR_W * 1000, 0) + ' × ' + trim(DOOR_H * 1000, 0) + ' mm' + (p.nw ? ' and ' + B(p.nw + ' window' + (p.nw > 1 ? 's' : '')) + ' of ' + trim(p.ww * 1000, 0) + ' × ' + trim(p.wh * 1000, 0) + ' mm' : '') + '. Board the inside of the walls only, one layer. Job data: ' + B(p.w + '%') + ' waste, ' + SHEET_W + ' × ' + SHEET_H + ' m sheets.',
              fig: figRoom(p.Lr, p.Wr, p.h), fields: [{ label: 'Net wall area', unit: 'm²', ans: net, dp: 2 }, { label: 'Sheets', unit: 'sheets', ans: s, dp: 0, exact: true }],
              steps: [['Gross = perimeter × height (brackets first)', xg + ' = ' + trim(g, 4) + ' m²'], ['Openings', xd + (p.nw ? ' + ' + xw : '') + ' = ' + trim(op, 4) + ' m²'], ['Net = gross − openings (multiply before you subtract)', xnet + ' = ' + trim(net, 4) + ' m²'], ['Sheets = net × ' + f + ' ÷ ' + kn(SHEET) + ', rounded up', xs + ' = ' + trim(net * (1 + p.w / 100) / SHEET, 3) + ', so ' + s + ' sheets']],
              keys: [K('Net wall area', xnet, net), K('Sheets before rounding up', xs, netR * (1 + p.w / 100) / SHEET)],
              answer: 'Net ' + trim(net, 2) + ' m², ' + s + ' sheets' };
          } },
        { chip: 'Partition, both faces', gen: function (R) { return { L: R.dec(3, 12, 1), h: R.pick([2.44, 2.74, 3.05]), nd: R.int(1, 3), w: R.pick([5, 10, 15]) }; },
          make: function (p) {
            var net = 2 * (p.L * p.h - p.nd * DOOR_W * DOOR_H), f = kn(1 + p.w / 100), s = ceil(net * (1 + p.w / 100) / SHEET);
            var x1 = kn(p.L) + ' × ' + p.h + ' − ' + p.nd + ' × ' + DOOR_W + ' × ' + DOOR_H, xnet = '2 × (' + x1 + ')', netR = rnd(net, 4), xs = kn(netR) + ' × ' + f + ' ÷ ' + kn(SHEET);
            return { q: 'A partition wall is ' + B(trim(p.L, 2) + ' m') + ' long and ' + B(trim(p.h, 2) + ' m') + ' high with ' + B(p.nd + ' door opening' + (p.nd > 1 ? 's' : '')) + ' of ' + trim(DOOR_W * 1000, 0) + ' × ' + trim(DOOR_H * 1000, 0) + ' mm. It is boarded on both faces, one layer each. Job data: ' + B(p.w + '%') + ' waste, ' + SHEET_W + ' × ' + SHEET_H + ' m sheets.',
              fields: [{ label: 'Net area, both faces', unit: 'm²', ans: net, dp: 2 }, { label: 'Sheets', unit: 'sheets', ans: s, dp: 0, exact: true }],
              steps: [['One face = wall − doors', x1 + ' = ' + trim(net / 2, 4) + ' m²'], ['Both faces', xnet + ' = ' + trim(net, 4) + ' m²'], ['Sheets, rounded up', xs + ' = ' + trim(net * (1 + p.w / 100) / SHEET, 3) + ', so ' + s]],
              keys: [K('Net area, both faces', xnet, net), K('Sheets before rounding up', xs, netR * (1 + p.w / 100) / SHEET)],
              answer: 'Net ' + trim(net, 2) + ' m², ' + s + ' sheets' };
          } }
      ] },
    { key: 'framing', sec: 'est', title: 'Wall framing: studs and plates', short: 'Studs at a set spacing, plus the extras from the framing plan',
      why: '<b>On the job:</b> studs are counted from the wall length and the spacing on the drawings, then the extras for corners, openings and backing are added from the framing plan. Plates are counted in metres. The spacing, the extras and the number of plates are job data here.',
      ex: { task: 0, p: { L: 7.2, sp: 400, ex: 6 } },
      tasks: [
        { chip: 'Studs and plates', gen: function (R) { return { L: R.dec(2.4, 12, 1), sp: R.pick([400, 600]), ex: R.int(2, 10) }; },
          make: function (p) {
            var sp = p.L * 1000 / p.sp, n = ceil(sp) + 1 + p.ex, pl = 3 * p.L, x1 = kn(p.L) + ' × 1000 ÷ ' + p.sp, x2 = '3 × ' + kn(p.L);
            return { q: 'A wall is ' + B(trim(p.L, 2) + ' m') + ' long. Job data: studs at ' + B(p.sp + ' mm') + ' on centre, one stud at each end, plus ' + B(p.ex + ' extra studs') + ' for openings and corners from the framing plan, one bottom plate and a double top plate. Find the stud count and the plate length.',
              fig: figStuds(p.L, p.sp), fields: [{ label: 'Studs', unit: 'studs', ans: n, dp: 0, exact: true }, { label: 'Plates', unit: 'm', ans: pl, dp: 2 }],
              steps: [['Spaces = wall length in mm ÷ spacing, rounded up', x1 + ' = ' + trim(sp, 3) + ', so ' + ceil(sp) + ' spaces'], ['Studs = spaces + 1 + extras', ceil(sp) + ' + 1 + ' + p.ex + ' = ' + n], ['Plates = 3 × wall length', x2 + ' = ' + trim(pl, 2) + ' m']],
              keys: [K('Spaces before rounding up', x1, sp), K('Plate length', x2, pl)],
              answer: n + ' studs, ' + trim(pl, 2) + ' m of plate' };
          } }
      ] },
    { key: 'rebar', sec: 'est', title: 'Reinforcing steel by mass', short: 'Metres of bar to kilograms and tonnes',
      why: '<b>On the job:</b> reinforcing steel is priced and delivered by mass. Total the metres of each bar size from the drawings, then multiply by the mass per metre for that size. Canadian bars follow CSA G30.18: ' + Object.keys(BARS).map(function (k) { return k + ' ' + bar(k) + ' kg/m'; }).join(', ') + '.',
      ex: { task: 0, p: { n: 12, len: 6, b: '15M' } },
      tasks: [
        { chip: 'One bar size', gen: function (R) { return { n: R.int(8, 60), len: R.pick([3, 4.5, 6, 9, 12]), b: R.pick(Object.keys(BARS)) }; },
          make: function (p) {
            var m = p.n * p.len, kg = m * BARS[p.b], xm = p.n + ' × ' + kn(p.len), xk = xm + ' × ' + bar(p.b);
            return { q: 'The bar list calls for ' + B(p.n + ' bars of ' + p.b) + ', each ' + B(trim(p.len, 2) + ' m') + ' long. Find the total length and the mass.',
              fig: figBars(p.n, p.len, p.b), fields: [{ label: 'Total length', unit: 'm', ans: m, dp: 1 }, { label: 'Mass', unit: 'kg', ans: kg, dp: 1 }],
              steps: [['Total length = bars × length', xm + ' = ' + trim(m, 2) + ' m'], ['Mass = length × ' + p.b + ' mass per metre', xk + ' = ' + trim(kg, 3) + ' kg']],
              keys: [K('Mass in kilograms', xk, kg)], answer: trim(m, 2) + ' m, ' + trim(kg, 1) + ' kg' };
          } },
        { chip: 'Two sizes, in tonnes', gen: function (R) { return { n1: R.int(10, 80), l1: R.pick([4.5, 6, 9, 12]), n2: R.int(10, 80), l2: R.pick([3, 4.5, 6]) }; },
          make: function (p) {
            var k1 = p.n1 * p.l1 * BARS['15M'], k2 = p.n2 * p.l2 * BARS['10M'], tn = (k1 + k2) / 1000;
            var x1 = p.n1 + ' × ' + kn(p.l1) + ' × ' + bar('15M'), x2 = p.n2 + ' × ' + kn(p.l2) + ' × ' + bar('10M'), x = '(' + x1 + ' + ' + x2 + ') ÷ 1000';
            return { q: 'A footing needs ' + B(p.n1 + ' bars of 15M') + ' at ' + B(trim(p.l1, 2) + ' m') + ' and ' + B(p.n2 + ' bars of 10M') + ' at ' + B(trim(p.l2, 2) + ' m') + '. What is the total mass in tonnes?',
              fields: [{ label: 'Total mass', unit: 't', ans: tn, dp: 3 }],
              steps: [['15M mass', x1 + ' = ' + trim(k1, 3) + ' kg'], ['10M mass', x2 + ' = ' + trim(k2, 3) + ' kg'], ['Add, then kilograms to tonnes (multiply before you add)', x + ' = ' + trim(tn, 4) + ' t']],
              keys: [K('Total in tonnes', x, tn)], answer: trim(tn, 3) + ' t' };
          } }
      ] },
    { key: 'pricing', sec: 'est', title: 'Pricing: extensions, overhead, profit and GST', short: 'Quantity × price, labour hours × rate, markups',
      why: '<b>On the job:</b> each quantity is "extended" by multiplying it by its price. Labour is quantity × hours per unit × hourly rate. The direct costs are then marked up for overhead and profit the way the company prices its work, and GST (' + GST * 100 + '% in British Columbia) goes on the price to the client. All prices, rates and markups here are job data made up for practice.',
      ex: { task: 0, p: { q: 4.5, up: 260, hpu: 1.2, rate: 48 } },
      tasks: [
        { chip: 'Material and labour', gen: function (R) { return { q: R.step(3, 20, 0.5), up: R.int(220, 320), hpu: R.pick([0.8, 1, 1.2, 1.5]), rate: R.int(42, 68) }; },
          make: function (p) {
            var mat = p.q * p.up, lab = p.q * p.hpu * p.rate, xm = kn(p.q) + ' × ' + p.up, xl = kn(p.q) + ' × ' + kn(p.hpu) + ' × ' + p.rate;
            return { q: 'Price ' + B(trim(p.q, 2) + ' m³') + ' of concrete at ' + B(money(p.up) + '/m³') + '. Placing takes ' + B(trim(p.hpu, 2) + ' crew-hours per m³') + ' at ' + B(money(p.rate) + '/h') + '. Find the material cost and the labour cost.',
              fields: [{ label: 'Material', unit: '$', ans: mat, dp: 2 }, { label: 'Labour', unit: '$', ans: lab, dp: 2 }],
              steps: [['Material = quantity × unit price', xm + ' = ' + money(mat)], ['Labour = quantity × hours per unit × rate', xl + ' = ' + money(lab)]],
              keys: [K('Material', xm, mat), K('Labour', xl, lab)], answer: 'Material ' + money(mat) + ', labour ' + money(lab) };
          } },
        { chip: 'Markups and GST', gen: function (R) { return { d: R.int(160, 1200) * 50, oh: R.pick([8, 10, 12, 15]), pr: R.pick([5, 8, 10]) }; },
          make: function (p) {
            var o = p.d * p.oh / 100, base = p.d + o, pf = base * p.pr / 100, tot = base + pf, gst = tot * GST, all = tot + gst;
            var x1 = p.d + ' × ' + kn(1 + p.oh / 100) + ' × ' + kn(1 + p.pr / 100), x2 = x1 + ' × ' + kn(1 + GST);
            return { q: 'Direct costs total ' + B(money(p.d)) + '. Job data: this company adds ' + B(p.oh + '% overhead') + ' on direct costs, then ' + B(p.pr + '% profit') + ' on direct costs plus overhead. Then add ' + GST * 100 + '% GST. Find the price before GST and the price with GST.',
              fields: [{ label: 'Price before GST', unit: '$', ans: tot, dp: 2 }, { label: 'Price with GST', unit: '$', ans: all, dp: 2 }],
              steps: [['Overhead', money(p.d) + ' × ' + p.oh + '% = ' + money(o) + ', running total ' + money(base)], ['Profit on cost plus overhead', money(base) + ' × ' + p.pr + '% = ' + money(pf) + ', price before GST ' + money(tot)], ['GST at ' + GST * 100 + '%', money(tot) + ' × ' + GST * 100 + '% = ' + money(gst) + ', price with GST ' + money(all)], ['The same in one line on the calculator', x2 + ' = ' + money(all)]],
              keys: [K('Price before GST', x1, tot), K('Price with GST', x2, all)],
              answer: 'Before GST ' + money(tot) + ', with GST ' + money(all) };
          } }
      ] },
    { key: 'yards', sec: 'est', title: 'Cubic metres and cubic yards', short: 'Convert volumes both ways',
      why: '<b>On the job:</b> Canadian drawings and suppliers work in cubic metres, but you will still meet cubic yards on older quotes, US equipment specifications and some aggregate pricing. 1 yard is exactly 0.9144 m, so 1 cubic yard = ' + YD3 + ' m³.',
      ex: { task: 0, p: { v: 7.5 } },
      tasks: [
        { chip: 'm³ to yd³', gen: function (R) { return { v: R.step(2, 40, 0.5) }; },
          make: function (p) {
            var y = p.v / YD3, x = kn(p.v) + ' ÷ ' + YD3;
            return { q: 'A pour needs ' + B(trim(p.v, 2) + ' m³') + '. The supplier quotes in cubic yards. How many cubic yards is that?', fields: [{ label: 'Volume', unit: 'yd³', ans: y, dp: 2 }],
              steps: [['Each cubic yard is ' + YD3 + ' m³, so divide', x + ' = ' + trim(y, 3) + ' yd³']], keys: [K('Cubic yards', x, y)], answer: trim(y, 2) + ' yd³' };
          } },
        { chip: 'yd³ to m³', gen: function (R) { return { y: R.int(2, 30) }; },
          make: function (p) {
            var v = p.y * YD3, x = p.y + ' × ' + YD3;
            return { q: 'An older quote lists ' + B(p.y + ' yd³') + ' of drain rock. How many cubic metres is that?', fields: [{ label: 'Volume', unit: 'm³', ans: v, dp: 2 }],
              steps: [['Multiply by ' + YD3, x + ' = ' + trim(v, 3) + ' m³']], keys: [K('Cubic metres', x, v)], answer: trim(v, 2) + ' m³' };
          } }
      ] }
  ];

  /* ---------- rendering ---------- */
  var TASKS = [], keyOn = false;
  function stepsHtml(st) {
    return '<ol class="steps">' + st.map(function (s, i) { return '<li><span class="sn">Step ' + (i + 1) + '</span><span class="st">' + s[0] + '</span><span class="sm">' + s[1] + '</span></li>'; }).join('') + '</ol>';
  }
  function keysHtml(k) { var rows = (k || []).filter(function (r) { return r.seq; }); return rows.length && TIK ? TIK.html(rows) : ''; }
  function solHtml(c) { return stepsHtml(c.steps) + keysHtml(c.keys) + '<p class="ans-key">Answer: <span>' + c.answer + '</span></p>'; }
  function exampleHtml(m) {
    var c = m.tasks[m.ex.task].make(m.ex.p), art = c.fig ? fig(c.fig) : (c.table || '');
    return '<div class="example">' + (art ? '<div class="ex-art">' + art + '</div>' : '') + '<div class="ex-body"><h3>Worked example</h3><p class="eq">' + c.q + '</p>' + solHtml(c) + '</div></div>';
  }
  function pickOrder(pk) { return rngFor(pk.seed * 7 + 3).shuffle(pk.opts.map(function (_, i) { return i; })); }
  function taskBody(T) {
    var c = T.c, h = '<p class="q">' + c.q + '</p>' + (c.fig ? fig(c.fig) : '') + (c.table || '');
    (c.fields || []).forEach(function (f, i) {
      var id = T.id + '-f' + i;
      h += '<div class="field-row"><label for="' + id + '">' + f.label + '</label><div class="field"><input id="' + id + '" inputmode="decimal" autocomplete="off" spellcheck="false">' + (f.unit ? '<span class="unit">' + f.unit + '</span>' : '') + '</div></div>';
    });
    if (c.pick) h += '<fieldset class="choice"><legend>' + c.pick.legend + '</legend>' + pickOrder(c.pick).map(function (oi) {
      return '<label class="opt"><input type="radio" name="' + T.id + '-pick" value="' + oi + '"><span>' + c.pick.opts[oi] + '</span></label>';
    }).join('') + '</fieldset>';
    return h;
  }
  function build(T) {
    if (S.seeds[T.id] == null) S.seeds[T.id] = freshSeed();
    var p = T.def.gen(rngFor(S.seeds[T.id]));
    T.c = T.def.make(p);
    T.body.innerHTML = taskBody(T);
    T.sol.innerHTML = solHtml(T.c);
    clearFb(T);
  }
  function setFb(el, cls, text) { el.className = 'fb' + (cls ? ' ' + cls : ''); el.textContent = text; }
  function clearFb(T) { setFb(T.fb, '', ''); }
  function showSol(T, open) { T.sol.hidden = !open; T.show.setAttribute('aria-expanded', String(open)); T.show.textContent = open ? 'Hide answer' : 'Show answer'; }

  /* A field is checked like a Carpentry answer. The tolerance is half a unit in the last place asked for, widened to
     0.05% of the answer (0.002% for money) so a learner who rounds along the way is not marked wrong. */
  function fieldSol(f) {
    var tol = Math.max(0.5 * Math.pow(10, -f.dp) + 1e-9, Math.abs(f.ans) * (f.unit === '$' ? 0.00002 : 0.0005));
    return f.exact ? { kind: 'int', ans: f.ans, tol: 1e-9 } : { kind: 'num', ans: nudge(f.ans), tol: tol };
  }
  function checkTask(T) {
    var c = T.c, bad = [], hint = '';
    (c.fields || []).forEach(function (f, i) {
      var r = check(fieldSol(f), T.el.querySelector('#' + T.id + '-f' + i).value);
      if (r.res === 'wrong') bad.push(f.label);
      else if (r.res === 'hint' && !hint) hint = r.msg;
    });
    if (c.pick) {
      var sel = T.el.querySelector('input[name="' + T.id + '-pick"]:checked');
      if (!sel) hint = hint || 'Choose one answer, then check.';
      else if (Number(sel.value) !== c.pick.ans) bad.push('your choice');
    }
    if (bad.length) setFb(T.fb, 'no', 'Not yet. Check ' + bad.join(', ') + '. Work the steps again, or press Show answer.');
    else if (hint) setFb(T.fb, 'hint', hint);
    else { setFb(T.fb, 'ok', 'Right. ' + c.answer.replace(/<[^>]+>/g, '')); S.done[T.id] = true; save(); mark(T); meter(); }
  }
  function mark(T) { var on = !!S.done[T.id]; T.el.classList.toggle('is-right', on); T.done.hidden = !on; }
  function meter() {
    var n = TASKS.filter(function (T) { return S.done[T.id]; }).length;
    doc.getElementById('prog-n').textContent = n;
    doc.getElementById('prog-total').textContent = TASKS.length;
    doc.getElementById('prog-fill').style.width = (TASKS.length ? n / TASKS.length * 100 : 0) + '%';
  }
  function idxItem(href, n, title, sub) { return '<li><a href="' + href + '"><span class="n">' + n + '</span><span class="t">' + title + '</span><span class="p">' + sub + '</span></a></li>'; }

  function renderModules() {
    var idx = doc.getElementById('idx'), items = [idxItem('#getting-in', 'A', 'Getting in', 'The Red Seal route to the BTech CM, checklist and GPA tools')];
    MODS.forEach(function (m, mi) {
      var num = mi + 1, sec = doc.createElement('section');
      sec.className = 'mod'; sec.id = 'm-' + m.key; sec.setAttribute('aria-labelledby', 'm-' + m.key + '-h');
      sec.innerHTML = '<div class="mod-head"><p class="eyebrow">Lesson ' + num + (m.sec === 'draw' ? ' · Reading drawings' : ' · Estimating') + '</p><h2 id="m-' + m.key + '-h">' + m.title + '</h2><p class="why">' + m.why + '</p></div>' +
        (m.info || '') + exampleHtml(m) + '<h3 class="tasks-h">Your turn</h3><div class="tasks"></div>';
      doc.getElementById(m.sec === 'draw' ? 'mods-draw' : 'mods-est').appendChild(sec);
      items.push(idxItem('#m-' + m.key, num, m.title, m.short));
      var box = sec.querySelector('.tasks');
      m.tasks.forEach(function (def, i) {
        var id = 'co-' + m.key + '-' + (i + 1), el = doc.createElement('article');
        el.className = 'task'; el.id = id;
        el.innerHTML = '<div class="t-head"><span class="t-id">Task ' + num + '.' + (i + 1) + '</span><span class="chip">' + def.chip + '</span><span class="done" hidden>Right</span></div>' +
          '<div class="t-body"></div><div class="t-btns"><button type="button" class="btn primary b-check">Check</button><button type="button" class="btn b-new">New numbers</button><button type="button" class="btn b-show" aria-expanded="false" aria-controls="' + id + '-sol">Show answer</button></div>' +
          '<p class="fb" role="status" aria-live="polite"></p><div class="sol" id="' + id + '-sol" hidden></div>';
        box.appendChild(el);
        var T = { id: id, def: def, el: el, body: el.querySelector('.t-body'), sol: el.querySelector('.sol'), fb: el.querySelector('.fb'), show: el.querySelector('.b-show'), done: el.querySelector('.done') };
        TASKS.push(T);
        build(T); mark(T);
        el.querySelector('.b-check').addEventListener('click', function () { checkTask(T); });
        el.querySelector('.b-new').addEventListener('click', function () { S.seeds[T.id] = freshSeed(); save(); build(T); showSol(T, keyOn); });
        T.show.addEventListener('click', function () { showSol(T, T.sol.hidden); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio') { e.preventDefault(); checkTask(T); } });
      });
    });
    items.push(idxItem('#sources', '✓', 'Sources', 'Where every program fact and fixed value comes from'));
    idx.innerHTML = items.join('');
  }

  /* ---------- Part A tools ---------- */
  var CHK = [
    { k: 'seal', label: 'Red Seal', text: 'Red Seal: a Certificate of Qualification with the Red Seal endorsement in an approved trade' },
    { k: 'math', label: 'Math', text: 'Math: Pre-Calculus 11, Foundations of Math 11 or Workplace Math 11 at 60%, or BLDT 1011 at 60%' },
    { k: 'conops', label: 'Construction Operations Associate Certificate', text: 'Construction Operations Associate Certificate finished, GPA 67% or higher' },
    { k: 'work', label: 'One year of construction work', text: 'One year of construction work, in addition to apprenticeship hours' },
    { k: 'eng', label: 'English Studies 12 at 73% or equivalent (Category 1)', text: 'English Studies 12 at 73% or equivalent (Category 1)' },
    { k: 'step1', label: 'Step 1 pre-entry assessment approved by the department', text: 'Step 1 pre-entry assessment approved by the department' }
  ];
  function chkRender() {
    var box = doc.getElementById('chk');
    box.innerHTML = CHK.map(function (c) { return '<label class="opt"><input type="checkbox" data-k="' + c.k + '"' + (S.chk[c.k] ? ' checked' : '') + '><span>' + c.text + '</span></label>'; }).join('');
    box.addEventListener('change', function (e) { var k = e.target.getAttribute('data-k'); if (!k) return; S.chk[k] = e.target.checked; save(); chkOut(); });
    chkOut();
  }
  function chkOut() {
    var left = CHK.filter(function (c) { return !S.chk[c.k]; }), out = doc.getElementById('chk-out');
    if (!left.length) { setFb(out, 'ok', 'All ' + CHK.length + ' done. Step 2: apply online with proof of every requirement.'); return; }
    var msg = (CHK.length - left.length) + ' of ' + CHK.length + ' done. Still to do: ' + left.map(function (c) { return c.label; }).join('; ') + '.';
    if (!S.chk.step1 && left.length === 1) msg += ' Book the pre-entry assessment with the program head before you apply.';
    setFb(out, 'hint', msg);
  }
  var COURSES = ['BLDT 1011', 'BLDT 1021', 'BLDT 1031', 'BLDT 1041', 'BLDT 1061', 'COMM 1103'];
  /* a mark out of 100, read the same way as an answer box */
  function pct(raw) { var r = parseNum(raw); return isNaN(r.v) || r.v < 0 || r.v > 100 ? null : r.v; }
  function gpaRender() {
    var box = doc.getElementById('gpa-in');
    box.innerHTML = COURSES.map(function (c, i) { return '<div class="field-row"><label for="gpa-' + i + '">' + c + '</label><div class="field"><input id="gpa-' + i + '" inputmode="decimal" autocomplete="off" value="' + esc(S.gpa[i] || '') + '"><span class="unit">%</span></div></div>'; }).join('');
    box.addEventListener('input', function (e) { var m = /^gpa-(\d)$/.exec(e.target.id); if (!m) return; S.gpa[Number(m[1])] = e.target.value; gpaOut(); });
    box.addEventListener('change', save);
    gpaOut();
  }
  function gpaOut() {
    var out = doc.getElementById('gpa-out'), n = COURSES.length, vals = [], fail = [];
    for (var i = 0; i < n; i++) { var v = pct(S.gpa[i] || ''); if (v === null) { setFb(out, 'hint', 'Enter all ' + n + ' course percentages (0 to 100).'); return; } vals.push(v); if (v < 50) fail.push(COURSES[i]); }
    var sum = vals.reduce(function (a, b) { return a + b; }, 0), avg = sum / n;
    var msg = 'Average: ' + vals.join(' + ') + ' = ' + trim(sum, 2) + ', ÷ ' + n + ' = ' + trim(avg, 2) + '%. ';
    if (fail.length) setFb(out, 'no', msg + 'Below the 50% pass mark: ' + fail.join(', ') + '. That course has to be passed.');
    else if (avg >= 67) setFb(out, 'ok', msg + 'That meets the 67% GPA for Option D.');
    else setFb(out, 'no', msg + 'That is ' + trim(67 - avg, 2) + ' points short of 67%. Across ' + n + ' courses you need ' + trim(67 * n - sum, 2) + ' more percentage points in total.');
  }
  function fxRender() {
    ['lab', 'mid', 'goal'].forEach(function (k) {
      var el = doc.getElementById('fx-' + k);
      if (S.fx[k] != null) el.value = S.fx[k];
      el.addEventListener('input', function () { S.fx[k] = el.value; fxOut(); });
      el.addEventListener('change', save);
    });
    fxOut();
  }
  function fxOut() {
    var out = doc.getElementById('fx-out'), lab = pct(doc.getElementById('fx-lab').value), mid = pct(doc.getElementById('fx-mid').value), goal = pct(doc.getElementById('fx-goal').value);
    if (lab === null || mid === null || goal === null) { setFb(out, 'hint', 'Enter your labs average, midterm mark and goal.'); return; }
    var have = 0.25 * lab + 0.35 * mid, need = (goal - have) / 0.4, msg = 'You have ' + trim(have, 2) + ' of the 60 points from labs and the midterm. ';
    if (need <= 0) setFb(out, 'ok', msg + 'You have already reached ' + trim(goal, 2) + '% before the final.');
    else if (need > 100) setFb(out, 'no', msg + 'You would need ' + trim(need, 1) + '% on the final, which is not possible. Talk to your instructor about your options.');
    else setFb(out, 'hint', msg + 'You need ' + trim(need, 1) + '% on the final to reach ' + trim(goal, 2) + '%.');
  }

  /* ---------- controls ---------- */
  function setKey(on) {
    keyOn = on;
    var b = doc.getElementById('btn-key'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Hide all answers' : 'Show all answers';
    TASKS.forEach(function (T) { showSol(T, on); });
  }
  function init() {
    renderModules(); chkRender(); gpaRender(); fxRender(); meter();
    save();
    doc.getElementById('btn-key').addEventListener('click', function () { setKey(!keyOn); });
    var conf = doc.getElementById('reset-confirm');
    doc.getElementById('btn-reset').addEventListener('click', function () { conf.hidden = false; doc.getElementById('btn-reset-no').focus(); });
    doc.getElementById('btn-reset-no').addEventListener('click', function () { conf.hidden = true; doc.getElementById('btn-reset').focus(); });
    doc.getElementById('btn-reset-yes').addEventListener('click', function () {
      S.done = {}; save(); TASKS.forEach(function (T) { mark(T); clearFb(T); }); meter(); conf.hidden = true;
      doc.getElementById('btn-reset').focus();
    });
  }
  /* Used by the verification scripts (source/hub/conops tests run in Playwright): they read each task's numbers,
     answers and key rows from here. */
  G.ConOps = { MODS: MODS, tasks: function () { return TASKS; }, params: function (T) { return T.def.gen(rngFor(S.seeds[T.id])); }, rngFor: rngFor };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
