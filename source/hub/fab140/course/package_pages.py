"""Pages for the two worked-solution PDFs: the Metal Fab trades math package and the CWB all-position bend test.

package.html: every truss, formed-plate section and tank fit-up as a card. Each answer has a box to try it,
then "Show me" with the formula, the numbers, the TI-30Xa keys (played on the emulator) and the answer.
cwb-bend-test.html: the coupon to scale, the handout numbers worked with keys, and the handout checks.
Both pages carry games for course.js (quiz, flashcards, put in order, sort it).
"""
import random

import build_guides
import package as P
import shell

esc = build_guides.esc
SC = '../../../../skills/numeracy/shape-canvas/'
SRC = 'Metal Fab Package Worked Solutions'
CWB_SRC = 'CWB Bend Test Worked Numbers'
KIND = {'truss': 'Truss', 'radius': 'Formed plate', 'tank': 'Tank'}


def sc_link(shape):
    return build_guides.sc_shape_href(shape, SC)


def shape_of(p):
    """The Shape Canvas shape for a problem, at its given sizes, or None."""
    g, num = dict(p['given']), p['num']
    if p['kind'] == 'truss':
        return {'n': p['name'] + ' half truss', 'u': 'in', 's': [{'i': 'right-triangle', 'p': {'b': round(num['B'], 4), 'h': round(num['A'], 4)}}],
                't': ['Run B = %s, rise A = %s.' % (g['B run'], g['A rise']), 'The long side is the top chord C = √(A² + B²).']}
    if p['kind'] == 'tank':
        return {'n': p['name'] + ' tank shell', 'u': 'in', 's': [{'i': 'cylinder', 'p': {'r': round(num['OD'] / 2, 4), 'h': round(p['rows'][0]['v'], 4)}}],
                't': ['Shell OD %s, shell length A = %s.' % (g['Shell OD'], p['rows'][0]['ans']), 'Stretch-out B = π × (OD − T).']}
    return None


def unit_of(p, row):
    """How a try-it box checks an answer: ftin, mm (whole), mm1 (to 0.1) or num (2 places)."""
    if row['u'] == 'mm':
        return 'mm1' if row['k'] == 'MR' else 'mm'
    return 'ftin' if row['u'] == 'in' else 'num'


def tx(x, y, s, cls='', anchor='middle'):
    return '<text x="%g" y="%g" text-anchor="%s"%s>%s</text>' % (x, y, anchor, ' class="%s"' % cls if cls else '', esc(s))


def fig_truss(p):
    """Half truss: heel left, peak over the right end of the run, one web."""
    g = dict(p['given'])
    A, B, E = p['num']['A'], p['num']['B'], p['num']['E']
    w = 420.0
    h = max(60, min(200, w * A / B))
    x0, y0 = 40, 30 + h
    xw = x0 + w * (B - E) / B
    yw = y0 - h * (B - E) / B
    s = ['<line x1="%g" y1="%g" x2="%g" y2="%g" class="st"/>' % (x0, y0, x0 + w, y0),
         '<line x1="%g" y1="%g" x2="%g" y2="%g" class="st"/>' % (x0 + w, y0, x0 + w, y0 - h),
         '<line x1="%g" y1="%g" x2="%g" y2="%g" class="st"/>' % (x0, y0, x0 + w, y0 - h),
         '<line x1="%g" y1="%g" x2="%g" y2="%g" class="web"/>' % (xw, y0, xw, yw),
         tx((x0 + xw) / 2, y0 + 20, 'F ?'), tx((xw + x0 + w) / 2, y0 + 20, 'E = ' + g['E web to peak']),
         tx(x0 + w / 2, y0 + 40, 'B run = ' + g['B run']), tx(x0 + w + 8, y0 - h / 2, 'A rise = ' + g['A rise'], anchor='start'),
         tx(xw + 6, (y0 + yw) / 2, 'G ?', anchor='start'), tx((x0 + xw) / 2 - 8, (y0 + yw) / 2 - 8, 'I ?', anchor='end'),
         tx((xw + x0 + w) / 2 - 8, (yw + y0 - h) / 2 - 8, 'H ?', anchor='end'), tx(x0 + w * 0.3, y0 - h * 0.3 - 26, 'C ?', anchor='end'),
         tx(x0 - 4, y0 + 20, 'heel', 'sm', 'start'), tx(x0 + w, y0 - h - 8, 'peak', 'sm')]
    return '<svg class="pk-fig" viewBox="0 0 640 %d" role="img" aria-label="Half truss %s">%s</svg>' % (y0 + 52, esc(p['name']), ''.join(s))


