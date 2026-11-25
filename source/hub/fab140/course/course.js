/* Intake 140 course games: picture match, pairs, flashcards, quiz, put in order, sort.
   Page data sits in <script id="cd" type="application/json">. Each game hydrates its own section. */
(function () {
  'use strict'
  var D = JSON.parse(document.getElementById('cd').textContent)
  var IMG = document.body.getAttribute('data-img') || 'img/'
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e }
  function shuffle(a) { a = a.slice(); a.forEach(function (_, i) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t }); return a }
  function pick(a, n) { return shuffle(a).slice(0, n) }
  function say(t) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    var u = new SpeechSynthesisUtterance(t); u.rate = 0.85; window.speechSynthesis.speak(u)
  }
  function speakBtn(text) { var b = el('button', 'g-say', '🔊'); b.type = 'button'; b.setAttribute('aria-label', 'Read aloud'); b.onclick = function () { say(text()) }; return b }
  function bar(root, title) {
    root.textContent = ''
    var h = el('div', 'g-bar'), s = el('p', 'g-score', ''), f = el('p', 'g-feedback', '')
    f.setAttribute('aria-live', 'polite'); h.appendChild(el('p', 'g-title', title)); h.appendChild(s); root.appendChild(h)
    var body = el('div', 'g-body'); root.appendChild(body); root.appendChild(f)
    return { body: body, score: s, fb: f }
  }
  function again(root, label, fn) { var b = el('button', 'g-btn g-next', label); b.type = 'button'; b.onclick = fn; root.appendChild(b); b.focus() }
  function img(c) { var i = el('img', 'g-img'); i.src = IMG + c.img; i.alt = 'Picture from the course: which one is this?'; i.loading = 'lazy'; return i }

  /* 1. Picture match: one picture, four names */
  function match(root) {
    var pool = D.cards, labels = Array.from(new Set(pool.map(function (c) { return c.label })))
    if (labels.length < 4) { root.hidden = true; return }
    var round = pick(pool, Math.min(10, pool.length)), k = 0, right = 0
    var ui = bar(root, 'Picture match')
    function show() {
      ui.body.textContent = ''; ui.fb.textContent = ''; ui.score.textContent = 'Picture ' + (k + 1) + ' of ' + round.length + ' · ' + right + ' right'
      var c = round[k], opts = shuffle([c.label].concat(pick(labels.filter(function (l) { return l !== c.label }), 3)))
      ui.body.appendChild(img(c))
      var g = el('div', 'g-opts')
      opts.forEach(function (o) {
        var b = el('button', 'g-btn', o); b.type = 'button'
        b.onclick = function () {
          var ok = o === c.label; if (ok) right++
          Array.from(g.children).forEach(function (x) { x.disabled = true; if (x.textContent === c.label) x.classList.add('g-ok') })
          if (!ok) b.classList.add('g-no')
          ui.fb.textContent = (ok ? '✔ Yes. ' : '✘ It is: ') + c.label + '. (' + c.src + ')'
          say(c.label)
          again(ui.body, k + 1 < round.length ? 'Next picture →' : 'See my score', function () { k++; k < round.length ? show() : done() })
        }
        g.appendChild(b)
      })
      ui.body.appendChild(g)
    }
    function done() { ui.body.textContent = ''; ui.fb.textContent = ''; ui.score.textContent = right + ' of ' + round.length + ' right'; again(ui.body, 'Play again', function () { match(root) }) }
    show()
  }

  /* 2. Pairs: tap a picture, then tap its name */
  function pairs(root) {
    var byLabel = {}
    D.cards.forEach(function (c) { if (!byLabel[c.label]) byLabel[c.label] = c })
    var keys = Object.keys(byLabel)
    if (keys.length < 4) { root.hidden = true; return }
    var set = pick(keys, 4).map(function (k) { return byLabel[k] }), done = 0, sel = null
    var ui = bar(root, 'Match the pairs')
    ui.score.textContent = 'Tap a picture, then tap its name.'
    var grid = el('div', 'g-pairs'), names = el('div', 'g-opts')
    set.forEach(function (c) {
      var b = el('button', 'g-pic'); b.type = 'button'; b.appendChild(img(c)); b.dataset.l = c.label
      b.onclick = function () { if (b.disabled) return; if (sel) sel.classList.remove('g-sel'); sel = b; b.classList.add('g-sel') }
      grid.appendChild(b)
    })
    shuffle(set).forEach(function (c) {
      var n = el('button', 'g-btn', c.label); n.type = 'button'
      n.onclick = function () {
        if (!sel || n.disabled) { ui.fb.textContent = 'Tap a picture first.'; return }
        if (sel.dataset.l === c.label) {
          sel.disabled = n.disabled = true; sel.classList.remove('g-sel'); sel.classList.add('g-ok'); n.classList.add('g-ok')
          sel.appendChild(el('span', 'g-tag', c.label)); sel = null; done++; say(c.label); ui.fb.textContent = '✔ ' + c.label
          if (done === set.length) { ui.fb.textContent = '✔ All matched.'; again(root, 'New set', function () { pairs(root) }) }
        } else { ui.fb.textContent = '✘ Not that one. Try another name.'; n.classList.add('g-no'); setTimeout(function () { n.classList.remove('g-no') }, 700) }
      }
      names.appendChild(n)
    })
    ui.body.appendChild(grid); ui.body.appendChild(names)
  }

  /* 3. Flashcards */
  function cards(root) {
    var t = D.terms
    if (!t.length) { root.hidden = true; return }
    var deck = shuffle(t), k = 0
    var ui = bar(root, 'Flashcards')
    function show() {
      ui.body.textContent = ''; ui.score.textContent = 'Card ' + (k + 1) + ' of ' + deck.length
      var c = deck[k], card = el('button', 'g-card'), front = true
      card.type = 'button'; card.appendChild(el('span', 'g-card-t', c.t)); card.appendChild(el('span', 'g-hint', 'Tap to turn over'))
      card.onclick = function () {
        front = !front; card.textContent = ''
        if (front) { card.appendChild(el('span', 'g-card-t', c.t)); card.appendChild(el('span', 'g-hint', 'Tap to turn over')) }
        else { card.appendChild(el('span', 'g-card-d', c.d)); card.appendChild(el('span', 'g-hint', c.s || '')) }
      }
      ui.body.appendChild(card)
      var nav = el('div', 'g-row')
      var p = el('button', 'g-btn', '← Back'); p.type = 'button'; p.onclick = function () { k = (k - 1 + deck.length) % deck.length; show() }
      var n = el('button', 'g-btn', 'Next →'); n.type = 'button'; n.onclick = function () { k = (k + 1) % deck.length; show() }
      nav.appendChild(p); nav.appendChild(speakBtn(function () { return c.t + '. ' + c.d })); nav.appendChild(n); ui.body.appendChild(nav)
    }
    show()
  }

  /* 4. Quiz: ten questions a round, drawn from the module bank */
  function quiz(root) {
    if (!D.quiz.length) { root.hidden = true; return }
    var round = pick(D.quiz, Math.min(10, D.quiz.length)), k = 0, right = 0
    var ui = bar(root, 'Quiz')
    function show() {
      ui.body.textContent = ''; ui.fb.textContent = ''; ui.score.textContent = 'Question ' + (k + 1) + ' of ' + round.length + ' · ' + right + ' right'
      var q = round[k], ans = q.o[q.a], opts = q.o.length === 2 ? q.o.slice() : shuffle(q.o)
      var row = el('div', 'g-row g-q'); row.appendChild(el('p', 'g-qt', q.q)); row.appendChild(speakBtn(function () { return q.q })); ui.body.appendChild(row)
      var g = el('div', 'g-opts g-col')
      opts.forEach(function (o) {
        var b = el('button', 'g-btn', o); b.type = 'button'
        b.onclick = function () {
          var ok = o === ans; if (ok) right++
          Array.from(g.children).forEach(function (x) { x.disabled = true; if (x.textContent === ans) x.classList.add('g-ok') })
          if (!ok) b.classList.add('g-no')
          ui.fb.textContent = (ok ? '✔ Right. ' : '✘ The answer is: ' + ans + '. ') + 'Source: ' + q.s
          again(ui.body, k + 1 < round.length ? 'Next question →' : 'See my score', function () { k++; k < round.length ? show() : end() })
        }
        g.appendChild(b)
      })
      ui.body.appendChild(g)
    }
    function end() { ui.body.textContent = ''; ui.fb.textContent = ''; ui.score.textContent = right + ' of ' + round.length + ' right. ' + D.quiz.length + ' questions in this bank.'; again(ui.body, 'New round', function () { quiz(root) }) }
    show()
  }

  /* 5. Put in order: tap the steps from first to last */
  function order(root) {
    if (!D.steps.length) { root.hidden = true; return }
    var s = 0
    function play(idx) {
      var set = D.steps[idx], next = 0
      var ui = bar(root, 'Put in order')
      if (D.steps.length > 1) {
        var pickr = el('div', 'g-row g-tabs')
        D.steps.forEach(function (x, i) { var b = el('button', 'g-chip' + (i === idx ? ' g-sel' : ''), x.title); b.type = 'button'; b.onclick = function () { play(i) }; pickr.appendChild(b) })
        ui.body.appendChild(pickr)
      }
      ui.score.textContent = set.title + '. Tap step 1, then step 2, and so on.'
      var done = el('ol', 'g-done'), left = el('div', 'g-opts g-col')
      shuffle(set.items.map(function (t, i) { return { t: t, i: i } })).forEach(function (it) {
        var b = el('button', 'g-btn', it.t); b.type = 'button'
        b.onclick = function () {
          if (it.i === next) { next++; b.remove(); done.appendChild(el('li', 'g-ok', it.t)); say(it.t); ui.fb.textContent = '✔ Step ' + next
            if (next === set.items.length) { ui.fb.textContent = '✔ All in order. Source: ' + set.src; again(root, 'Try again', function () { play(idx) }) } }
          else { b.classList.add('g-no'); ui.fb.textContent = '✘ Not yet. What comes next?'; setTimeout(function () { b.classList.remove('g-no') }, 700) }
        }
        left.appendChild(b)
      })
      ui.body.appendChild(done); ui.body.appendChild(left)
    }
    play(s)
  }

  /* 6. Sort: tap a card, then tap the box it belongs in */
  function sort(root) {
    if (!D.sorts.length) { root.hidden = true; return }
    function play(idx) {
      var set = D.sorts[idx], items = shuffle(set.items), k = 0, right = 0
      var ui = bar(root, 'Sort it')
      if (D.sorts.length > 1) {
        var pickr = el('div', 'g-row g-tabs')
        D.sorts.forEach(function (x, i) { var b = el('button', 'g-chip' + (i === idx ? ' g-sel' : ''), x.title); b.type = 'button'; b.onclick = function () { play(i) }; pickr.appendChild(b) })
        ui.body.appendChild(pickr)
      }
      var stage = el('div', 'g-stage'); ui.body.appendChild(stage)
      function show() {
        stage.textContent = ''; ui.score.textContent = set.title + ' · ' + (k + 1) + ' of ' + items.length
        var it = items[k], card = el('p', 'g-sortcard', it[0]); stage.appendChild(card)
        var bins = el('div', 'g-opts')
        set.bins.forEach(function (bn, bi) {
          var b = el('button', 'g-btn g-bin', bn); b.type = 'button'
          b.onclick = function () {
            var ok = bi === it[1]; if (ok) right++
            Array.from(bins.children).forEach(function (x, xi) { x.disabled = true; if (xi === it[1]) x.classList.add('g-ok') })
            if (!ok) b.classList.add('g-no')
            ui.fb.textContent = (ok ? '✔ ' : '✘ It goes in: ') + set.bins[it[1]]
            again(stage, k + 1 < items.length ? 'Next →' : 'See my score', function () { k++; if (k < items.length) show(); else { stage.textContent = ''; ui.fb.textContent = 'Source: ' + set.src; ui.score.textContent = right + ' of ' + items.length + ' right'; again(stage, 'Again', function () { play(idx) }) } })
          }
          bins.appendChild(b)
        })
        stage.appendChild(bins)
      }
      show()
    }
    play(0)
  }

  var G = { match: match, pairs: pairs, cards: cards, quiz: quiz, order: order, sort: sort }
  document.querySelectorAll('[data-game]').forEach(function (s) { var f = G[s.getAttribute('data-game')]; if (f) f(s) })
})()
