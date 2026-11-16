/* ACCESS IS4S practice engine.
 *
 * Self-checking, randomized practice for every Skills for Success section.
 * One dependency-free file that works online and from a downloaded copy opened from disk.
 *
 * Each skill keeps its exercise bank in skills/<skill>/practice/bank.js:
 *     IS4SPractice.register({ "skill": "communication", "name": "Communication", "sets": [ ... ] })
 * The bank is plain JSON inside register(...) so tests can read it without running it.
 * The format of every exercise type is documented in source/practice/README.md.
 *
 * Use in a lesson (learner.md):   <div class="px" data-px="<set id>"></div>
 * Use on a practice page:         <div class="px-arcade" data-px-skill="<skill>"></div>
 * The home page passport is brand/passport.js, which reads the same saved stars.
 *
 * Exercise types: choose, sort, order, match, spot, fill, numeric, hotspot.
 * Every control is a button, select or text box, so keyboard, touch and screen readers work
 * the same way. Controls follow the site theme. Drawings stay on white paper in both themes.
 * Progress (stars and best scores) stays in this browser's localStorage and is never sent anywhere.
 */
(function () {
  'use strict';
  if (window.IS4SPractice && window.IS4SPractice.version) return;

  var PX = window.IS4SPractice = { version: 1, banks: {}, sets: {} };
  var STORE = 'is4s-practice-v1';
  var doc = document;
  var TYPE_LABEL = {
    choose: 'Pick the best answer', sort: 'Sort it', order: 'Put it in order', match: 'Match it up',
    spot: 'Spot the problem', fill: 'Fill the gaps', numeric: 'Work it out', hotspot: 'Find it on the drawing'
  };

  /* ---------- random numbers: Math.random, or a fixed seed for tests (?pxseed=7) ---------- */
  var seedMatch = /[?&]pxseed=(\d+)/.exec(window.location.search || '');
  var rand = Math.random;
  if (seedMatch) {
    var seed = +seedMatch[1] >>> 0;
    rand = function () { seed = (seed + 0x6D2B79F5) >>> 0; var t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /* Shuffle, but never hand back a list of 2+ in its original order: an unshuffled order puzzle is no puzzle. */
  function reorder(list) {
    if (list.length < 2) return list.slice();
    for (var k = 0; k < 8; k++) { var a = shuffle(list); for (var i = 0; i < a.length; i++) if (a[i] !== list[i]) return a; }
    return list.slice(1).concat(list[0]);
  }
  function pick(list, n) { return shuffle(list).slice(0, n); }

  /* ---------- storage: blocked or full storage never breaks practice ---------- */
  function load() {
    try { var v = JSON.parse(window.localStorage.getItem(STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (err) { return {}; }
  }
  function save(data) { try { window.localStorage.setItem(STORE, JSON.stringify(data)); } catch (err) { /* private mode: keep going */ } }
  function starsFor(score, total) { var p = total ? score / total : 0; return p >= 0.999 ? 3 : p >= 0.75 ? 2 : p >= 0.5 ? 1 : 0; }
  function record(setId, score, total) {
    var data = load(); data.sets = data.sets || {};
    var r = data.sets[setId] || { best: 0, stars: 0, plays: 0 };
    r.plays += 1; r.best = Math.max(r.best, total ? Math.round(100 * score / total) : 0); r.stars = Math.max(r.stars, starsFor(score, total));
    data.sets[setId] = r; save(data);
    return r;
  }
  function progress(bank, data) {
    var out = { stars: 0, max: 3 * bank.sets.length, sets: bank.sets.length, played: 0 };
    bank.sets.forEach(function (s) { var r = (data.sets || {})[s.id]; if (r) { out.stars += r.stars; out.played += 1; } });
    return out;
  }

  /* ---------- small DOM helpers ---------- */
  function h(tag, attrs, kids) {
    var el = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (k) { if (k !== null && k !== undefined && k !== false) el.appendChild(typeof k === 'string' ? doc.createTextNode(k) : k); });
    return el;
  }
  function btn(label, cls, onclick, attrs) {
    var a = { type: 'button', 'class': 'px-btn ' + cls, onclick: onclick };
    if (attrs) Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    return h('button', a, [label]);
  }
  function esc(text) { return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* Inline marks only: **bold** and *italic*. Text is escaped first, so bank text can never inject markup. */
  function rich(text) { return esc(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
  function richEl(tag, text, cls) { return h(tag, { 'class': cls || null, html: rich(text) }); }
  var uid = 0; function nextId(p) { uid += 1; return p + '-' + uid; }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { return false; } }

  var ICON = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.6 2.2c.5 3-1.2 4.6-2.6 6.2-1.3 1.5-2.6 3-2.6 5.6 0 2.7 2 5 4.6 5-1.2-.9-1.8-2.2-1.6-3.6.3-1.7 1.8-2.5 2.6-4 .9 1.4 2.9 3 2.9 5.3 0 1-.4 1.9-1.1 2.4 2.5-.3 4.4-2.6 4.4-5.4 0-5-5.2-6.6-6.6-11.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.2 16.6L4.6 12l-1.6 1.6 6.2 6.2L21 8l-1.6-1.6z"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.3 5.7L13.4 10.6 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5l7 8h-5v6h-4v-6H5z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19l-7-8h5V5h4v6h5z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
    dice: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm9 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM7.5 15a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm9 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>'
  };
  function icon(name, cls) { return h('span', { 'class': 'px-ico' + (cls ? ' ' + cls : ''), html: ICON[name] }); }
  function starsEl(n, size) {
    var wrap = h('span', { 'class': 'px-stars' + (size ? ' px-stars-' + size : ''), role: 'img', 'aria-label': n + ' of 3 stars' });
    for (var i = 0; i < 3; i++) wrap.appendChild(icon('star', i < n ? 'on' : 'off'));
    return wrap;
  }

  /* ---------- safe arithmetic for numeric items (a tiny parser, never eval) ---------- */
  var FN = {
    round: function (x, n) { var p = Math.pow(10, n || 0); return Math.round((x + (x >= 0 ? 1 : -1) * 1e-9) * p) / p; },
    floor: Math.floor, ceil: Math.ceil, abs: Math.abs, sqrt: Math.sqrt, min: Math.min, max: Math.max, pow: Math.pow,
    sin: function (d) { return Math.sin(d * Math.PI / 180); }, cos: function (d) { return Math.cos(d * Math.PI / 180); },
    tan: function (d) { return Math.tan(d * Math.PI / 180); }, atan: function (x) { return Math.atan(x) * 180 / Math.PI; }
  };
  var TOKEN = /\d+(?:\.\d+)?|\.\d+|[A-Za-z_]\w*|&&|\|\||[<>=!]=|[-+*/^(),<>]/g;
  var TOKENS = Object.create(null);
  /* Formulas repeat inside the number-drawing loop, so each is split into tokens once. */
  function tokens(src) {
    var text = String(src);
    if (!(text in TOKENS)) TOKENS[text] = text.replace(TOKEN, '').replace(/\s+/g, '') ? null : (text.match(TOKEN) || []);
    if (!TOKENS[text]) throw new Error('Bad expression: ' + src);
    return TOKENS[text];
  }
  function evaluate(src, vars) {
    var toks = tokens(src), i = 0;
    vars = vars || {};
    function peek() { return toks[i]; }
    function take(t) { if (toks[i] !== t) throw new Error('Expected ' + t + ' in ' + src); i++; }
    function logic() { var v = compare(); while (peek() === '&&' || peek() === '||') { var op = toks[i++]; var r = compare(); v = op === '&&' ? (v && r ? 1 : 0) : (v || r ? 1 : 0); } return v; }
    function compare() {
      var v = expr();
      while (/^(<|>|<=|>=|==|!=)$/.test(peek() || '')) {
        var op = toks[i++], r = expr();
        v = op === '<' ? +(v < r) : op === '>' ? +(v > r) : op === '<=' ? +(v <= r) : op === '>=' ? +(v >= r) : op === '==' ? +(Math.abs(v - r) < 1e-9) : +(Math.abs(v - r) >= 1e-9);
      }
      return v;
    }
    function expr() { var v = term(); while (peek() === '+' || peek() === '-') { var op = toks[i++]; var r = term(); v = op === '+' ? v + r : v - r; } return v; }
    function term() { var v = power(); while (peek() === '*' || peek() === '/') { var op = toks[i++]; var r = power(); v = op === '*' ? v * r : v / r; } return v; }
    function power() { var v = unary(); if (peek() === '^') { i++; v = Math.pow(v, power()); } return v; }
    function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return primary(); }
    function primary() {
      var t = toks[i++];
      if (t === undefined) throw new Error('Unexpected end in ' + src);
      if (t === '(') { var v = logic(); take(')'); return v; }
      if (/^[\d.]/.test(t)) return parseFloat(t);
      if (/^[A-Za-z_]/.test(t)) {
        if (peek() === '(') {
          if (!Object.prototype.hasOwnProperty.call(FN, t)) throw new Error('Unknown function ' + t);
          i++; var args = [];
          if (peek() !== ')') { args.push(logic()); while (peek() === ',') { i++; args.push(logic()); } }
          take(')'); return FN[t].apply(null, args);
        }
        if (t === 'pi') return Math.PI;
        if (!Object.prototype.hasOwnProperty.call(vars, t)) throw new Error('Unknown value ' + t + ' in ' + src);
        return vars[t];
      }
      throw new Error('Unexpected ' + t + ' in ' + src);
    }
    var out = logic();
    if (i !== toks.length) throw new Error('Unexpected ' + toks[i] + ' in ' + src);
    return out;
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  /* Mixed number in sixteenths, the way a tape measure reads: 3 5/8. */
  function asFraction(v) {
    var neg = v < 0; v = Math.abs(v);
    var whole = Math.floor(v + 1e-9), n = Math.round((v - whole) * 16);
    if (n === 16) { whole += 1; n = 0; }
    var g = gcd(n, 16) || 1, part = n ? (n / g) + '/' + (16 / g) : '';
    var s = whole && part ? whole + ' ' + part : whole ? String(whole) : part || '0';
    return (neg ? '−' : '') + s;
  }
  function format(v, how) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (how === 'frac') return asFraction(v);
    if (how === 'money') return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (how === 'int') return Math.round(v).toLocaleString('en-CA');
    if (how === 'pct') return (Math.round(v * 10) / 10).toLocaleString('en-CA') + '%';
    if (how === 'hm') { var hh = Math.floor(v + 1e-9), mm = Math.round((v - hh) * 60); if (mm === 60) { hh += 1; mm = 0; } return hh + ' h ' + mm + ' min'; }
    if (how === 'clock') { var t = ((v % 24) + 24) % 24, H = Math.floor(t + 1e-9), M = Math.round((t - H) * 60); if (M === 60) { H = (H + 1) % 24; M = 0; } return (H % 12 || 12) + ':' + (M < 10 ? '0' : '') + M + (H < 12 ? ' a.m.' : ' p.m.'); }
    if (/^\d$/.test(how || '')) return v.toLocaleString('en-CA', { minimumFractionDigits: +how, maximumFractionDigits: +how });
    return (Math.round(v * 100) / 100).toLocaleString('en-CA', { maximumFractionDigits: 2 });
  }
  /* "{a}", "{a|money}", "{=a*b|2}" inside text become values. */
  function fill(text, vars) {
    return String(text == null ? '' : text).replace(/\{(=?)([^{}|]+)(?:\|([a-z0-9]+))?\}/g, function (m, isExpr, body, how) {
      try {
        var key = body.trim();
        if (!isExpr && !Object.prototype.hasOwnProperty.call(vars, key)) return m;
        var val = isExpr ? evaluate(body, vars) : vars[key];
        return typeof val === 'number' ? format(val, how) : String(val);
      } catch (err) { return m; }
    });
  }
  function drawVars(spec) {
    var keys = Object.keys(spec.vars || {}), vars = {};
    for (var attempt = 0; attempt < 400; attempt++) {
      vars = {};
      keys.forEach(function (k) {
        var d = spec.vars[k];
        if (Array.isArray(d)) {
          var lo = d[0], hi = d[1], step = d[2] || 1, n = Math.floor((hi - lo) / step + 1e-9) + 1;
          vars[k] = Math.round((lo + step * Math.floor(rand() * n)) * 1e6) / 1e6;
        } else if (d && d.pick) vars[k] = d.pick[Math.floor(rand() * d.pick.length)];
        else vars[k] = evaluate(d, vars);
      });
      if (!spec.where || evaluate(spec.where, vars)) return vars;
    }
    throw new Error('No numbers fit the rule: ' + spec.where);
  }
  /* Accepts 12, 12.5, 1,250, $45.10, 3 5/8, 5/8, -2, 45%, and ignores a trailing unit word. */
  function parseAnswer(raw) {
    var s = String(raw || '').trim().replace(/[−–]/g, '-').replace(/^(-?)\s*\$/, '$1').replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
    var m = /^(-?)(\d+)(?:\s+|-)(\d+)\s*\/\s*(\d+)/.exec(s);
    if (m) return (m[1] ? -1 : 1) * (+m[2] + (+m[3]) / (+m[4]));
    m = /^(-?\d+)\s*\/\s*(\d+)/.exec(s);
    if (m) return (+m[1]) / (+m[2]);
    m = /^-?(\d+(\.\d*)?|\.\d+)/.exec(s);
    return m ? parseFloat(m[0]) : NaN;
  }

  /* ---------- visuals drawn for numeric items (colours are classes in practice.css) ---------- */
  function svg(w, hgt, inner, label) {
    return ['<svg class="px-visual" viewBox="0 0 ', w, ' ', hgt, '" role="img" aria-label="', esc(label), '">', inner, '</svg>'].join('');
  }
  function T(x, y, size, text, extra) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" class="pxv-text"' + (extra || '') + '>' + esc(text) + '</text>'; }
  var VISUAL = {
    /* Imperial tape: a 4-inch window, ticks to 1/16 in, a red line at the value (inches). */
    tape: function (o, vars) {
      var v = evaluate(o.value, vars), start = Math.max(0, Math.floor(v) - 1), span = 4, ppi = 150, x0 = 30, inner = '';
      inner += '<rect x="0" y="0" width="' + (span * ppi + 60) + '" height="120" rx="10" class="pxv-tape"/>';
      for (var k = 0; k <= span * 16; k++) {
        var x = x0 + k * ppi / 16, len = k % 16 === 0 ? 58 : k % 8 === 0 ? 44 : k % 4 === 0 ? 33 : k % 2 === 0 ? 23 : 14;
        inner += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + len + '" class="pxv-tick" stroke-width="' + (k % 16 === 0 ? 2.6 : 1.4) + '"/>';
        if (k % 16 === 0) inner += T(x + 4, 86, 27, start + k / 16, ' font-weight="700"');
      }
      var mx = x0 + (v - start) * ppi;
      inner += '<line x1="' + mx + '" y1="0" x2="' + mx + '" y2="120" class="pxv-mark" stroke-width="3.5"/><path d="M' + (mx - 9) + ',120 L' + mx + ',103 L' + (mx + 9) + ',120z" class="pxv-mark-fill"/>';
      return svg(span * ppi + 60, 120, inner, 'Tape measure in inches, marked to sixteenths, with a red line at the reading to find');
    },
    /* Metric ruler, 60 mm window, a red line at the value (mm). */
    ruler: function (o, vars) {
      var v = evaluate(o.value, vars), start = Math.max(0, Math.floor(v / 10) * 10 - 20), span = 60, ppm = 10, x0 = 30, inner = '';
      inner += '<rect x="0" y="0" width="' + (span * ppm + 60) + '" height="110" rx="8" class="pxv-rule"/>';
      for (var k = 0; k <= span; k++) {
        var x = x0 + k * ppm, len = k % 10 === 0 ? 50 : k % 5 === 0 ? 34 : 20;
        inner += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + len + '" class="pxv-tick" stroke-width="' + (k % 10 === 0 ? 2.2 : 1.2) + '"/>';
        if (k % 10 === 0) inner += T(x, 76, 20, (start + k) / 10, ' font-weight="700" text-anchor="middle"');
      }
      inner += T(span * ppm + 52, 100, 15, 'cm', ' text-anchor="end"');
      var mx = x0 + (v - start) * ppm;
      inner += '<line x1="' + mx + '" y1="0" x2="' + mx + '" y2="110" class="pxv-mark" stroke-width="3"/>';
      return svg(span * ppm + 60, 110, inner, 'Metric ruler in centimetres and millimetres with a red line at the reading to find');
    },
    /* Bar chart: o.bars = [{label, value}] where each value is an expression. */
    bars: function (o, vars) {
      var data = o.bars.map(function (b) { return { label: fill(b.label, vars), value: evaluate(b.value, vars) }; });
      var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
      var W = 620, H = 300, left = 40, bottom = 250, top = 30, bw = (W - left - 20) / data.length, inner = '<rect width="' + W + '" height="' + H + '" class="pxv-paper"/>';
      inner += '<line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + bottom + '" class="pxv-axis"/><line x1="' + left + '" y1="' + bottom + '" x2="' + (W - 10) + '" y2="' + bottom + '" class="pxv-axis"/>';
      data.forEach(function (d, i) {
        var len = (bottom - top - 22) * d.value / max, x = left + 10 + i * bw, cx = x + (bw - 20) / 2;
        inner += '<rect x="' + x + '" y="' + (bottom - len) + '" width="' + (bw - 20) + '" height="' + len + '" rx="3" class="pxv-c' + (i % 6) + '"/>';
        inner += T(cx, bottom - len - 7, 16, format(d.value, o.format), ' font-weight="700" text-anchor="middle"');
        inner += T(cx, bottom + 22, 15, d.label, ' text-anchor="middle"');
      });
      if (o.title) inner += T(left, 18, 15, fill(o.title, vars), ' font-weight="700"');
      return svg(W, H, inner, 'Bar chart: ' + data.map(function (d) { return d.label + ' ' + format(d.value, o.format); }).join(', '));
    },
    /* Analog clock: o.value in hours, e.g. 7.5 is 7:30. */
    clock: function (o, vars) {
      var v = evaluate(o.value, vars), hh = v % 12, mm = (v - Math.floor(v)) * 60, inner = '<circle cx="110" cy="110" r="100" class="pxv-face"/>';
      for (var k = 1; k <= 12; k++) { var a = k * Math.PI / 6; inner += T(110 + 78 * Math.sin(a), 117 - 78 * Math.cos(a), 20, k, ' font-weight="700" text-anchor="middle"'); }
      for (var t = 0; t < 60; t++) { var b = t * Math.PI / 30, r1 = t % 5 ? 92 : 86; inner += '<line x1="' + (110 + r1 * Math.sin(b)) + '" y1="' + (110 - r1 * Math.cos(b)) + '" x2="' + (110 + 97 * Math.sin(b)) + '" y2="' + (110 - 97 * Math.cos(b)) + '" class="pxv-tick" stroke-width="' + (t % 5 ? 1 : 3) + '"/>'; }
      var ha = (hh + mm / 60) * Math.PI / 6, ma = mm * Math.PI / 30;
      inner += '<line x1="110" y1="110" x2="' + (110 + 52 * Math.sin(ha)) + '" y2="' + (110 - 52 * Math.cos(ha)) + '" class="pxv-tick" stroke-width="8" stroke-linecap="round"/>';
      inner += '<line x1="110" y1="110" x2="' + (110 + 66 * Math.sin(ma)) + '" y2="' + (110 - 66 * Math.cos(ma)) + '" class="pxv-mark" stroke-width="5" stroke-linecap="round"/><circle cx="110" cy="110" r="7" class="pxv-ink"/>';
      return svg(220, 220, inner, 'Clock face showing ' + format(v, 'clock').replace(/ [ap]\.m\.$/, ''));
    },
    /* Slope triangle with rise and run labels. */
    slope: function (o, vars) {
      var rise = evaluate(o.rise, vars), run = evaluate(o.run, vars), k = Math.min(400 / run, 190 / rise), W = run * k, H = rise * k, x0 = 50, y0 = 250, inner = '<rect width="600" height="290" class="pxv-paper"/>';
      var riseText = o.riseLabel ? fill(o.riseLabel, vars) : format(rise), runText = o.runLabel ? fill(o.runLabel, vars) : format(run);
      inner += '<path d="M' + x0 + ',' + y0 + ' L' + (x0 + W) + ',' + y0 + ' L' + (x0 + W) + ',' + (y0 - H) + 'z" class="pxv-tri"/>';
      inner += '<rect x="' + (x0 + W - 16) + '" y="' + (y0 - 16) + '" width="16" height="16" class="pxv-square"/>';
      inner += T(x0 + W / 2, y0 + 28, 18, 'run ' + runText, ' font-weight="700" text-anchor="middle"');
      inner += T(x0 + W + 10, y0 - H / 2, 18, 'rise ' + riseText, ' font-weight="700"');
      return svg(600, 290, inner, 'Right triangle with rise ' + riseText + ' and run ' + runText);
    },
    /* A small Gantt chart: o.tasks = [{label, start, length}] in days, start counted from 0. */
    gantt: function (o, vars) {
      var tasks = o.tasks.map(function (t) { return { label: fill(t.label, vars), start: evaluate(t.start, vars), len: evaluate(t.length, vars) }; });
      var days = Math.max.apply(null, tasks.map(function (t) { return t.start + t.len; }).concat([5])), left = 150, W = 640, dx = (W - left - 20) / days, rowH = 38;
      var H = 50 + tasks.length * rowH, inner = '<rect width="' + W + '" height="' + H + '" class="pxv-paper"/>';
      for (var d = 0; d <= days; d++) { var x = left + d * dx; inner += '<line x1="' + x + '" y1="30" x2="' + x + '" y2="' + (H - 8) + '" class="pxv-grid"/>'; if (d < days) inner += T(x + dx / 2, 22, 13, d + 1, ' text-anchor="middle"'); }
      tasks.forEach(function (t, i) {
        var y = 38 + i * rowH;
        inner += T(8, y + 21, 15, t.label);
        inner += '<rect x="' + (left + t.start * dx + 2) + '" y="' + (y + 4) + '" width="' + Math.max(4, t.len * dx - 4) + '" height="' + (rowH - 12) + '" rx="4" class="pxv-c' + (i % 6) + '"/>';
      });
      return svg(W, H, inner, 'Bar chart of tasks by day: ' + tasks.map(function (t) { return t.label + ' starts day ' + (t.start + 1) + ' for ' + t.len + ' days'; }).join(', '));
    }
  };

  /* ---------- feedback helpers ---------- */
  function mark(el, ok) {
    el.classList.add(ok ? 'px-ok' : 'px-no');
    el.insertBefore(h('span', { 'class': 'px-mark' }, [icon(ok ? 'check' : 'cross'), h('span', { 'class': 'sr', text: ok ? 'Correct: ' : 'Not quite: ' })]), el.firstChild);
  }
  function why(text, ok) { return text ? h('p', { 'class': 'px-why' + (ok === false ? ' px-why-no' : ''), html: rich(text) }) : null; }

  /* ---------- the exercise types ----------
     Each builder returns { el, check() -> {score, total} } plus the handles the browser test uses.
     choose, numeric, spot and hotspot take one item. fill, sort and match take a list. order takes one sequence. */
  var BUILD = {};

  BUILD.choose = function (set, item, ctx) {
    var answer = item.answer || 0;
    var opts = item.options.map(function (o, i) { return { text: o, ok: i === answer, fb: item.why ? item.why[i] : null }; });
    var group = h('div', { 'class': 'px-options', role: 'group', 'aria-label': 'Answers' }), chosen = null, buttons = [];
    shuffle(opts).forEach(function (o) {
      var b = h('button', { type: 'button', 'class': 'px-option', 'aria-pressed': 'false', html: rich(o.text), onclick: function () {
        if (ctx.locked()) return;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true'); chosen = o; ctx.ready(true);
      } });
      b._opt = o; buttons.push(b); group.appendChild(b);
    });
    var el = h('div', { 'class': 'px-choose' }, [item.scene ? richEl('p', item.scene, 'px-scene') : null, richEl('p', item.q, 'px-q'), group]);
    return { el: el, buttons: buttons, check: function () {
      buttons.forEach(function (b) { b.disabled = true; if (b._opt.ok) mark(b, true); else if (b._opt === chosen) mark(b, false); });
      var ok = !!(chosen && chosen.ok);
      if (chosen && chosen.fb) el.appendChild(why(chosen.fb, ok));
      if (item.explain && (!chosen || !chosen.fb || !ok)) el.appendChild(why(item.explain, ok));
      return { score: ok ? 1 : 0, total: 1 };
    } };
  };

  BUILD.numeric = function (set, item, ctx) {
    var vars = drawVars(item), ans = evaluate(item.answer, vars), tol = item.tol != null ? item.tol : Math.max(0.005, Math.abs(ans) * 0.0005);
    var id = nextId('num');
    var input = h('input', { id: id, 'class': 'px-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
      oninput: function () { ctx.ready(input.value.trim() !== ''); },
      onkeydown: function (ev) { if (ev.key === 'Enter' && input.value.trim()) { ev.preventDefault(); ctx.submit(); } } });
    var visual = item.visual && VISUAL[item.visual.kind] ? h('div', { 'class': 'px-visual-wrap', html: VISUAL[item.visual.kind](item.visual, vars) }) : null;
    var row = h('div', { 'class': 'px-answer-row' }, [h('label', { 'for': id, text: 'Your answer' }), input, item.unit ? h('span', { 'class': 'px-unit', text: item.unit }) : null]);
    var el = h('div', { 'class': 'px-numeric' }, [
      item.scene ? richEl('p', fill(item.scene, vars), 'px-scene') : null, visual, richEl('p', fill(item.q, vars), 'px-q'), row,
      item.hint ? h('details', { 'class': 'px-hint' }, [h('summary', { text: 'Hint' }), richEl('p', fill(item.hint, vars))]) : null
    ]);
    return { el: el, focus: input, input: input, answer: ans, check: function () {
      input.readOnly = true;
      var got = parseAnswer(input.value), ok = isFinite(got) && Math.abs(got - ans) <= tol + 1e-9;
      mark(row, ok);
      el.appendChild(h('p', { 'class': 'px-why' + (ok ? '' : ' px-why-no') }, [h('strong', { text: (ok ? 'Yes: ' : 'Answer: ') + format(ans, item.format) + (item.unit ? ' ' + item.unit : '') + '. ' }), h('span', { html: rich(fill(item.explain || '', vars)) })]));
      return { score: ok ? 1 : 0, total: 1 };
    } };
  };

  BUILD.fill = function (set, items, ctx) {
    var selects = [], notes = [];
    var lines = items.map(function (item) {
      var p = h('p', { 'class': 'px-fill-line' }), mine = [];
      String(item.t).split(/(\{\{[^}]+\}\})/).forEach(function (part) {
        var m = /^\{\{([^}]+)\}\}$/.exec(part);
        if (!m) { if (part) p.appendChild(h('span', { html: rich(part) })); return; }
        var options = m[1].split('|');
        var sel = h('select', { id: nextId('blank'), 'class': 'px-select', 'aria-label': 'Blank ' + (selects.length + 1), onchange: function () { ctx.ready(selects.every(function (s) { return s.value; })); } },
          [h('option', { value: '', text: 'choose…' })].concat(shuffle(options).map(function (o) { return h('option', { value: o, text: o }); })));
        sel._answer = options[0]; selects.push(sel); mine.push(sel); p.appendChild(sel);
      });
      var box = h('div', { 'class': 'px-fill' }, [item.scene ? richEl('p', item.scene, 'px-scene') : null, p]);
      notes.push({ box: box, item: item, selects: mine });
      return box;
    });
    return { el: h('div', { 'class': 'px-fill-board' }, lines), selects: selects, check: function () {
      var score = 0;
      selects.forEach(function (s) {
        s.disabled = true; var ok = s.value === s._answer; if (ok) score++;
        s.classList.add(ok ? 'px-ok' : 'px-no');
        s.insertAdjacentElement('afterend', h('span', { 'class': 'px-fix' + (ok ? ' px-fix-ok' : '') }, [icon(ok ? 'check' : 'cross'), h('span', { 'class': 'sr', text: ok ? 'Correct.' : 'Answer:' }), ok ? null : ' ' + s._answer]));
      });
      notes.forEach(function (n) { if (n.item.why) n.box.appendChild(why(n.item.why, n.selects.every(function (s) { return s.value === s._answer; }))); });
      return { score: score, total: selects.length };
    } };
  };

  BUILD.spot = function (set, item, ctx) {
    /* Brackets [wrong phrase|why it is wrong] are targets. Braces {plain phrase} can be tapped but are fine. */
    var p = h('p', { 'class': 'px-spot-text' }), chips = [];
    String(item.text).split(/(\[[^\]]+\]|\{[^}]+\})/).forEach(function (part) {
      var t = /^\[([^|\]]+)(?:\|([^\]]*))?\]$/.exec(part), f = /^\{([^}]+)\}$/.exec(part);
      if (!t && !f) { if (part) p.appendChild(h('span', { html: rich(part) })); return; }
      var chip = h('button', { type: 'button', 'class': 'px-chip', 'aria-pressed': 'false', onclick: function () {
        if (ctx.locked()) return; chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      } }, [h('span', { 'class': 'px-chip-text', text: t ? t[1] : f[1] })]);
      chip._target = !!t; chip._why = t ? t[2] : ''; chip._text = t ? t[1] : f[1]; chips.push(chip); p.appendChild(chip);
    });
    var targets = chips.filter(function (c) { return c._target; }).length;
    var el = h('div', { 'class': 'px-spot' }, [item.scene ? richEl('p', item.scene, 'px-scene') : null, richEl('p', item.q || set.ask || 'Tap every part that is wrong, then check.', 'px-q'), p]);
    setTimeout(function () { ctx.ready(true); }, 0);
    return { el: el, chips: chips, check: function () {
      var hits = 0, extra = 0, notes = h('ul', { 'class': 'px-notes' });
      chips.forEach(function (c) {
        var on = c.getAttribute('aria-pressed') === 'true'; c.disabled = true;
        if (c._target) { if (on) hits++; mark(c, on); notes.appendChild(h('li', { html: '<strong>' + rich(c._text) + '</strong>' + (c._why ? ': ' + rich(c._why) : '') + (on ? '' : ' <em>(missed)</em>') })); }
        else if (on) { extra++; mark(c, false); }
      });
      el.appendChild(notes);
      if (extra) el.appendChild(why(extra + ' tapped part' + (extra === 1 ? ' was' : 's were') + ' fine as written.', false));
      if (item.missing) el.appendChild(h('p', { 'class': 'px-why' }, [h('strong', { text: 'Also missing: ' }), h('span', { html: rich(item.missing) })]));
      if (item.why) el.appendChild(why(item.why));
      return { score: Math.max(0, hits - extra), total: targets };
    } };
  };

  BUILD.sort = function (set, items, ctx) {
    var bins = set.bins, rows = [];
    var legend = h('div', { 'class': 'px-bins', 'aria-hidden': 'true' }, bins.map(function (b, i) { return h('span', { 'class': 'px-bin-tag b' + (i % 6) }, [h('strong', { text: b.label }), b.hint ? h('span', { text: ' ' + b.hint }) : null]); }));
    var list = h('ul', { 'class': 'px-sort' });
    items.forEach(function (it) {
      var gid = nextId('sort'), chosen = null, buttons = [];
      var row = h('li', { 'class': 'px-sort-row' });
      var group = h('div', { 'class': 'px-bin-btns', role: 'group', 'aria-labelledby': gid });
      bins.forEach(function (b, i) {
        var bb = h('button', { type: 'button', 'class': 'px-bin-btn b' + (i % 6), 'aria-pressed': 'false', text: b.label, onclick: function () {
          if (ctx.locked()) return;
          buttons.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          bb.setAttribute('aria-pressed', 'true'); chosen = b.id; row.className = 'px-sort-row b' + (i % 6);
          ctx.ready(rows.every(function (r) { return r.get() !== null; }));
        } });
        bb._bin = b.id; buttons.push(bb); group.appendChild(bb);
      });
      row.appendChild(h('p', { 'class': 'px-sort-text', id: gid, html: rich(it.t) })); row.appendChild(group); list.appendChild(row);
      rows.push({ get: function () { return chosen; }, row: row, it: it, buttons: buttons });
    });
    return { el: h('div', { 'class': 'px-sorter' }, [legend, list]), rows: rows, check: function () {
      var score = 0;
      rows.forEach(function (r) {
        var ok = r.get() === r.it.bin; if (ok) score++;
        r.buttons.forEach(function (b) { b.disabled = true; });
        mark(r.row, ok);
        var right = bins.filter(function (b) { return b.id === r.it.bin; })[0];
        r.row.appendChild(h('p', { 'class': 'px-why' + (ok ? '' : ' px-why-no'), html: (ok ? '' : '<strong>' + rich(right ? right.label : r.it.bin) + '.</strong> ') + rich(r.it.why || '') }));
      });
      return { score: score, total: rows.length };
    } };
  };

  BUILD.order = function (set, seq, ctx) {
    var steps = seq.steps.map(function (t, i) { return { t: t, i: i }; }), cur = reorder(steps), done = false;
    var list = h('ol', { 'class': 'px-order' });
    function draw(focusIndex, dir) {
      list.innerHTML = '';
      cur.forEach(function (s, k) {
        var li = h('li', { 'class': 'px-order-row' }, [
          h('span', { 'class': 'px-order-n', 'aria-hidden': 'true', text: String(k + 1) }),
          h('span', { 'class': 'px-order-text', html: rich(s.t) }),
          h('span', { 'class': 'px-order-btns' }, [
            h('button', { type: 'button', 'class': 'px-mini', 'aria-label': 'Move up: ' + s.t, disabled: k === 0 || done ? true : null, html: ICON.up, onclick: function () { move(k, -1); } }),
            h('button', { type: 'button', 'class': 'px-mini', 'aria-label': 'Move down: ' + s.t, disabled: k === cur.length - 1 || done ? true : null, html: ICON.down, onclick: function () { move(k, 1); } })
          ])
        ]);
        li._step = s; list.appendChild(li);
      });
      if (focusIndex != null) {
        var row = list.children[focusIndex], bs = row ? row.querySelectorAll('.px-mini') : [], b = bs[dir < 0 ? 0 : 1];
        if (b && b.disabled) b = bs[dir < 0 ? 1 : 0];
        if (b) b.focus();
      }
    }
    function move(k, d) { var j = k + d; if (done || j < 0 || j >= cur.length) return; var t = cur[k]; cur[k] = cur[j]; cur[j] = t; draw(j, d); ctx.say('Moved to position ' + (j + 1) + ' of ' + cur.length + '.'); }
    draw();
    setTimeout(function () { ctx.ready(true); }, 0);
    var el = h('div', { 'class': 'px-orderer' }, [seq.title ? richEl('p', seq.title, 'px-q') : null, list]);
    return { el: el, order: function () { return cur.map(function (s) { return s.i; }); }, move: move, check: function () {
      var score = 0; done = true;
      Array.prototype.forEach.call(list.children, function (li, k) {
        var ok = li._step.i === k; if (ok) score++;
        Array.prototype.forEach.call(li.querySelectorAll('button'), function (b) { b.disabled = true; });
        mark(li, ok);
        if (!ok) li.appendChild(h('span', { 'class': 'px-fix', text: 'goes at ' + (li._step.i + 1) }));
      });
      if (seq.explain) el.appendChild(why(seq.explain, score === steps.length));
      return { score: score, total: steps.length };
    } };
  };

  BUILD.match = function (set, pairs, ctx) {
    var rights = shuffle(pairs.map(function (p) { return p.b; })), rows = [];
    var table = h('div', { 'class': 'px-match' }, [h('div', { 'class': 'px-match-head', 'aria-hidden': 'true' }, [h('span', { text: set.left || 'Item' }), h('span', { text: set.right || 'Matches' })])]);
    pairs.forEach(function (p) {
      var id = nextId('match');
      var sel = h('select', { id: id, 'class': 'px-select', onchange: function () { ctx.ready(rows.every(function (r) { return r.sel.value; })); } },
        [h('option', { value: '', text: 'choose…' })].concat(rights.map(function (r) { return h('option', { value: r, text: r }); })));
      var row = h('div', { 'class': 'px-match-row' }, [h('label', { 'for': id, 'class': 'px-match-a', html: rich(p.a) }), sel]);
      rows.push({ sel: sel, row: row, p: p }); table.appendChild(row);
    });
    return { el: table, rows: rows, check: function () {
      var score = 0;
      rows.forEach(function (r) {
        var ok = r.sel.value === r.p.b; if (ok) score++; r.sel.disabled = true; mark(r.row, ok);
        if (!ok) r.row.appendChild(h('p', { 'class': 'px-why px-why-no' }, [h('strong', { text: '→ ' + r.p.b + '. ' }), h('span', { html: rich(r.p.why || '') })]));
        else if (r.p.why) r.row.appendChild(why(r.p.why));
      });
      return { score: score, total: rows.length };
    } };
  };

  BUILD.hotspot = function (set, item, ctx) {
    var box = h('div', { 'class': 'px-hot' }), chosen = null, btns = [];
    box.innerHTML = set.svg;
    var vb = (box.querySelector('svg').getAttribute('viewBox') || '0 0 100 100').split(/[\s,]+/).map(Number);
    var layer = h('div', { 'class': 'px-hot-layer', role: 'group', 'aria-label': 'Parts of the drawing' });
    shuffle(set.regions).forEach(function (r) {
      var b = h('button', { type: 'button', 'class': 'px-hot-btn', 'aria-pressed': 'false', 'aria-label': r.label,
        style: 'left:' + (100 * (r.x - vb[0]) / vb[2]) + '%;top:' + (100 * (r.y - vb[1]) / vb[3]) + '%;width:' + (100 * r.w / vb[2]) + '%;height:' + (100 * r.h / vb[3]) + '%',
        onclick: function () { if (ctx.locked()) return; btns.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); chosen = r.id; ctx.ready(true); } });
      b._id = r.id; btns.push(b); layer.appendChild(b);
    });
    box.appendChild(layer);
    var el = h('div', { 'class': 'px-hotspot' }, [richEl('p', item.q, 'px-q'), box]);
    return { el: el, buttons: btns, region: item.region, check: function () {
      var ok = chosen === item.region;
      btns.forEach(function (b) { b.disabled = true; if (b._id === item.region) b.classList.add('px-hot-right'); else if (b._id === chosen) b.classList.add('px-hot-wrong'); });
      el.appendChild(why((ok ? 'Yes. ' : 'Not that part. ') + (item.why || ''), ok));
      return { score: ok ? 1 : 0, total: 1 };
    } };
  };

  /* ---------- one play of a set: a list of rounds, each one builder call ---------- */
  function rounds(set) {
    var n = set.pick;
    switch (set.type) {
      case 'choose': case 'numeric': case 'spot': case 'hotspot': return pick(set.items, n || Math.min(5, set.items.length));
      case 'fill': return [pick(set.items, n || Math.min(4, set.items.length))];
      case 'sort': return [pick(set.items, n || Math.min(8, set.items.length))];
      case 'match': return [pick(set.pairs, n || Math.min(6, set.pairs.length))];
      case 'order': return pick(set.sequences || [{ steps: set.steps, explain: set.explain, title: set.ask }], n || 1);
    }
    return [];
  }

  /* ---------- pieces shared by a lesson set and the quick-fire games ---------- */
  function liveRegion() {
    var el = h('div', { 'class': 'sr', 'aria-live': 'polite', role: 'status' });
    return { el: el, say: function (t) { el.textContent = ''; setTimeout(function () { el.textContent = t; }, 30); } };
  }
  /* One question: build it, show a Check button that wakes up once an answer is ready, and hand the result to onCheck. */
  function question(actions, say, build, onCheck) {
    var checked = false;
    var checkBtn = btn('Check', 'px-primary px-check', go, { disabled: true });
    var built = build({ ready: function (on) { checkBtn.disabled = !on; }, locked: function () { return checked; }, say: say, submit: function () { if (!checkBtn.disabled) go(); } });
    actions.innerHTML = ''; actions.appendChild(checkBtn);
    function go() { if (checked) return; checked = true; actions.innerHTML = ''; onCheck(built.check()); }
    return built;
  }
  function nextButton(actions, label, cls, go) { var b = btn(label, 'px-primary ' + cls, go); actions.innerHTML = ''; actions.appendChild(b); b.focus(); }
  function flash(el, ok) { el.classList.remove('px-flash-ok', 'px-flash-no'); void el.offsetWidth; el.classList.add(ok ? 'px-flash-ok' : 'px-flash-no'); }
  function meter(el, score, streak) {
    el.innerHTML = '';
    el.appendChild(h('span', { 'class': 'px-score' }, [icon('star', 'on'), ' ' + score]));
    if (streak >= 2) el.appendChild(h('span', { 'class': 'px-streak' }, [icon('flame'), ' ' + streak + ' in a row']));
  }
  function resultCard(stars, score, cheer, note, celebrate) {
    var card = h('div', { 'class': 'px-result' + (celebrate ? ' px-perfect' : '') }, [starsEl(stars, 'big'),
      h('p', { 'class': 'px-result-score', text: score }), h('p', { 'class': 'px-result-cheer', text: cheer }), h('p', { 'class': 'px-result-best', text: note })]);
    if (celebrate) {
      var b = h('div', { 'class': 'px-burst', 'aria-hidden': 'true' });
      for (var i = 0; i < 16; i++) { var sp = h('span'); sp.style.setProperty('--a', (i * 360 / 16) + 'deg'); sp.style.setProperty('--d', (60 + (i % 3) * 22) + 'px'); b.appendChild(sp); }
      card.appendChild(b);
    }
    return card;
  }
  function firstControl(stage, built) { return built.focus || stage.querySelector('button:not([disabled]), select, input'); }

  /* ---------- the player: one set, start to finish ---------- */
  function Player(host, set, lessonLink, onDone) {
    var live = liveRegion(), stage = h('div', { 'class': 'px-stage' }), meterEl = h('div', { 'class': 'px-meter' }), actions = h('div', { 'class': 'px-actions' });
    var state;
    host.innerHTML = '';
    host.classList.add('px-ready');
    host.setAttribute('data-px-type', set.type);
    host.appendChild(h('div', { 'class': 'px-head' }, [
      h('p', { 'class': 'px-kicker' }, [h('span', { 'class': 'px-type px-type-' + set.type, text: TYPE_LABEL[set.type] }), lessonLink ? h('a', { href: lessonLink, 'class': 'px-lesson-link', text: 'From lesson ' + parseInt(set.lesson, 10) }) : null]),
      h('h3', { 'class': 'px-title', text: set.title }), set.intro ? richEl('p', set.intro, 'px-intro') : null]));
    [stage, h('div', { 'class': 'px-foot' }, [meterEl, actions]), live.el].forEach(function (x) { host.appendChild(x); });

    function start(moveFocus) { state = { rounds: rounds(set), k: 0, score: 0, total: 0, streak: 0 }; show(moveFocus); }
    function show(moveFocus) {
      meter(meterEl, state.score + ' / ' + state.total, state.streak);
      stage.innerHTML = '';
      if (state.rounds.length > 1) stage.appendChild(h('p', { 'class': 'px-progress' }, [h('span', { 'class': 'px-dots', 'aria-hidden': 'true' }, state.rounds.map(function (x, i) { return h('span', { 'class': 'px-dot' + (i < state.k ? ' done' : i === state.k ? ' now' : '') }); })), ' Question ' + (state.k + 1) + ' of ' + state.rounds.length]));
      var built = question(actions, live.say, function (ctx) { return BUILD[set.type](set, state.rounds[state.k], ctx); }, function (res) {
        var all = res.score === res.total;
        state.score += res.score; state.total += res.total; state.streak = all ? state.streak + 1 : 0;
        meter(meterEl, state.score + ' / ' + state.total, state.streak);
        flash(host, all);
        live.say((all ? 'All correct. ' : res.score + ' of ' + res.total + ' correct. ') + (state.streak >= 2 ? state.streak + ' in a row.' : ''));
        var last = state.k === state.rounds.length - 1;
        nextButton(actions, last ? 'See my result' : 'Next', 'px-next', function () { if (last) finish(); else { state.k += 1; show(true); } });
      });
      stage.appendChild(built.el);
      host._px = { current: built };
      if (moveFocus) { var f = firstControl(stage, built); if (f) f.focus(); }
    }
    function finish() {
      var stars = starsFor(state.score, state.total), r = record(set.id, state.score, state.total);
      var pct = state.total ? Math.round(100 * state.score / state.total) : 0;
      stage.innerHTML = '';
      stage.appendChild(resultCard(stars, state.score + ' / ' + state.total + ' (' + pct + '%)',
        stars === 3 ? 'Perfect run!' : stars === 2 ? 'Strong work.' : stars === 1 ? 'Good start. Go again for more stars.' : 'Keep at it. A new mix is ready.',
        'Your best on this browser: ' + r.best + '%, ' + r.stars + ' star' + (r.stars === 1 ? '' : 's') + '.', stars === 3));
      host._px = { finished: true, stars: stars };
      live.say('Finished. ' + state.score + ' of ' + state.total + '. ' + stars + ' of 3 stars.');
      nextButton(actions, 'Play again: new mix', 'px-again', function () { start(true); });
      if (onDone) onDone();
    }
    start(false);
  }

  /* ---------- quick-fire: single questions drawn from every set of a skill ---------- */
  function quickItems(sets) {
    var out = [];
    sets.forEach(function (set) {
      if (set.type === 'choose' || set.type === 'numeric') set.items.forEach(function (it) { out.push({ set: set, type: set.type, item: it }); });
      else if (set.type === 'fill') set.items.forEach(function (it) { out.push({ set: set, type: 'fill', item: [it] }); });
      else if (set.type === 'sort') set.items.forEach(function (it) {
        var right = set.bins.filter(function (b) { return b.id === it.bin; })[0];
        out.push({ set: set, type: 'choose', item: { scene: set.ask || ('Which is it: ' + set.bins.map(function (b) { return b.label; }).join(', ') + '?'), q: '“' + it.t + '”',
          options: [right.label].concat(set.bins.filter(function (b) { return b.id !== it.bin; }).map(function (b) { return b.label; })), explain: it.why } });
      });
      else if (set.type === 'match' && set.pairs.length >= 3) set.pairs.forEach(function (p) {
        var others = pick(set.pairs.filter(function (x) { return x.b !== p.b; }), 3).map(function (x) { return x.b; });
        out.push({ set: set, type: 'choose', item: { scene: (set.left || 'Item') + ' → ' + (set.right || 'match'), q: p.a, options: [p.b].concat(others), explain: p.why } });
      });
    });
    return out;
  }

  function Arcade(host, skill) {
    var bank = PX.banks[skill];
    if (!bank) { host.textContent = 'Practice for this skill could not load.'; return; }
    var sets = bank.sets, titles = {};
    try { titles = JSON.parse(host.getAttribute('data-px-titles') || '{}'); } catch (err) { titles = {}; }
    function lessonHref(s) { return '../lessons/' + s.lesson + '/learner.html'; }
    function lessonName(s) { return titles[s.lesson] || s.lesson.replace(/^\d+-/, '').replace(/-/g, ' '); }
    var live = liveRegion(), timer = null;
    var top = h('section', { 'class': 'px-arcade-top', 'aria-labelledby': 'px-arcade-modes' });
    var player = h('section', { 'class': 'px-arcade-player', id: 'px-player', tabindex: '-1', hidden: true, 'aria-label': 'Practice' });
    var board = h('section', { 'class': 'px-board', 'aria-labelledby': 'px-arcade-sets' });
    host.innerHTML = ''; host.classList.add('px-ready');
    [top, player, board, live.el].forEach(function (x) { host.appendChild(x); });

    function paint() { var data = load(); paintTop(data); paintBoard(data); }
    function paintTop(data) {
      var p = progress(bank, data), q = (data.quick || {})[skill] || {};
      top.innerHTML = '';
      top.appendChild(h('div', { 'class': 'px-passport' }, [
        h('div', { 'class': 'px-passport-stars' }, [icon('star', 'on'), h('strong', { text: String(p.stars) }), h('span', { text: ' of ' + p.max + ' stars earned' })]),
        h('div', { 'class': 'px-bar', role: 'progressbar', 'aria-label': 'Stars earned', 'aria-valuemin': '0', 'aria-valuemax': String(p.max), 'aria-valuenow': String(p.stars) }, [h('span', { style: 'width:' + (p.max ? 100 * p.stars / p.max : 0) + '%' })]),
        h('p', { 'class': 'px-passport-note', text: p.played + ' of ' + p.sets + ' practice sets tried. Best quick-fire: ' + (q.strikes || 0) + ' (three strikes), ' + (q.timed || 0) + ' (90-second rush). Saved on this browser only.' })
      ]));
      top.appendChild(h('h2', { id: 'px-arcade-modes', text: 'Pick a game' }));
      top.appendChild(h('div', { 'class': 'px-modes' }, [
        modeCard('Surprise me', 'One random practice set from any lesson.', 'dice', function () { openSet(sets[Math.floor(rand() * sets.length)]); }),
        modeCard('Three strikes', 'Quick questions from every lesson. Keep going until you miss three. No timer.', 'flame', function () { quick('strikes'); }),
        modeCard('90-second rush', 'As many as you can get right in 90 seconds.', 'bolt', function () { quick('timed'); })
      ]));
    }
    function modeCard(title, text, ico, go) {
      return h('button', { type: 'button', 'class': 'px-mode px-mode-' + ico, onclick: go }, [h('span', { 'class': 'px-mode-title' }, [icon(ico, 'on'), ' ' + title]), h('span', { 'class': 'px-mode-text', text: text })]);
    }
    function paintBoard(data) {
      var saved = data.sets || {}, groups = {};
      board.innerHTML = '';
      board.appendChild(h('h2', { id: 'px-arcade-sets', text: 'Practice by lesson' }));
      sets.forEach(function (s) { (groups[s.lesson] = groups[s.lesson] || []).push(s); });
      Object.keys(groups).sort().forEach(function (lesson) {
        var first = groups[lesson][0], row = h('div', { 'class': 'px-tiles' });
        groups[lesson].forEach(function (s) {
          row.appendChild(h('button', { type: 'button', 'class': 'px-tile px-tile-' + s.type, 'data-set': s.id, onclick: function () { openSet(s); } }, [
            h('span', { 'class': 'px-tile-type', text: TYPE_LABEL[s.type] }), h('span', { 'class': 'px-tile-title', text: s.title }), starsEl(saved[s.id] ? saved[s.id].stars : 0)
          ]));
        });
        board.appendChild(h('div', { 'class': 'px-group' }, [h('h3', {}, [h('span', { 'class': 'num', text: String(parseInt(lesson, 10)) }), h('a', { href: lessonHref(first), text: lessonName(first) })]), row]));
      });
    }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    /* Open the player panel with a title bar. Back only hides it: scores were painted when play ended. */
    function openPlayer(label) {
      stopTimer(); player.hidden = false; player.innerHTML = '';
      player.appendChild(h('div', { 'class': 'px-player-bar' }, [h('p', { 'class': 'px-kicker', text: label }),
        btn('Back to all practice', 'px-quiet px-back', function () { stopTimer(); player.hidden = true; player.innerHTML = ''; top.querySelector('.px-mode').focus(); })]));
    }
    function showPlayer() { player.focus(); player.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); }
    function openSet(s) {
      openPlayer('Practice set');
      var slot = h('div', { 'class': 'px px-in-arcade' }); player.appendChild(slot);
      Player(slot, s, lessonHref(s), paint);
      showPlayer();
    }
    function quick(kind) {
      openPlayer(kind === 'timed' ? '90-second rush' : 'Three strikes');
      var pool = shuffle(quickItems(sets)), k = 0, score = 0, misses = 0, streak = 0, best = 0, left = 90, over = false;
      var hud = h('div', { 'class': 'px-hud' }), stage = h('div', { 'class': 'px px-in-arcade px-ready px-quick' }), actions = h('div', { 'class': 'px-actions' });
      [hud, stage, actions].forEach(function (x) { player.appendChild(x); });
      function paintHud() {
        meter(hud, String(score), streak);
        if (kind === 'timed') hud.appendChild(h('span', { 'class': 'px-clock' + (left <= 10 ? ' px-late' : ''), text: '0:' + (left < 10 ? '0' : '') + Math.max(0, left) }));
        else hud.appendChild(h('span', { 'class': 'px-strikes', role: 'img', 'aria-label': misses + ' of 3 misses' }, [0, 1, 2].map(function (i) { return h('span', { 'class': 'px-strike' + (i < misses ? ' on' : ''), html: ICON.cross }); })));
      }
      function next() {
        if (over) return;
        if (k >= pool.length) pool = pool.concat(shuffle(quickItems(sets)));
        var q = pool[k++];
        stage.innerHTML = '';
        stage.appendChild(h('p', { 'class': 'px-kicker' }, [h('a', { href: lessonHref(q.set), text: 'Lesson ' + parseInt(q.set.lesson, 10) + ': ' + lessonName(q.set) })]));
        var built = question(actions, live.say, function (ctx) { return BUILD[q.type](q.set, q.item, ctx); }, function (res) {
          if (over) return;
          var ok = res.score === res.total;
          if (ok) { score += 1; streak += 1; } else { misses += 1; streak = 0; }
          best = Math.max(best, streak); paintHud();
          flash(stage, ok);
          live.say(ok ? 'Correct.' : 'Not quite.');
          if (kind === 'strikes' && misses >= 3) nextButton(actions, 'See my result', 'px-next', done);
          else nextButton(actions, 'Next', 'px-next', next);
        });
        stage.appendChild(built.el);
        player._px = { built: built };
        var f = firstControl(stage, built); if (f) f.focus();
      }
      function done() {
        over = true; stopTimer();
        var data = load(); data.quick = data.quick || {}; var q = data.quick[skill] = data.quick[skill] || {};
        var prev = q[kind] || 0, newBest = score > prev && score > 0; q[kind] = Math.max(prev, score); save(data);
        stage.innerHTML = '';
        stage.appendChild(resultCard(score >= 15 ? 3 : score >= 10 ? 2 : score >= 5 ? 1 : 0, score + ' correct',
          newBest ? 'New personal best!' : 'Your best: ' + Math.max(prev, score) + '.', 'Longest streak this run: ' + best + '.', newBest));
        player._px = { finished: true, score: score };
        live.say('Finished with ' + score + ' correct.');
        nextButton(actions, 'Go again', 'px-again', function () { quick(kind); });
        paintTop(data);
      }
      paintHud(); next();
      if (kind === 'timed') timer = setInterval(function () {
        if (!player.isConnected || player.hidden) { stopTimer(); return; }
        left -= 1; paintHud();
        if (left === 30 || left === 10) live.say(left + ' seconds left.');
        if (left <= 0) done();
      }, 1000);
      showPlayer();
    }
    paint();
  }

  /* ---------- registration and mounting ---------- */
  PX.register = function (bank) {
    PX.banks[bank.skill] = bank;
    (bank.sets || []).forEach(function (set) {
      if (!Object.prototype.hasOwnProperty.call(BUILD, set.type)) throw new Error('Unknown practice type ' + set.type + ' in ' + set.id);
      PX.sets[set.id] = set;
    });
    /* Deferred scripts run after the page is parsed, so a bank can mount its own sets at once. */
    if (doc.readyState !== 'loading') mountAll(false);
  };

  /* Safe to call many times: each block mounts once. A set still missing when the page has
     finished loading is hidden, and its lesson keeps the paper Practice tasks. */
  function mountAll(final) {
    Array.prototype.forEach.call(doc.querySelectorAll('.px[data-px]'), function (el) {
      if (el.classList.contains('px-ready')) return;
      var set = PX.sets[el.getAttribute('data-px')];
      if (set) Player(el, set, null, null);
      else if (final === true) el.classList.add('px-missing');
    });
    Array.prototype.forEach.call(doc.querySelectorAll('.px-arcade[data-px-skill]'), function (el) {
      if (!el.classList.contains('px-ready') && (PX.banks[el.getAttribute('data-px-skill')] || final === true)) Arcade(el, el.getAttribute('data-px-skill'));
    });
  }
  if (doc.readyState === 'complete') setTimeout(function () { mountAll(true); }, 0);
  else {
    doc.addEventListener('DOMContentLoaded', function () { mountAll(false); });
    window.addEventListener('load', function () { mountAll(true); });
  }
})();