def fig_radius(p):
    """A formed plate: two straight legs joined by a 90 degree bend, with the A, B, C sections."""
    g = dict(p['given'])
    s = ['<path d="M60,40 L60,150 A60,60 0 0 0 120,210 L360,210" class="st thick"/>',
         '<line x1="44" y1="150" x2="76" y2="150" class="tick"/><line x1="120" y1="194" x2="120" y2="226" class="tick"/>',
         tx(40, 100, 'A ?', anchor='end'), tx(70, 205, 'B ?', anchor='end'), tx(240, 236, 'C ?'),
         tx(380, 60, 'Plate T = ' + g['Plate T'], anchor='start'), tx(380, 84, 'Inside radius = ' + g['Inside radius'], anchor='start'),
         tx(380, 108, 'OAL, A leg = ' + g['OAL, A leg'], anchor='start'), tx(380, 132, 'OAL, C leg = ' + g['OAL, C leg'], anchor='start'),
         tx(380, 164, 'Tick marks are the tangent points.', 'sm', 'start')]
    return '<svg class="pk-fig" viewBox="0 0 640 250" role="img" aria-label="Formed plate %s">%s</svg>' % (esc(p['name']), ''.join(s))


def fig_tank(p):
    g = dict(p['given'])
    s = ['<rect x="90" y="50" width="320" height="110" class="st"/>',
         '<ellipse cx="90" cy="105" rx="22" ry="55" class="st"/><ellipse cx="410" cy="105" rx="22" ry="55" class="st dash"/>',
         tx(250, 36, 'Overall length = ' + g['Overall length']), tx(440, 100, 'OD = ' + g['Shell OD'], anchor='start'),
         tx(440, 124, 'Shell T = ' + g['Shell T'], anchor='start'), tx(440, 148, 'End plate = ' + g['End plate EP'], anchor='start'),
         tx(250, 190, p['fit'] + ' end plates', 'sm')]
    return '<svg class="pk-fig" viewBox="0 0 640 205" role="img" aria-label="Tank %s">%s</svg>' % (esc(p['name']), ''.join(s))


FIG = {'truss': fig_truss, 'radius': fig_radius, 'tank': fig_tank}


def row_html(p, r, res):
    u = unit_of(p, r)
    return ('<div class="pk-row" data-v="%r" data-u="%s" data-ans="%s">'
            '<h4><span class="pk-k">%s</span> %s</h4><p class="pk-f">%s</p>'
            '<p class="pk-try"><label>Your answer <input type="text" inputmode="decimal" autocomplete="off"></label>'
            '<button type="button" class="g-btn pk-check">Check</button><span class="pk-fb" role="status"></span></p>'
            '<details class="pk-show"><summary>Show me</summary><p class="pk-n">%s = %s</p>%s'
            '<p class="pk-ans">%s = <strong>%s</strong></p></details></div>'
            ) % (r['v'], u, esc(r['ans']), esc(r['k']), esc(r['what']), esc(r['f']), esc(r['k']), esc(r['w']),
                 build_guides.keys_html(res[r['seq']]), esc(r['k']), esc(r['ans']))


