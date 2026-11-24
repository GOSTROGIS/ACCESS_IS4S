"""Adds parallel line development to Shape Canvas (Metal Fabricator Intake 140, lesson 10).

The mitred cylinder (a pipe cut at an angle) gets a "Metal fab shop sheets" section:
stretch-out SO = pi x D, one of the 12 spaces SO / 12, the rise of the cut k = r x tan(theta),
and element lines 1 to 7: e = L - k x cos(30 deg x (n - 1)). Lines 8 to 12 repeat 6 to 2.
A shared link (#sc=) can switch the rows on with s[i].x.fab = {"pld": true}.

Run from the repo root: python3 source/hub/fab140/patch_shape_canvas.py
It changes nothing if the rows are already there.
"""
import pathlib
import sys

PAGE = pathlib.Path('skills/numeracy/shape-canvas/index.html')
MARK = 'function pldRows('


def sub(s, old, new):
    if s.count(old) != 1:
        sys.exit('expected one match for: ' + old[:70])
    return s.replace(old, new)


def main():
    s = PAGE.read_text(encoding='utf-8')
    if MARK in s:
        print('Shape Canvas already has the parallel line rows')
        return
    s = sub(s, "var SHAPES = { pipe: 1, cylinder: 1, 'angle-iron': 1, 'right-triangle': 1 }",
            "var SHAPES = { pipe: 1, cylinder: 1, 'angle-iron': 1, 'right-triangle': 1, 'mitred-cylinder': 1 }")
    s = sub(s, "  /* ---------- angle iron: formed plate ---------- */",
            """  /* ---------- mitred cylinder: parallel line development in 12 spaces ---------- */
  function pldRows(o, p, f) {
    var r = +p.r, L = +p.L, th = +p.t, out = []
    if (!f.pld || !(r > 0 && L > 0 && th > 0 && th < 90)) return out
    var D = 2 * r, SO = PI * D, S = SO / 12, kk = r * Math.tan(th * PI / 180)
    out.push(row('SO', 'SO', 'Stretch-out of the pattern (π × D)', SO, L3('SO', 'π × D', 'π × ' + n6(D), lenT(SO))))
    out.push(row('S', 'S', 'One of the 12 equal spaces (SO ÷ 12)', S, L3('S', 'SO ÷ 12', n6(SO) + ' ÷ 12', lenT(S))))
    out.push(row('K', 'k', 'Rise of the cut each side of the centre line (r × tan θ)', kk, L3('k', 'r × tan θ', n6(r) + ' × tan ' + n6(th) + '°', lenT(kk))))
    ;[1, 2, 3, 4, 5, 6, 7].forEach(function (i) {
      var a = 30 * (i - 1), e = L - kk * Math.cos(a * PI / 180)
      out.push(row('e' + i, 'e' + i, 'Element line ' + i + ', ' + a + '° around from the short side (L − k × cos ' + a + '°)', e, L3('e' + i, 'L − k × cos ' + a + '°', n6(L) + ' − ' + n6(kk) + ' × cos ' + a + '°', lenT(e))))
    })
    return out
  }
  /* ---------- angle iron: formed plate ---------- */""")
    s = sub(s, "      if (o.shape === 'angle-iron') return formRows(o, p, f)\n",
            "      if (o.shape === 'angle-iron') return formRows(o, p, f)\n      if (o.shape === 'mitred-cylinder') return pldRows(o, p, f)\n")
    s = sub(s, "    } else if (o.shape === 'angle-iron') {\n      var fm = f.form",
            """    } else if (o.shape === 'mitred-cylinder') {
      h += chk('pld', !!f.pld, 'Parallel line development: 12 spaces and the element lines')
      if (f.pld) h += '<p class="muted">D is the outside diameter, so SO = π × D. Point 1 is the shortest line and point 7 the longest. Lines 8 to 12 repeat lines 6 to 2.</p>'
    } else if (o.shape === 'angle-iron') {
      var fm = f.form""")
    s = sub(s, "      else if (x === 'rule') { if (el.checked) f.rule = true\n        else delete f.rule }",
            "      else if (x === 'rule') { if (el.checked) f.rule = true\n        else delete f.rule }\n      else if (x === 'pld') { if (el.checked) f.pld = true\n        else delete f.pld }")
    s = sub(s, "    } else if (x.truss && typeof x.truss === 'object') { out.truss = {}",
            "    } else if (id === 'mitred-cylinder') {\n      if (x.pld) out.pld = true\n    } else if (x.truss && typeof x.truss === 'object') { out.truss = {}")
    PAGE.write_text(s, encoding='utf-8')
    print('Shape Canvas: parallel line rows added')


if __name__ == '__main__':
    main()
