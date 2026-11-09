/* TIKeys: TI-30Xa key-chip blocks and the written-expression-to-keys converter (fromExpr).
   Copied unchanged from the Numeracy Hub's Carpentry tab (the second script of its src-carp page, after the TI30 engine).
   There is no separate source file for it in the repo. The TI30 engine it needs is source/calc2/ti30.js, which inject.py
   inlines ahead of this file. */

/* Key-cap chips for TI-30Xa button sequences, plus a converter from written expressions to key presses.
   Needs TI30 (ti_engine.js). Works inside the hub pages and in the shell page. */
(function (G) {
  'use strict';
  var T = G.TI30 || (typeof require === 'function' ? require('./ti_engine.js') : null);
  var OPS = { add: 1, sub: 1, mul: 1, div: 1, eq: 1 };
  var NUMS = { dot: 1, neg: 1 };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function cls(id) {
    if (/^d[0-9]$/.test(id) || NUMS[id]) return 'tk tk-num';
    if (OPS[id]) return 'tk tk-op';
    if (id === 'onc') return 'tk tk-op';
    return 'tk tk-fn';
  }

  function chips(seq) {
    var out = '';
    T.tokens(seq).forEach(function (t) {
      if (t.num != null) {
        out += '<kbd class="tk tk-num">' + esc(t.num) + '</kbd>';
        if (t.neg) out += '<kbd class="tk tk-num">' + esc(T.KEYS.neg[0]) + '</kbd>';
        return;
      }
      if (t.key === '2nd') { out += '<kbd class="tk tk-2nd">2nd</kbd>'; return; }
      if (t.second) { out += '<kbd class="tk tk-2nd">2nd</kbd><kbd class="tk tk-fn tk-sec">' + esc(T.KEYS[t.key][1]) + '</kbd>'; return; }
      out += '<kbd class="' + cls(t.key) + '">' + esc(T.KEYS[t.key][0]) + '</kbd>';
    });
    return out;
  }
  function screen(seq) {
    var c = new T.Calc();
    c.run(seq);
    return c.display();
  }
  function screenHtml(d) {
    return '<span class="tk-lcd">' + esc(d.main) + (d.exp ? '<sup>' + esc(d.exp) + '</sup>' : '') + '</span>';
  }

  /* One block of sequences. list: [{label, seq}]. opts.hideScreen hides the final display. */
  function html(list, opts) {
    opts = opts || {};
    if (!list || !list.length) return '';
    var h = '<div class="tikeys"><p class="tikeys-h"><span class="tikeys-title">On the TI-30Xa</span><span class="tikeys-sub">Start with <kbd class="tk tk-op">ON/C</kbd><kbd class="tk tk-op">ON/C</kbd> and DEG on the screen.</span></p><ol class="tikeys-list">';
    list.forEach(function (k) {
      var d = screen(k.seq);
      h += '<li class="tikeys-row"><span class="tikeys-lab">' + esc(k.label) + '</span><span class="tikeys-seq">' + chips(k.seq) + '</span>' +
        '<span class="tikeys-out">' + (opts.hideScreen ? '' : '<span class="tikeys-scr">Screen</span>' + screenHtml(d)) +
        '<button type="button" class="tikeys-run" data-seq="' + esc(k.seq) + '">Run on calculator</button></span></li>';
    });
    return h + '</ol></div>';
  }
  function render(container, list, opts) {
    if (!container) return;
    var old = container.querySelector(':scope > .tikeys');
    if (old) old.remove();
    var s = html(list, opts);
    if (s) container.insertAdjacentHTML('beforeend', s);
  }
  function run(seq) {
    if (G.TICalc && G.TICalc.play) { G.TICalc.play(seq); return; }
    try { if (G.parent && G.parent !== G) G.parent.postMessage({ ti30: 'play', seq: seq }, '*'); } catch (e) { /* no parent */ }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.tikeys-run');
      if (b) { e.preventDefault(); run(b.getAttribute('data-seq')); }
    });
  }

  /* ---------- written expression to key presses ---------- */
  function lex(s) {
    var toks = [], i = 0;
    s = s.replace(/,(?=\d{3})/g, '');
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      var m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
      if (m) { toks.push({ t: 'n', v: parseFloat(m[1]), s: m[1] }); i += m[1].length; continue; }
      m = s.slice(i).match(/^(sin|cos|tan)\s*(\d+\.?\d*)\s*°/);
      if (m) { toks.push({ t: 'trig', f: m[1], v: parseFloat(m[2]), s: m[2] }); i += m[0].length; continue; }
      if (c === '½') { toks.push({ t: 'n', v: 0.5, s: '.5' }); i++; continue; }
      if (c === '¼') { toks.push({ t: 'n', v: 0.25, s: '.25' }); i++; continue; }
      if ('×÷+−-()²³π√'.indexOf(c) >= 0) { toks.push({ t: c === '-' ? '−' : c }); i++; continue; }
      throw new Error('Cannot read: ' + s.slice(i));
    }
    return toks;
  }
  function parse(s) {
    var toks = lex(s), p = 0;
    function peek() { return toks[p] && toks[p].t; }
    function expr() {
      var n = term();
      while (peek() === '+' || peek() === '−') { var op = toks[p++].t; n = { b: op, l: n, r: term() }; }
      return n;
    }
    function term() {
      var n = power();
      while (peek() === '×' || peek() === '÷') { var op = toks[p++].t; n = { b: op, l: n, r: power() }; }
      return n;
    }
    function power() {
      var n = unary();
      while (peek() === '²' || peek() === '³') { n = { u: toks[p++].t, a: n }; }
      return n;
    }
    function unary() {
      if (peek() === '√') { p++; return { u: '√', a: power() }; }
      return atom();
    }
    function atom() {
      var t = toks[p++];
      if (!t) throw new Error('Unexpected end');
      if (t.t === 'n') return { n: t.v, s: t.s };
      if (t.t === 'π') return { pi: true };
      if (t.t === 'trig') return { trig: t.f, n: t.v, s: t.s };
      if (t.t === '(') { var e = expr(); if (peek() !== ')') throw new Error('Missing )'); p++; return { paren: e }; }
      throw new Error('Unexpected ' + t.t);
    }
    var tree = expr();
    if (p !== toks.length) throw new Error('Extra input');
    return tree;
  }
  var D2R = Math.PI / 180;
  function ev(n) {
    if (n.pi) return T.PI12;
    if (n.trig) return Math[n.trig](n.n * D2R);
    if (n.paren) return ev(n.paren);
    if (n.u === '²') { var a = ev(n.a); return a * a; }
    if (n.u === '³') { var c = ev(n.a); return c * c * c; }
    if (n.u === '√') return Math.sqrt(ev(n.a));
    if (n.b) {
      var l = ev(n.l), r = ev(n.r);
      return n.b === '+' ? l + r : n.b === '−' ? l - r : n.b === '×' ? l * r : l / r;
    }
    return n.n;
  }
  var OPK = { '+': '+', '−': '−', '×': '×', '÷': '÷' };
  var TRK = { sin: 'SIN', cos: 'COS', tan: 'TAN' };
  function num(n) { return String(Number(n.toFixed(10))); }
  function infix(n) {
    if (n.pi) return 'π';
    if (n.trig) return n.s + ' ' + TRK[n.trig];
    if (n.paren) return '( ' + infix(n.paren) + ' )';
    if (n.u === '²') return infix(n.a) + ' x²';
    if (n.u === '³') return infix(n.a) + ' x³';
    if (n.u === '√') return infix(n.a) + ' √x';
    if (n.b) return infix(n.l) + ' ' + OPK[n.b] + ' ' + infix(n.r);
    return n.s != null ? n.s : num(n.n);
  }
  function leaf(n) { return n.n != null && !n.trig || n.pi; }
  /* Memory version for expressions with too many pending operations: work the inside first and store it. */
  function works(seq, want) {
    var c = new T.Calc();
    try { c.run(seq); } catch (e) { return false; }
    return !c.display().error && Math.abs(c.value() - want) <= 1e-9 * Math.max(1, Math.abs(want));
  }
  function mem(n, slot) {
    if (n.paren) return mem(n.paren, slot);
    if (works(infix(n) + ' =', ev(n))) return infix(n) + ' =';
    if (leaf(n) || n.trig) return infix(n);
    if (n.u) return mem(n.a, slot) + ' ' + (n.u === '²' ? 'x²' : n.u === '³' ? 'x³' : '√x');
    var r = n.r.paren ? n.r.paren : n.r;
    if (leaf(r) || r.trig) return mem(n.l, slot) + ' ' + OPK[n.b] + ' ' + infix(r) + ' =';
    if (slot > 3) throw new Error('Too deep');
    return mem(r, slot + 1) + ' STO ' + slot + ' ON/C ' + mem(n.l, slot + 1) + ' ' + OPK[n.b] + ' RCL ' + slot + ' =';
  }
  /* Returns { seq, value } or null when the expression cannot be keyed. */
  function fromExpr(text) {
    var tree;
    try { tree = parse(text); } catch (e) { return null; }
    var want = ev(tree), tries = [];
    tries.push(infix(tree) + ' =');
    try { tries.push(mem(tree, 1) + (/=$/.test(mem(tree, 1)) ? '' : ' =')); } catch (e) { /* skip */ }
    for (var i = 0; i < tries.length; i++) {
      var c = new T.Calc();
      try { c.run(tries[i]); } catch (e) { continue; }
      var d = c.display(), v = c.value();
      if (!d.error && Math.abs(v - want) <= 1e-9 * Math.max(1, Math.abs(want))) return { seq: tries[i].replace(/\s+/g, ' '), value: v };
    }
    return null;
  }
  /* For a Shape Studio item: the second line holds the numbers. */
  function forLines(lines, check) {
    var line = lines[1] || '';
    var eq = line.indexOf('=');
    if (eq < 0) return null;
    var r = fromExpr(line.slice(eq + 1));
    if (!r) return null;
    if (check != null && Math.abs(r.value - check) > 0.006 * Math.max(1, Math.abs(check))) return null;
    return r;
  }

  /* Every key sequence for a question, one after another, cleared between them. */
  function allSeq(list) { return (list || []).map(function (k) { return k.seq; }).join(' ON/C ON/C '); }
  var api = { allSeq: allSeq, chips: chips, html: html, render: render, run: run, screen: screen, fromExpr: fromExpr, forLines: forLines, parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else G.TIKeys = api;
})(typeof window !== 'undefined' ? window : global);