def card(p, res):
    giv = ''.join('<div><dt>%s</dt><dd>%s</dd></div>' % (esc(a), esc(b)) for a, b in p['given'])
    shp = shape_of(p)
    link = ('<p><a class="sc-link" href="%s" target="_blank" rel="noopener">Open this shape in Shape Canvas</a></p>' % esc(sc_link(shp))) if shp else ''
    head = p['name'] + (' · ' + p['fit'] if p['kind'] == 'tank' else '')
    return ('<details class="pk" id="%s"><summary>%s</summary><dl class="pk-giv">%s</dl>%s%s%s</details>\n'
            ) % (p['name'].lower().replace(' ', '-'), esc(head), giv, FIG[p['kind']](p), link, ''.join(row_html(p, r, res) for r in p['rows']))


def mc(rng, q, right, pool, src):
    """A multiple-choice item: the right answer and up to three other answers of the same kind."""
    wrong = [x for x in dict.fromkeys(pool) if x != right]
    opts = [right] + rng.sample(wrong, min(3, len(wrong)))
    rng.shuffle(opts)
    return {'q': q, 'o': opts, 'a': opts.index(right), 's': src}


def quiz(ps):
    """Quiz items from every answer in the package. Wrong options are the same answer from the other sheets."""
    out = []
    for p in ps:
        rng = random.Random(p['name'])
        giv = ', '.join('%s %s' % (a, b) for a, b in p['given'])
        for r in p['rows']:
            pool = [x['ans'] for o in ps if o['kind'] == p['kind'] and o is not p for x in o['rows'] if x['k'] == r['k']]
            q = '%s %s%s (%s). What is %s, the %s?' % (KIND[p['kind']], p['name'], ' ' + p['fit'].lower() if p['kind'] == 'tank' else '',
                                                    giv, r['k'], r['what'][0].lower() + r['what'][1:])
            out.append(mc(rng, q, r['ans'], pool, '%s, %s' % (SRC, p['name'])))
    return out


def cwb_quiz():
    rng = random.Random('cwb')
    pool = [x[5] for x in P.CWB]
    return [mc(rng, '%s: %s = ?' % (x[1], x[2]), x[5], [y for y in pool if y.endswith(x[5][-1])], CWB_SRC) for x in P.CWB]


PKG_STEPS = [{'title': 'Work a formed plate (radiused section)', 'src': SRC + ', sheet 1 method',
              'items': ['Break up the section and label it A, B, C', 'Find the straight legs A and C to the tangent points',
                        'Find the mean radius, then the bend stretchout B', 'Draw the flat plate: A + B + C, bend lines, inside radius and angle']},
             {'title': 'Truss answers in the order they are worked', 'src': SRC + ', IT1 sheets',
              'items': ['F = B − E', 'D = A ÷ B × 12', 'G = F × A ÷ B', 'C = √(A² + B²)', 'I = √(F² + G²)', 'H = C − I']},
             {'title': 'Tank: from shell to gallons', 'src': SRC + ', tank sheets',
              'items': ['A, the shell length', 'B = π × (OD − T)', 'C, the shell mass', 'E, one end plate area', 'F, both end plates mass',
                        'J = C + F', 'K, the volume', 'L = K × 6.25 gallons']}]
PKG_SORTS = [{'title': 'Shell length A', 'src': SRC + ', tank fit-ups', 'bins': ['A = OAL − 2 × EP', 'A = OAL'],
              'items': [('Corner to corner', 0), ('Outside flush', 0), ('Inside flush', 1)]},
             {'title': 'End plate disc size', 'src': SRC + ', tank fit-ups', 'bins': ['Ø = ID (OD − 2T)', 'Ø = OD'],
              'items': [('Corner to corner', 0), ('Outside flush', 1), ('Inside flush', 0)]},
             {'title': 'Inside length for volume K', 'src': SRC + ', tank fit-ups', 'bins': ['Inside length = A', 'Inside length = OAL − 2 × EP'],
              'items': [('Corner to corner', 0), ('Outside flush', 0), ('Inside flush', 1)]}]
