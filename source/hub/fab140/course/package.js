/* Try-it boxes on the package page. Each row holds the exact value (data-v), its unit (data-u) and the printed answer.
   Lengths are right within 1/32 inch of the exact value, which is the nearest sixteenth. */
(function () {
  'use strict'
  function inches(s) {
    s = String(s).trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'")
    var ft = 0, m = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(.*)$/)
    if (m) { ft = Number(m[1]) * 12; s = m[2] }
    s = s.replace(/"|inches|inch|in\b/gi, '').trim()
    if (!s) return m ? ft : NaN
    var total = 0, ok = true
    s.split(/\s+/).forEach(function (p) {
      var f = p.match(/^(\d+)\/(\d+)$/)
      if (f) total += Number(f[1]) / Number(f[2])
      else if (/^\d*\.?\d+$/.test(p)) total += Number(p)
      else ok = false
    })
    return ok ? ft + total : NaN
  }
  function plain(s) { return Number(String(s).replace(/,/g, '').replace(/[a-z ]+$/i, '').trim()) }
  var TOL = { ftin: 1 / 32 + 1e-9, mm: 0.5 + 1e-9, mm1: 0.05 + 1e-9, num: 0.005 + 1e-9 }
  Array.from(document.querySelectorAll('.pk-row')).forEach(function (row) {
    var v = Number(row.getAttribute('data-v')), u = row.getAttribute('data-u'), ans = row.getAttribute('data-ans')
    var inp = row.querySelector('input'), fb = row.querySelector('.pk-fb'), btn = row.querySelector('.pk-check')
    function check() {
      if (!inp.value.trim()) { fb.textContent = 'Type an answer first.'; return }
      var x = u === 'ftin' ? inches(inp.value) : plain(inp.value)
      if (isNaN(x)) { fb.textContent = 'Write it like ' + ans + '.'; fb.className = 'pk-fb'; return }
      var right = Math.abs(x - v) <= TOL[u]
      fb.textContent = right ? '✔ Right: ' + ans : '✘ Not yet. Try again, or open Show me.'
      fb.className = 'pk-fb ' + (right ? 'g-ok' : 'g-no')
    }
    btn.addEventListener('click', check)
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check() })
  })
})()
