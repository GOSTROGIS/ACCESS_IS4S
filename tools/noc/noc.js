/* NOC code finder. Vanilla JS, no network requests: all data comes from noc-data.js. */
(function () {
  'use strict';
  var D = window.NOC_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var input = $('q'), statusEl = $('status'), list = $('results'), moreBtn = $('more'), emptyEl = $('empty');

  if (!D || !D.units) {
    statusEl.textContent = 'The NOC list did not load. Reload the page to try again.';
    return;
  }

  var PROFILE = 'https://noc.esdc.gc.ca/Structure/NocProfile?GocTemplateCulture=en-CA&version=2021.0&code=';
  var JOBBANK = 'https://www.jobbank.gc.ca/trend-analysis/search-occupations';
  var PAGE = 20;
  var TEER_PLAIN = {
    '0': 'Management jobs',
    '1': 'Usually a university degree',
    '2': 'Usually a 2 to 3 year college program or a 2 to 5 year apprenticeship, or supervisory or major safety duties',
    '3': 'Usually a college program or apprenticeship under 2 years, or more than 6 months of on-the-job training',
    '4': 'Usually high school, or several weeks of on-the-job training',
    '5': 'A short work demonstration, no formal education needed'
  };
  var STOP = { and: 1, or: 1, of: 1, the: 1, a: 1, an: 1, in: 1, for: 1, to: 1, de: 1, des: 1, du: 1, la: 1, le: 1, les: 1, et: 1, noc: 1, cnp: 1 };

  /* ---------- text helpers ---------- */
  function fold(ch) {
    var c = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
    c = c.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
    return c.replace(/[^a-z0-9]/g, ' ');
  }
  function norm(s) { return fold(s).replace(/\s+/g, ' ').trim(); }
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function words(s) { var n = norm(s); return n ? n.split(' ').map(stem) : []; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- build the index ---------- */
  function entry(text) { var w = words(text); return { w: w, j: w.join(' ') }; }
  var U = D.units.map(function (u) {
    var ill = {};
    u[5].forEach(function (i) { ill[i] = 1; });
    return {
      code: u[0], title: u[1], fr: u[2], def: u[3], ex: u[4], ill: ill, inc: u[6], exc: u[7],
      it: entry(u[1]), ifr: entry(u[2] || ''), iex: u[4].map(entry)
    };
  });
  var RS = window.RED_SEAL_DATA ? window.RED_SEAL_DATA.trades : [];
  U.forEach(function (u) {
    u.rs = RS.filter(function (r) { return r.code === u.code; });
    u.irs = u.rs.map(function (r) { return entry(r.name); });
  });
  var byCode = {};
  U.forEach(function (u) { byCode[u.code] = u; });

  var vocab = null;
  function buildVocab() {
    vocab = {};
    U.forEach(function (u) {
      [u.it, u.ifr].concat(u.iex, u.irs).forEach(function (e) {
        e.w.forEach(function (w) { if (w.length > 2) vocab[w] = (vocab[w] || 0) + 1; });
      });
    });
  }

  /* ---------- matching ---------- */
  // Level per token: 3 whole word, 2 start of a word, 1 inside a word (4+ letters), 0 none.
  function tokLevel(ws, t) {
    var best = 0;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (w === t) return 3;
      if (best < 2 && w.indexOf(t) === 0) best = 2;
      else if (best < 1 && t.length >= 4 && w.indexOf(t) > 0) best = 1;
    }
    return best;
  }
  function level(e, toks, qj) {
    if (!e.w.length) return 0;
    if (e.j === qj) return 4;
    var min = 3;
    for (var i = 0; i < toks.length; i++) {
      var l = tokLevel(e.w, toks[i]);
      if (!l) return 0;
      if (l < min) min = l;
    }
    return min;
  }
  function phraseBonus(e, qj) {
    if (e.j.indexOf(qj) === 0) return 40;
    return e.j.indexOf(qj) >= 0 ? 25 : 0;
  }

  function search(q) {
    var qn = norm(q);
    if (!qn) return { kind: 'none', items: [] };
    var codeQ = qn.replace(/^(noc|cnp) /, '');
    if (/^\d{1,5}$/.test(codeQ)) {
      var items = U.filter(function (u) { return u.code.indexOf(codeQ) === 0; })
        .map(function (u) { return { u: u, matches: [], score: u.code === codeQ ? 1000 : 500, via: 'code' }; });
      return { kind: 'code', items: items, code: codeQ };
    }
    var rawToks = qn.split(' ').map(stem), rawJoined = rawToks.join(' ');
    var toks = rawToks.slice();
    var kept = toks.filter(function (t) { return !STOP[t]; });
    if (kept.length) toks = kept;
    var qj = toks.join(' ');
    var out = [];
    for (var i = 0; i < U.length; i++) {
      var u = U[i];
      var lt = level(u.it, toks, qj);
      var lf = level(u.ifr, toks, qj);
      var ms = [];
      var bestEx = 0, bestExBonus = 0, illExact = 0;
      for (var k = 0; k < u.iex.length; k++) {
        var l = level(u.iex[k], toks, qj);
        if (l) {
          var pb = phraseBonus(u.iex[k], qj);
          ms.push({ i: k, l: l, b: pb });
          if (l > bestEx || (l === bestEx && pb > bestExBonus)) { bestEx = l; bestExBonus = pb; }
          if (l === 4 && u.ill[k]) illExact = 1;
        }
      }
      var sRS = 0;
      u.irs.forEach(function (e) {
        var match = level(e, rawToks, rawJoined);
        sRS = Math.max(sRS, match === 4 ? 1200 : match ? match * 200 + phraseBonus(e, rawJoined) : 0);
      });
      if (!lt && !lf && !ms.length && !sRS) continue;
      var sTitle = lt === 4 ? 1000 : lt ? lt * 200 + phraseBonus(u.it, qj) : 0;
      var sEx = bestEx === 4 ? 950 + illExact * 20 : bestEx ? bestEx * 180 + bestExBonus : 0;
      var sFr = lf === 4 ? 800 : lf ? lf * 150 + phraseBonus(u.ifr, qj) : 0;
      var score = Math.max(sTitle, sEx, sFr, sRS) + Math.min(ms.length, 15);
      ms.sort(function (a, b) { return (b.l - a.l) || (b.b - a.b) || (a.i - b.i); });
      out.push({ u: u, matches: ms, score: score, via: sRS > Math.max(sTitle, sEx, sFr) ? 'red-seal' : sTitle >= sEx && sTitle >= sFr ? 'title' : sEx >= sFr ? 'example' : 'fr' });
    }
    out.sort(function (a, b) { return (b.score - a.score) || (a.u.code < b.u.code ? -1 : 1); });
    return { kind: 'text', items: out, toks: toks };
  }

  /* ---------- highlighting ---------- */
  function highlight(text, toks) {
    if (!toks || !toks.length) return esc(text);
    var folded = '', map = [];
    for (var i = 0; i < text.length; i++) {
      var f = fold(text[i]);
      for (var k = 0; k < f.length; k++) { folded += f[k]; map.push(i); }
    }
    var marks = [];
    var re = /[a-z0-9]+/g, m;
    while ((m = re.exec(folded))) {
      var w = m[0], sw = stem(w), s = m.index, e = s + w.length, hit = null;
      for (var t = 0; t < toks.length && !hit; t++) {
        var tk = toks[t];
        if (sw === tk || sw.indexOf(tk) === 0 || w.indexOf(tk) === 0) hit = [s, e];
        else if (tk.length >= 4) {
          var p = w.indexOf(tk);
          if (p > 0) hit = [s + p, s + p + tk.length];
        }
      }
      if (hit) marks.push([map[hit[0]], map[hit[1] - 1] + 1]);
    }
    if (!marks.length) return esc(text);
    var html = '', pos = 0;
    marks.forEach(function (r) {
      if (r[0] < pos) return;
      html += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return html + esc(text.slice(pos));
  }

  /* ---------- rendering ---------- */
  var state = { q: '', res: null, shown: 0 };

  function plural(n, one, many) { return n === 1 ? one : many; }
  function fmt(n) { return n.toLocaleString('en-CA'); }

  function exclusionHTML(text) {
    return esc(text).replace(/\b(\d{5})\b/g, function (c) {
      return byCode[c] ? '<button type="button" class="code-link" data-code="' + c + '" aria-label="Search NOC ' + c + '">' + c + '</button>' : c;
    });
  }

  function cardHTML(item, idx, toks) {
    var u = item.u, c = u.code, teer = c.charAt(1), broad = c.charAt(0), major = c.slice(0, 2);
    var h = '<li class="noc-card"><article aria-labelledby="t-' + c + '">';
    h += '<div class="noc-top"><p class="noc-code"><small>NOC 2021 code</small>' + c + '</p>';
    h += '<button type="button" class="btn btn-copy" data-copy="' + c + '" aria-label="Copy NOC code ' + c + '">Copy code</button></div>';
    h += '<h3 id="t-' + c + '" tabindex="-1" data-idx="' + idx + '">' + highlight(u.title, item.via === 'title' ? toks : null) + '</h3>';
    if (u.fr) h += '<p class="noc-fr" lang="fr-CA"><span class="sr-only">French title: </span>' + highlight(u.fr, item.via === 'fr' ? toks : null) + '</p>';
    h += '<dl class="noc-facts">';
    h += '<div class="wide"><dt>TEER ' + teer + '</dt><dd><span class="teer" aria-hidden="true">TEER ' + teer + '</span>' + esc(TEER_PLAIN[teer]) + '</dd></div>';
    h += '<div><dt>Broad category ' + broad + '</dt><dd>' + esc(D.broad[broad] || '') + '</dd></div>';
    h += '<div><dt>Major group ' + major + '</dt><dd>' + esc(D.major[major] || '') + '</dd></div>';
    h += '</dl>';
    if (item.matches.length) {
      var top = item.matches.slice(0, 6);
      h += '<div class="noc-matches"><h4>' + (item.matches.length === 1 ? 'Matching example title' : 'Matching example titles') + '</h4><ul class="ex-list">';
      top.forEach(function (m) { h += '<li>' + highlight(u.ex[m.i], toks) + '</li>'; });
      h += '</ul>';
      if (item.matches.length > top.length) h += '<p class="ex-note">and ' + fmt(item.matches.length - top.length) + ' more matching ' + plural(item.matches.length - top.length, 'title', 'titles') + ' in the full list.</p>';
      h += '</div>';
    }
    if (u.rs.length) {
      h += '<div class="noc-red-seal-matches"><h4>Red Seal trades linked to this NOC group</h4><ul>';
      u.rs.forEach(function (r) { h += '<li><a href="' + esc(r.url) + '">' + esc(r.name) + '</a></li>'; });
      h += '</ul><p class="ex-note">Codes are listed on the official Red Seal trade pages. Match your job duties and check provincial requirements.</p></div>';
    }
    h += '<button type="button" class="btn btn-toggle" aria-expanded="false" aria-controls="more-' + c + '" data-code="' + c + '">Show all ' + fmt(u.ex.length) + ' example titles</button>';
    h += '<div class="noc-more" id="more-' + c + '" hidden></div>';
    h += '<ul class="noc-links">';
    h += '<li><a href="' + PROFILE + c + '" target="_blank" rel="noopener">Official NOC profile for ' + c + '<span class="sr-only"> (Government of Canada website, opens in a new tab)</span></a></li>';
    h += '<li><a href="' + JOBBANK + '" target="_blank" rel="noopener">Wages and outlook on Job Bank<span class="sr-only"> (opens in a new tab)</span></a></li>';
    h += '<li><p class="ex-note">Job Bank searches by job title, not by code. Type the job title there.</p></li>';
    h += '</ul></article></li>';
    return h;
  }

  function moreHTML(u, item, toks) {
    var matched = {};
    if (item) item.matches.forEach(function (m) { matched[m.i] = 1; });
    var h = '<div><h4>Lead statement</h4><p>' + esc(u.def) + '</p></div>';
    h += '<div><h4>TEER ' + u.code.charAt(1) + ', official wording</h4><p>' + esc(D.teer[u.code.charAt(1)]) + '</p></div>';
    h += '<div><h4>All example titles (' + fmt(u.ex.length) + ')</h4>';
    h += '<p class="ex-note">Titles in bold are the main (illustrative) examples. Highlighted words match your search.</p>';
    h += '<ul class="ex-list cols">';
    u.ex.forEach(function (t, i) {
      var txt = matched[i] ? highlight(t, toks) : esc(t);
      h += '<li' + (u.ill[i] ? ' class="ill"' : '') + '>' + txt + '</li>';
    });
    h += '</ul></div>';
    if (u.inc.length) {
      h += '<div><h4>Also included</h4><ul class="ex-list">';
      u.inc.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; });
      h += '</ul></div>';
    }
    if (u.exc.length) {
      h += '<div><h4>Not in this group (official exclusions)</h4><ul class="ex-list">';
      u.exc.forEach(function (t) { h += '<li>' + exclusionHTML(t) + '</li>'; });
      h += '</ul></div>';
    }
    return h;
  }

  function suggest(q) {
    if (!vocab) buildVocab();
    var toks = norm(q).split(' ').map(stem);
    var changed = false;
    var fixed = toks.map(function (t) {
      if (t.length < 3 || vocab[t]) return t;
      for (var w in vocab) if (w.indexOf(t) === 0) return t;
      var maxD = t.length <= 5 ? 1 : 2, best = null, bestD = 9, bestF = 0;
      for (var v in vocab) {
        if (Math.abs(v.length - t.length) > maxD) continue;
        var d = lev(t, v, maxD);
        if (d <= maxD && (d < bestD || (d === bestD && vocab[v] > bestF))) { best = v; bestD = d; bestF = vocab[v]; }
      }
      if (best) { changed = true; return best; }
      return t;
    });
    return changed ? fixed.join(' ') : null;
  }
  function lev(a, b, max) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function emptyHTML(q) {
    var s = suggest(q);
    var h = '<div class="noc-empty"><h3>No NOC unit group matches “' + esc(q) + '”</h3>';
    if (s) h += '<p>Did you mean <button type="button" class="code-link" data-q="' + esc(s) + '">' + esc(s) + '</button>?</p>';
    h += '<p>Try one of these:</p><ul>';
    h += '<li>Check the spelling, or type only the start of the word, such as <em>weld</em> or <em>electric</em>.</li>';
    h += '<li>Use the main task of the job, such as <em>drywall</em>, <em>roofing</em> or <em>forklift</em>.</li>';
    h += '<li>Use the English job title. French unit group titles also work, such as <em>électricien</em>.</li>';
    h += '<li>Browse the complete Red Seal trade list below.</li>';
    h += '<li>Search the <a href="https://noc.esdc.gc.ca/?GoCTemplateCulture=en-CA" target="_blank" rel="noopener">official NOC website<span class="sr-only"> (opens in a new tab)</span></a>.</li>';
    h += '</ul></div>';
    return h;
  }

  function render() {
    var res = state.res, q = state.q;
    emptyEl.innerHTML = '';
    if (!res || res.kind === 'none') {
      list.innerHTML = '';
      moreBtn.hidden = true;
      statusEl.textContent = 'Type a job title, trade or code to search ' + fmt(U.length) + ' NOC unit groups.';
      return;
    }
    var n = res.items.length;
    if (!n) {
      list.innerHTML = '';
      moreBtn.hidden = true;
      statusEl.textContent = 'No matches for “' + q + '”.';
      emptyEl.innerHTML = emptyHTML(q);
      return;
    }
    statusEl.textContent = fmt(n) + ' ' + plural(n, 'match', 'matches') + ' for “' + q + '”.' + (n > PAGE ? ' Showing the best ' + Math.min(state.shown, n) + '.' : '');
    var html = '';
    for (var i = 0; i < Math.min(state.shown, n); i++) html += cardHTML(res.items[i], i, res.toks);
    list.innerHTML = html;
    moreBtn.hidden = state.shown >= n;
    moreBtn.textContent = 'Show more results (' + fmt(Math.max(0, n - state.shown)) + ' left)';
  }

  function appendMore() {
    var res = state.res, n = res.items.length, start = state.shown;
    state.shown = Math.min(n, start + PAGE);
    var html = '';
    for (var i = start; i < state.shown; i++) html += cardHTML(res.items[i], i, res.toks);
    list.insertAdjacentHTML('beforeend', html);
    moreBtn.hidden = state.shown >= n;
    moreBtn.textContent = 'Show more results (' + fmt(Math.max(0, n - state.shown)) + ' left)';
    statusEl.textContent = fmt(n) + ' ' + plural(n, 'match', 'matches') + ' for “' + state.q + '”. Showing ' + state.shown + '.';
    var h = list.querySelector('h3[data-idx="' + start + '"]');
    if (h) h.focus();
  }

  function updateURL(q) {
    try {
      var url = new URL(window.location.href);
      if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) { /* file:// or sandboxed frames */ }
  }

  function syncChips(q) {
    var n = norm(q);
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (b) {
      b.setAttribute('aria-pressed', norm(b.getAttribute('data-q')) === n ? 'true' : 'false');
    });
  }

  function run(q) {
    state.q = q.trim();
    state.res = search(state.q);
    state.shown = PAGE;
    render();
    updateURL(state.q);
    syncChips(state.q);
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { run(input.value); }, 120);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.value = ''; run(''); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); run(input.value); }
    else if (e.key === 'ArrowDown') {
      var first = list.querySelector('h3[tabindex]');
      if (first) { e.preventDefault(); first.focus(); }
    }
  });
  $('clear').addEventListener('click', function () { input.value = ''; run(''); input.focus(); });
  moreBtn.addEventListener('click', appendMore);

  function setQuery(q) { input.value = q; run(q); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.classList.contains('chip')) { setQuery(t.getAttribute('data-q')); return; }
    if (t.classList.contains('code-link')) {
      setQuery(t.getAttribute('data-code') || t.getAttribute('data-q'));
      if (t.closest('#occupation-directory')) {
        var heading = list.querySelector('h3[tabindex]');
        if (heading) { heading.focus(); heading.scrollIntoView({ block: 'start' }); }
      } else input.focus();
      return;
    }
    if (t.classList.contains('btn-toggle')) {
      var c = t.getAttribute('data-code'), panel = $('more-' + c), open = t.getAttribute('aria-expanded') === 'true';
      if (!open && !panel.firstChild) {
        var item = null;
        if (state.res) state.res.items.some(function (it) { if (it.u.code === c) { item = it; return true; } return false; });
        panel.innerHTML = moreHTML(byCode[c], item, state.res && state.res.toks);
      }
      panel.hidden = open;
      t.setAttribute('aria-expanded', open ? 'false' : 'true');
      t.textContent = open ? 'Show all ' + fmt(byCode[c].ex.length) + ' example titles' : 'Hide the full list';
      return;
    }
    if (t.classList.contains('btn-copy')) {
      var code = t.getAttribute('data-copy');
      var done = function (ok) {
        t.textContent = ok ? 'Copied' : 'Code: ' + code;
        statusEl.textContent = ok ? 'NOC code ' + code + ' copied.' : 'Copy is not available here. The code is ' + code + '.';
        setTimeout(function () { t.textContent = 'Copy code'; }, 2000);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(false); });
      else done(false);
    }
  });

  // Arrow keys move between result titles.
  list.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var h = e.target.closest && e.target.closest('h3[tabindex]');
    if (!h) return;
    e.preventDefault();
    var heads = list.querySelectorAll('h3[tabindex]');
    var i = Array.prototype.indexOf.call(heads, h) + (e.key === 'ArrowDown' ? 1 : -1);
    if (i < 0) input.focus();
    else if (heads[i]) heads[i].focus();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  // Complete directory, built from the same authoritative dataset as search.
  // Put trades first without excluding trades classified in other categories.
  var directory = '';
  ['7', '6', '2', '8', '9', '0', '1', '3', '4', '5'].forEach(function (category) {
    var units = U.filter(function (u) { return u.code.charAt(0) === category; });
    units.sort(function (a, b) { return a.title.localeCompare(b.title, 'en-CA'); });
    directory += '<details' + (category === '7' ? ' open' : '') + '><summary>' + esc(D.broad[category]) + ' (' + units.length + ')</summary><ul>';
    units.forEach(function (u) {
      directory += '<li><button type="button" class="code-link" data-code="' + u.code + '">' + esc(u.title) + ' <span>(' + u.code + ')</span></button></li>';
    });
    directory += '</ul></details>';
  });
  $('occupation-directory').innerHTML = directory;
  $('coverage-summary').textContent = 'Search all 54 Red Seal trade names and the complete NOC 2021 list: ' + fmt(U.length) + ' occupation groups and ' + fmt(D.meta.exampleTitles) + ' official example job titles.';

  // The full Red Seal directory is present in HTML even if JavaScript is unavailable.
  var rsFilter = $('red-seal-filter');
  function filterRedSeal(q) {
    var tokens = words(q), count = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#red-seal-list > li'), function (item) {
      var indexed = entry(item.getAttribute('data-red-seal-name') + ' ' + item.getAttribute('data-red-seal-code'));
      var visible = !tokens.length || !!level(indexed, tokens, tokens.join(' '));
      item.hidden = !visible;
      if (visible) count++;
    });
    $('red-seal-status').textContent = count + ' of ' + RS.length + ' Red Seal trades' + (count ? '' : '. No matching trade. Try a shorter name or select Show all trades.');
  }
  if (rsFilter && RS.length) {
    $('red-seal-filter-controls').hidden = false;
    rsFilter.addEventListener('input', function () { filterRedSeal(rsFilter.value); });
    rsFilter.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { rsFilter.value = ''; filterRedSeal(''); }
    });
    $('red-seal-clear').addEventListener('click', function () { rsFilter.value = ''; filterRedSeal(''); rsFilter.focus(); });
    filterRedSeal('');
  }

  // TEER table
  var tb = document.querySelector('#teer-table tbody'), rows = '';
  ['0', '1', '2', '3', '4', '5'].forEach(function (k) {
    rows += '<tr><th scope="row">' + k + '</th><td>' + esc(TEER_PLAIN[k]) + '</td><td>' + esc(D.teer[k]) + '</td></tr>';
  });
  tb.innerHTML = rows;

  $('data-summary').textContent = D.meta.version + ' from Statistics Canada: ' + fmt(D.meta.unitGroups) + ' unit groups and ' + fmt(D.meta.exampleTitles) +
    ' official example job titles, downloaded ' + D.meta.downloaded + '. NOC 2021 Version 1.0 is the version in force on that date. All searching happens on this device. Nothing you type is sent anywhere.';

  var initial = '';
  try { initial = new URLSearchParams(window.location.search).get('q') || ''; } catch (e) { initial = ''; }
  input.value = initial;
  run(initial);
})();