PKG_TERMS = [('MR, mean radius', 'MR = IR + ½T. The bend is measured along the middle of the plate.'),
             ('B, bend stretchout', 'B = π × MR × angle ÷ 180. A 90° bend is ½ of 180.'),
             ('A and C, straight legs', 'Each leg = OAL − (IR + T), to the tangent point.'),
             ('Reading R on a drawing', 'R is worked as the inside radius on every Radiused Sections sheet.'),
             ('Shell stretch-out', 'B = π × MD, and MD = OD − T.'),
             ('ID', 'ID = OD − 2T.'),
             ('Plate mass rule', '40.8 lb per sq ft at 1" thick. Inches: ÷ 144 for sq ft.'),
             ('Capacity factor', '1 cu ft = 6.25 gallons, as the instructor keys use. Cubic inches ÷ 1728 = cubic feet.'),
             ('Truss rise per foot, D', 'D = A ÷ B × 12: rise for each 12" of run.'),
             ('Truss web height, G', 'G = F × A ÷ B: the web has the same slope as the whole truss.'),
             ('Check a truss', 'I + H = C.'),
             ('Bolt hole check, I', 'I = √(G² + H²): the diagonal across the saddle bolt holes.')]
CWB_STEPS = [{'title': 'Strap layout, from the top of the coupon', 'src': CWB_SRC + ', part c',
              'items': ['19 mm (3/4") cut-off', '1st root bend strap, 38 mm', 'Face bend strap, 38 mm', '2nd root bend strap, 38 mm',
                        '17 mm (3/4") left at the start end']}]
CWB_SORTS = [{'title': 'Does the handout number check out?', 'src': CWB_SRC + ', part a and b',
              'bins': ['Matches (within 1/16" or nominal)', 'Check with the shop or inspector'],
              'items': [('%s: %s, handout %s' % (x[1], x[5], x[6]), 0 if x[7] in ('ok', 'near') else 1) for x in P.CWB if x[7]]}]
CWB_TERMS = [('Back-up bar', '50 × 6 × 180 mm (2" × 1/4" × 7").'),
             ('Plate 1', '10 × 75 × 150 mm, bevelled 30° one side.'),
             ('Plate 2', '10 × 75 × 150 mm, cut square one side.'),
             ('Before fit-up', 'Remove all mill scale, slag and torch drag lines from the weld areas and the back-up bar.'),
             ('1st pass (root pass) stop', 'About 2/3 to 3/4 of the joint length. The handout brackets 112 to 125 mm.'),
             ('2nd pass stop', 'About 1/4 to 1/3 of the joint length, 38 to 50 mm.'),
             ('The inspector', 'Tell the inspector once the first two stops are made, before you go on.'),
             ('Straps', 'From the top: 19 mm cut-off, then root bend, face bend, root bend at 38 mm each.'),
             ('Bevel width', '10 × tan 30° = 5.77 mm across the top face (3/16" on 3/8" plate).'),
             ('Not on the handout page', 'Root opening for each position, electrode sizes and root face. Ask for them.')]


PKG_INTRO = ('Every problem in the Metal Fab trades math package is here: the ten half trusses, eight formed plate sections, '
             'the formula sheet examples and twelve tank fit-ups. Try each answer first. Then open Show me for the formula, '
             'the numbers, the calculator keys and the answer. Lengths go to the nearest sixteenth of an inch. '
             'Everything else goes to two decimal places.')
CWB_INTRO = ('The CWB all-position bend test coupon is two 10 millimetre plates, 75 by 150, on a 50 by 6 by 180 millimetre back-up bar. '
             'Plate 1 is bevelled 30 degrees. Plate 2 is square. The first pass stops at about two thirds to three quarters of the joint. '
             'The second pass stops at about one quarter to one third. Tell the inspector once those two stops are made. '
             'Three bend straps, 38 millimetres each, are cut below a 19 millimetre cut-off: root bend, face bend, root bend.')


def package_page(ps, res):
    sec = {k: ''.join(card(p, res) for p in ps if p['kind'] == k) for k in KIND}
    form = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td><strong>%s</strong></td></tr>' % (esc(a), esc(b), res[c]['chips'], esc(e))
                   for a, b, c, v, e in P.FORMULA)
    fit = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % tuple(esc(x) for x in r) for r in
                  [('Corner to corner (ICC)', 'OAL − 2 × EP', 'ID (OD − 2T)', 'A'), ('Outside flush (IOF)', 'OAL − 2 × EP', 'OD', 'A'),
                   ('Inside flush (IIF)', 'OAL', 'ID (OD − 2T)', 'OAL − 2 × EP')])
    data = shell.game_data([], shell.terms(PKG_TERMS, SRC), quiz(ps), PKG_STEPS, PKG_SORTS)
    body = ('<p class="goal">Work every problem in the trades math package, with calculator keys for each answer.</p>\n'
            '<ul class="mod-nav"><li><a href="#trusses">Trusses</a></li><li><a href="#plate">Formed plate</a></li>'
            '<li><a href="#tanks">Tanks</a></li><li><a href="#sheets">Formula sheets</a></li><li><a href="#play">Games</a></li></ul>\n'
            '%s\n<p class="hint">%s</p>\n'
            '<section id="trusses"><h2>Half trusses IT1-a to IT1-j</h2><p>Given A (rise), B (run) and E. Find F, D, G, C, I and H. '
            'Check: I + H = C.</p>%s</section>\n'
            '<section id="plate"><h2>Formed plate: radiused sections</h2><p>MR = IR + ½T. A and C = OAL − (IR + T). B = π × MR × 90 ÷ 180. '
            'Flat plate = A + B + C. Metric to the nearest mm, imperial to the nearest 1/16".</p>%s</section>\n'
            '<section id="sheets"><h2>Formula sheet examples</h2><table class="pk-tab"><thead><tr><th>Sheet</th><th>Example</th>'
            '<th>TI-30Xa keys</th><th>Printed answer</th></tr></thead><tbody>%s</tbody></table></section>\n'
            '<section id="tanks"><h2>Tank fit-ups: weights and capacities</h2><p>The three fit-ups differ only in where the end plates sit.</p>'
            '<table class="pk-tab"><thead><tr><th>Fit-up</th><th>A, shell length</th><th>End plate Ø</th><th>Inside length (K, L)</th></tr></thead>'
            '<tbody>%s</tbody></table><p>Same on every tank: MD = OD − T, B = π × MD, ID = OD − 2T, C = A × B × T × 40.8 ÷ 144, '
            'D = √(A² + B²), E = π × Ø² ÷ 4 ÷ 144, F = E × EP × 40.8 × 2, I = √(G² + H²), J = C + F (saddles not included), '
            'K = π × ID² ÷ 4 × inside length ÷ 1728, L = K × 6.25.</p>%s'
            '<h3>Notes on the instructor keys</h3><ul><li>ICC-D prints the overall length as 12\'-0 18". The key uses 12\'-0 1/8". '
            'With 12\'-0 1/8" every ICC-D answer matches the key.</li><li>On IOF-B, IOF-C and IOF-D the key\'s J entry is not its own C + F. '
            'J here is C + F, which matches the key\'s C + F to within 0.01 lb of rounding.</li>'
            '<li>Sheet 5 of each tank set (ICC-E, IOF-E, IIF-E) is blank, with no givens to work.</li></ul></section>\n'
            '<section id="play"><h2>Games</h2><p class="hint">Quiz questions use the package answers, which are checked against the instructor keys.</p>\n%s</section>\n'
            '<script src="package.js"></script><script src="course.js"></script>'
            ) % (build_guides.listen('audio/package.mp3', 'Listen to how this page works.'), esc(PKG_INTRO), sec['truss'], sec['radius'], form, fit,
                 sec['tank'], shell.games(data, shell.TEXT_GAMES))
    return body


def cwb_svg():
    """Coupon face view, 2 px per mm. The start end is at the bottom, as the handout draws it.
    Red marks the stop ranges printed on the handout, gold the same stops worked from the fractions."""
    k, x0, top = 2, 150, 20
    y = lambda mm: top + 15 * k + (150 - mm) * k
    j = x0 + 75 * k
    s = ['<rect x="%g" y="%g" width="%g" height="%g" class="dash"/>' % (j - 25 * k, y(165), 50 * k, 180 * k),
         '<rect x="%g" y="%g" width="%g" height="%g" class="st"/>' % (x0, y(150), 75 * k, 150 * k),
         '<rect x="%g" y="%g" width="%g" height="%g" class="st"/>' % (j, y(150), 75 * k, 150 * k)]
    cuts = [(150, 131, '19 mm cut-off'), (131, 93, 'Root bend 38 mm'), (93, 55, 'Face bend 38 mm'), (55, 17, 'Root bend 38 mm'), (17, 0, '17 mm left')]
    for a, b, t in cuts:
        s.append('<line x1="%g" y1="%g" x2="%g" y2="%g" class="tick"/>' % (x0 - 6, y(b), j + 75 * k + 6, y(b)))
        s.append(tx(x0 - 10, (y(a) + y(b)) / 2 + 4, t, 'sm', 'end'))
    for lo, hi, cls, dx in [(112, 125, 'stop', -11), (38, 50, 'stop', -11), (100, 112.5, 'hold', 1), (37.5, 50, 'hold', 1)]:
        s.append('<rect x="%g" y="%g" width="10" height="%g" class="%s"/>' % (j + dx, y(hi), (hi - lo) * k, cls))
    r = j + 75 * k + 14
    s += [tx(r, y(122), '1st pass stop, handout: 112 to 125 mm', 'sm', 'start'),
          tx(r, y(108), '2/3 to 3/4 of 150 = 100 to 112.5 mm', 'sm', 'start'),
          tx(r, y(48), '2nd pass stop, handout: 38 to 50 mm', 'sm', 'start'),
          tx(r, y(36), '1/4 to 1/3 of 150 = 37.5 to 50 mm', 'sm', 'start'),
          tx(x0 + 8, y(74), 'Plate 1', 'sm', 'start'), tx(j + 75 * k - 8, y(74), 'Plate 2', 'sm', 'end'),
          tx(j, y(0) + 50, 'Plate 1 is bevelled 30°, plate 2 is square. The weld starts at the bottom.', 'sm'),
          tx(j, y(0) + 68, 'Dashed: back-up bar, 15 mm past each end. Red: handout. Gold: fractions.', 'sm')]
    return '<svg class="pk-fig" viewBox="0 0 700 %d" role="img" aria-label="CWB test coupon to scale">%s</svg>' % (y(0) + 80, ''.join(s))


def cwb_page(res):
    mark = {'ok': '✓ matches', 'near': '≈ nominal size', 'off': '✗ check', '': ''}
    parts = {'a': 'a. Metric to imperial (in = mm ÷ 25.4)', 'b': 'b. Where the stops go (the joint is 150 mm, 6")',
             'c': 'c. Strap layout: what is left at the start end', 'd': 'd. Groove and back-up bar'}
    tabs = ''
    for k, title in parts.items():
        rows = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td><strong>%s</strong></td><td>%s</td><td class="mk-%s">%s</td></tr>'
                       % (esc(x[1]), esc(x[2]), res[x[3]]['chips'], esc(x[5]), esc(x[6]), x[7] or 'na', mark[x[7]]) for x in P.CWB if x[0] == k)
        tabs += ('<h3>%s</h3><table class="pk-tab"><thead><tr><th>Item</th><th>Working</th><th>TI-30Xa keys</th><th>Answer</th>'
                 '<th>Handout</th><th>Check</th></tr></thead><tbody>%s</tbody></table>') % (esc(title), rows)
    data = shell.game_data([], shell.terms(CWB_TERMS, CWB_SRC), cwb_quiz(), CWB_STEPS, CWB_SORTS)
    return ('<p class="goal">Know the CWB all-position bend test coupon: the plates, the stops, the straps and the numbers to check.</p>\n'
            '<ul class="mod-nav"><li><a href="#coupon">The coupon</a></li><li><a href="#numbers">The numbers</a></li>'
            '<li><a href="#checks">Checks</a></li><li><a href="#play">Games</a></li></ul>\n%s\n<p class="hint">%s</p>\n'
            '<section id="coupon"><h2>The coupon, to scale</h2>%s<p>Every stop range lands inside a root bend strap. '
            'The 2nd pass stop is in the root bend nearest the start. The 1st pass stop is in the root bend at the far end.</p></section>\n'
            '<section id="numbers"><h2>The handout numbers, worked</h2><p class="hint">TI-30Xa: TAN goes after the angle, in DEG. '
            'For inches, take off the whole inches, × 16, round to the nearest sixteenth.</p>%s</section>\n'
            '<section id="checks"><h2>Checks on the handout</h2><ul>'
            '<li><b>Plate width.</b> 75 mm is 2 15/16". The handout prints 3 1/2" (88.9 mm). Ask which width the coupons are cut to.</li>'
            '<li><b>1st pass stop.</b> 2/3 to 3/4 of the joint is 100 to 112.5 mm (4" to 4 1/2"). The bracket, 112 to 125 mm (4 1/2" to 5"), '
            'is 3/4 to 5/6. They overlap only at about 112 mm (4 1/2"). Ask the inspector which one they hold you to.</li>'
            '<li><b>Bar and plate length.</b> 180 mm = 7 1/16" and 150 mm = 5 7/8", printed 7" and 6". Nominal sizes. Nothing to change.</li>'
            '<li><b>Not on the handout page.</b> Root opening for each position, electrode diameters and root face. The handout says these are given. Ask for them.</li>'
            '</ul></section>\n<section id="play"><h2>Games</h2>\n%s</section>\n<script src="course.js"></script>'
            ) % (build_guides.listen('audio/cwb-bend-test.mp3', 'Listen to the coupon facts.'), esc(CWB_INTRO), cwb_svg(), tabs,
                 shell.games(data, shell.TEXT_GAMES))


def extras():
    """Quiz, order and sort games each course module adds from these pages, by the name content.py uses."""
    return {'package': {'bank': quiz(P.problems()), 'steps': PKG_STEPS, 'sorts': PKG_SORTS},
            'cwb': {'bank': cwb_quiz(), 'steps': CWB_STEPS, 'sorts': CWB_SORTS}}


def build(out, voice=None):
    """Writes package.html and cwb-bend-test.html into out, with their audio when a voice is given."""
    ps = P.problems()
    bad = P.check(ps)
    if bad:
        raise SystemExit('package answers do not match the instructor keys: %s' % bad)
    res = build_guides.play([r['seq'] for p in ps for r in p['rows']] + [x[2] for x in P.FORMULA] + [x[3] for x in P.CWB])
    if any(r['error'] for r in res.values()):
        raise SystemExit('calculator error')
    (out / 'package.html').write_text(shell.page('Trades math package, worked', 'math.html', 'Math course module',
                                                 package_page(ps, res), 'Metal Fab package'), encoding='utf-8')
    (out / 'cwb-bend-test.html').write_text(shell.page('CWB all-position bend test', 'welding.html', 'Welding course module',
                                                       cwb_page(res), 'Welding'), encoding='utf-8')
    if voice:
        build_guides.audio('package', PKG_INTRO, voice, out)
        build_guides.audio('cwb-bend-test', CWB_INTRO, voice, out)
