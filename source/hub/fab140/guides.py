"""Lesson content for the Metal Fabricator Intake 140 study guides.

Each lesson: a short page (one idea per line, big type, a picture, calculator keys) and a narration
read aloud by a text-to-speech voice. Every number in a step is worked out here, and every key
sequence is played on the TI-30Xa emulator by build_guides.py, which fails if a screen disagrees.
"""
import math

PI = math.pi


def f16(x):
    """A length in inches as a whole number and a reduced fraction to the nearest 1/16."""
    n = round(x * 16)
    w, r = divmod(n, 16)
    if r == 0:
        return str(w)
    g = math.gcd(r, 16)
    fr = '%d/%d' % (r // g, 16 // g)
    return '%d %s' % (w, fr) if w else fr


def svg(w, h, label, body):
    return ('<svg class="gv" viewBox="0 0 %d %d" role="img" aria-label="%s">%s</svg>' % (w, h, label, body))


def t(x, y, s, cls='gt', anchor='middle'):
    return '<text class="%s" x="%s" y="%s" text-anchor="%s">%s</text>' % (cls, x, y, anchor, s)


def arrow_h(x1, x2, y, cls='gd'):
    return ('<line class="%s" x1="%s" y1="%s" x2="%s" y2="%s" marker-start="url(#a)" marker-end="url(#a)"/>' % (cls, x1, y, x2, y))


DEFS = ('<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="gm"/></marker></defs>')


def tape_svg():
    x0, w = 40, 480
    b = DEFS + '<rect class="go" x="%d" y="40" width="%d" height="70" rx="4"/>' % (x0, w)
    for i in range(17):
        x = x0 + w * i / 16
        h = 44 if i % 16 == 0 else 34 if i % 8 == 0 else 26 if i % 4 == 0 else 18 if i % 2 == 0 else 12
        b += '<line class="gl" x1="%.1f" y1="40" x2="%.1f" y2="%d"/>' % (x, x, 40 + h)
    b += '<rect class="gk-fill" x="%d" y="112" width="%.1f" height="12"/>' % (x0, w * 14 / 16)
    b += t(x0, 30, '0') + t(x0 + w, 30, '1"') + t(x0 + w / 2, 30, '1/2')
    b += t(x0 + w * 7 / 16, 150, '14 of 16 = 14/16 = 7/8"', 'gt gk')
    return svg(560, 170, 'One inch of tape, 16 marks. 14 marks shaded: 7/8 of an inch.', b)


def bar_svg(top, bottom):
    b = DEFS + '<rect class="go" x="40" y="60" width="480" height="40" rx="4"/>'
    b += arrow_h(40, 520, 40) + t(280, 30, top) + t(280, 140, bottom, 'gt gk gbig')
    return svg(560, 160, 'A bar %s long. In decimal feet: %s' % (top, bottom), b)


def circle_svg(d, c):
    b = DEFS + '<circle class="go" cx="160" cy="110" r="90"/>' + arrow_h(70, 250, 110) + t(160, 100, d)
    b += '<path class="gk-line" d="M160,14 A96,96 0 1,1 64,110" fill="none" marker-end="url(#a)"/>'
    b += t(400, 100, 'Around the outside:', 'gt', 'middle') + t(400, 135, c, 'gt gk gbig')
    return svg(560, 220, 'A circle. Diameter %s across. Circumference %s around.' % (d, c), b)


def ring_svg():
    b = DEFS + '<circle class="go" cx="130" cy="115" r="95"/><circle class="gbg" cx="130" cy="115" r="75"/>'
    b += '<circle class="gk-line" cx="130" cy="115" r="85" fill="none" stroke-dasharray="6 5"/>'
    b += t(130, 112, 'ID 245') + t(130, 136, 'PL 10', 'gt gsm') + t(130, 14, 'MD 255 (dashes)', 'gt gk gsm')
    b += '<rect class="go" x="290" y="95" width="250" height="34"/>' + arrow_h(290, 540, 160) + t(415, 190, 'SO = π × 255 = 801 mm', 'gt gk')
    b += t(415, 80, 'Rolled flat', 'gt gsm')
    return svg(560, 210, 'A rolled ring, inside diameter 245, plate 10. The mean diameter 255 is the dashed circle. Flat, it is 801 mm long.', b)


def area_svg():
    b = DEFS + '<rect class="go" x="30" y="40" width="240" height="150"/>' + t(150, 30, '48"') + t(285, 120, '30"', 'gt', 'start')
    b += t(150, 122, '48 × 30 = 1,440 sq in', 'gt gsm')
    b += '<circle class="go" cx="430" cy="115" r="75"/><line class="gd" x1="430" y1="115" x2="505" y2="115"/>' + t(467, 105, 'r = 10"', 'gt gsm')
    b += t(430, 220, 'π × 10 × 10', 'gt gk')
    return svg(560, 235, 'A rectangle 48 by 30 inches and a circle with radius 10 inches.', b)


def plate_svg(l, w, th, rule, mass):
    b = ('<path class="go" d="M60,140 L360,140 L450,80 L150,80 Z"/><path class="go gside" d="M60,140 L360,140 L360,156 L60,156 Z"/>'
         '<path class="go gside" d="M360,140 L450,80 L450,96 L360,156 Z"/>')
    b += t(210, 182, l) + t(420, 128, w, 'gt', 'start') + t(52, 154, th, 'gt', 'end') + t(280, 50, rule, 'gt gsm') + t(280, 214, mass, 'gt gk gbig')
    return svg(560, 230, 'A steel plate %s by %s by %s. %s' % (l, w, th, mass), b)


def bend_svg():
    b = DEFS + '<path class="go" d="M60,40 L60,170 Q60,200 90,200 L250,200 L250,184 L90,184 Q76,184 76,170 L76,40 Z"/>'
    b += '<path class="gk-line" d="M68,170 Q68,192 90,192" fill="none" stroke-width="4"/>'
    b += t(40, 110, 'A', 'gt gk', 'end') + t(170, 225, 'C', 'gt gk') + t(110, 170, 'B (bend)', 'gt gk gsm', 'start')
    b += t(330, 70, 'MR = IR + T ÷ 2', 'gt', 'start') + t(330, 105, 'B = π × MR × angle ÷ 180', 'gt', 'start') + t(330, 140, 'A = leg − (IR + T)', 'gt', 'start')
    return svg(560, 240, 'A plate bent 90 degrees. Leg A, the bend B, leg C.', b)


def triangle_svg():
    b = '<path class="go" d="M60,200 L460,200 L460,40 Z"/><path class="gl" d="M440,200 L440,180 L460,180" fill="none"/>'
    b += t(260, 228, 'run 64 1/4"') + t(475, 125, 'rise 28 1/4"', 'gt', 'start') + t(230, 105, 'c = ?', 'gt gk gbig')
    return svg(560, 240, 'A right triangle. Run 64 1/4 inches, rise 28 1/4 inches, the long side c is unknown.', b)


def tank_svg():
    b = ('<path class="go" d="M40,180 L240,180 L240,90 L40,90 Z"/><path class="go gside" d="M240,180 L300,140 L300,50 L240,90 Z"/>'
         '<path class="go gside" d="M40,90 L100,50 L300,50 L240,90 Z"/>')
    b += t(140, 205, "8'") + t(285, 185, "4'", 'gt', 'start') + t(30, 140, "3 1/2'", 'gt', 'end') + t(160, 30, '112 cu ft × 6.25', 'gt gk')
    b += '<rect class="go" x="340" y="80" width="190" height="90"/><ellipse class="gside go" cx="340" cy="125" rx="18" ry="45"/>'
    b += t(435, 70, 'ID 36", L 72"', 'gt gsm') + t(435, 200, 'π × r × r × L', 'gt gk')
    return svg(560, 220, 'A box tank 8 by 4 by 3 and a half feet, and a round tank 36 inches inside diameter, 72 inches long.', b)


def pld_svg():
    x0, w = 40, 480
    b = DEFS + '<rect class="go" x="%d" y="70" width="%d" height="110"/>' % (x0, w)
    pts = []
    for i in range(13):
        x = x0 + w * i / 12
        h = 30 * math.cos(math.radians(30 * i))
        y = 100 - h
        pts.append('%.1f,%.1f' % (x, y))
        b += '<line class="gl" x1="%.1f" y1="%.1f" x2="%.1f" y2="180" stroke-dasharray="4 4"/>' % (x, y, x)
        b += t('%.1f' % x, 200, str(i % 12 + 1), 'gt gsm')
    b += '<polyline class="gk-line" fill="none" stroke-width="3" points="%s"/>' % ' '.join(pts)
    b += arrow_h(x0, x0 + w, 40) + t(280, 30, 'SO = π × D, in 12 spaces')
    return svg(560, 215, 'A pipe pattern rolled flat, 12 equal spaces, a curved cut line across the top.', b)


def lessons():
    L = []
    # 1 tape and fractions
    L.append(dict(
        n=1, slug='lesson-01-tape-and-fractions', title='Tape and fractions',
        goal='Read the tape to the nearest 1/16". Add and subtract lengths.',
        visual=tape_svg(),
        steps=[
            ('One inch has 16 small marks.', '1" = 16/16"', None),
            ('Count the marks. Then make the fraction smaller.', '14/16 = 7/8.  8/16 = 1/2.  4/16 = 1/4.', None),
            ('Add two lengths on the calculator. Use the ab/c key.', '5 7/8" + 2 3/4" = 8 5/8"', '5 ab/c 7 ab/c 8 + 2 ab/c 3 ab/c 4 ='),
            ('Change a fraction to a decimal. Top ÷ bottom.', '7/8 = 7 ÷ 8 = 0.875', '7 ÷ 8 ='),
        ],
        tryit=('Add 3 5/16" and 1 7/8".', '5 3/16"', '3 ab/c 5 ab/c 16 + 1 ab/c 7 ab/c 8 =', 3 + 5 / 16 + 1 + 7 / 8),
        hub='Module 1, Reading the tape', sc=None,
        say=("Lesson one. Tape and fractions. "
             "Look at one inch on your tape. It has sixteen small marks. Each mark is one sixteenth of an inch. "
             "To read a length, count the marks past the last whole inch. Fourteen marks is fourteen sixteenths. "
             "Now make the fraction smaller. Fourteen sixteenths is seven eighths. Eight sixteenths is one half. Four sixteenths is one quarter. "
             "To add two lengths, use the a b over c key on your calculator. "
             "Type five, a b over c, seven, a b over c, eight. Press plus. Type two, a b over c, three, a b over c, four. Press equals. "
             "The screen shows eight and five eighths. "
             "To change a fraction to a decimal, divide the top by the bottom. Seven divided by eight is zero point eight seven five. "
             "Now try one. Add three and five sixteenths to one and seven eighths. Pause and work it out. "
             "The answer is five and three sixteenths inches. Well done.")))
    # 2 decimals of a foot
    L.append(dict(
        n=2, slug='lesson-02-decimals-of-a-foot', title='Decimals of a foot',
        goal="Change feet and inches to decimal feet, and back again.",
        visual=bar_svg("6'-4 7/8\"", "6.40625'"),
        steps=[
            ('Start with the fraction. Top ÷ bottom.', '7 ÷ 8 = 0.875', None),
            ('Add the inches.', '0.875 + 4 = 4.875"', None),
            ('Divide by 12. Now it is feet.', '4.875 ÷ 12 = 0.40625', None),
            ('Add the whole feet.', "0.40625 + 6 = 6.40625'", '7 ÷ 8 + 4 = ÷ 12 + 6 ='),
            ('Going back: decimal part × 12 = inches.', '0.40625 × 12 = 4.875 → 4"', '.40625 × 12 ='),
            ('Decimal part of the inches × 16 = sixteenths.', '0.875 × 16 = 14 → 14/16 = 7/8"', '.875 × 16 ='),
        ],
        tryit=("Change 3'-9 1/2\" to decimal feet.", "3.7917'", '1 ÷ 2 + 9 = ÷ 12 + 3 =', 3 + 9.5 / 12),
        hub='Module 11, Decimals of a foot', sc='dfoot',
        say=("Lesson two. Decimals of a foot. "
             "Your calculator works in decimals. Your tape works in feet, inches and sixteenths. You need both. "
             "Our length is six feet, four and seven eighths inches. "
             "Step one. Start with the fraction. Seven divided by eight is zero point eight seven five. "
             "Step two. Add the four inches. Now you have four point eight seven five inches. "
             "Step three. Divide by twelve, because a foot has twelve inches. You get zero point four zero six two five. "
             "Step four. Add the six whole feet. The answer is six point four zero six two five feet. "
             "On the calculator, it is one line. Seven, divide, eight, plus, four, equals, divide, twelve, plus, six, equals. "
             "To go back to the tape, keep the six feet. Multiply the decimal part by twelve. That gives four point eight seven five inches. "
             "Keep the four inches. Multiply zero point eight seven five by sixteen. That gives fourteen sixteenths, which is seven eighths. "
             "Now try one. Change three feet, nine and one half inches to decimal feet. Pause and work it out. "
             "The answer is about three point seven nine one seven feet. Good work.")))
    # 3 circles
    L.append(dict(
        n=3, slug='lesson-03-circles', title='Circles',
        goal='Find the distance around a circle: the circumference.',
        visual=circle_svg('D = 33"', '103 11/16"'),
        steps=[
            ('The rule: around = π × across.', 'C = π × D', None),
            ('Radius is half. Diameter is 2 × radius.', 'r = 16 1/2", so D = 33"', None),
            ('Multiply by π. Use the π key.', 'C = π × 33 = 103.6725576"', '16.5 × 2 × π ='),
            ('Make it a tape length. Decimal part × 16.', '0.6725576 × 16 = 10.76 → 11/16', '.6725576 × 16 ='),
            ('Answer.', "103 11/16\" = 8'-7 11/16\"", None),
        ],
        tryit=('A ring is 265 mm across. Find C to the nearest mm.', '833 mm', 'π × 265 =', PI * 265),
        hub='Module 12, Circles', sc='circles-in',
        say=("Lesson three. Circles. "
             "Rings, flanges and tanks are round. To cut the bar or plate, you need the distance around the outside. That is the circumference. "
             "The rule is short. Around equals pi times across. C equals pi times D. "
             "Our circle has a radius of sixteen and one half inches. The radius is half way across. So the diameter is two times sixteen and a half. That is thirty three inches. "
             "Now multiply by pi. Use the pi key, not three point one four. "
             "Pi times thirty three is one hundred three point six seven two six inches. "
             "To read it on a tape, keep the one hundred three inches. Multiply the decimal part by sixteen. You get ten point seven six. Round it to eleven. "
             "So the answer is one hundred three and eleven sixteenths inches. That is eight feet, seven and eleven sixteenths. "
             "Now try one. A ring is two hundred sixty five millimetres across. Find the circumference to the nearest millimetre. Pause and work it out. "
             "The answer is eight hundred thirty three millimetres. Nice.")))
    # 4 mean diameter
    L.append(dict(
        n=4, slug='lesson-04-mean-diameter-and-stretch-out', title='Mean diameter and stretch-out',
        goal='Cut plate the right length before you roll it.',
        visual=ring_svg(),
        steps=[
            ('Rolling stretches the outside and squeezes the inside.', 'The middle of the plate keeps its length.', None),
            ('That middle circle is the mean diameter, MD.', 'From the inside: MD = ID + T.  From the outside: MD = OD − T.', None),
            ('Add one plate thickness to the inside.', 'MD = 245 + 10 = 255 mm', None),
            ('Stretch-out = π × MD.', 'SO = π × 255 = 801.1 → 801 mm', '245 + 10 = × π ='),
        ],
        tryit=('OD 30", plate 1/2". Find MD, then SO to the nearest 1/16".', 'MD 29 1/2", SO 92 11/16"', '30 − .5 = × π =', PI * 29.5),
        hub='Module 13, Mean diameter and stretch-out', sc='rolled',
        say=("Lesson four. Mean diameter and stretch-out. "
             "When you roll a plate into a ring, the outside of the plate stretches. The inside squeezes. "
             "The middle of the plate keeps its length. The circle through the middle of the plate is called the mean diameter. We write M D. "
             "If you know the inside diameter, add one plate thickness. M D equals I D plus T. "
             "If you know the outside diameter, take away one plate thickness. M D equals O D minus T. "
             "Our ring has an inside diameter of two hundred forty five millimetres. The plate is ten millimetres thick. "
             "So the mean diameter is two hundred forty five plus ten. That is two hundred fifty five millimetres. "
             "The stretch-out is the length to cut the plate. Stretch-out equals pi times the mean diameter. "
             "Pi times two hundred fifty five is eight hundred one millimetres. "
             "Now try one. The outside diameter is thirty inches. The plate is one half inch thick. Find the mean diameter, then the stretch-out. Pause and work it out. "
             "The mean diameter is twenty nine and a half inches. The stretch-out is ninety two and eleven sixteenths inches. Great.")))
    # 5 area
    L.append(dict(
        n=5, slug='lesson-05-area', title='Area',
        goal='Find the area of a plate: rectangles and circles.',
        visual=area_svg(),
        steps=[
            ('Rectangle: length × width.', 'A = 48 × 30 = 1,440 sq in', '48 × 30 ='),
            ('Square inches to square feet: ÷ 144.', '1,440 ÷ 144 = 10 sq ft', '1440 ÷ 144 ='),
            ('Circle: π × r × r.', 'A = π × 10 × 10 = 314.16 sq in', '10 x² × π ='),
            ('Metric: mm × mm ÷ 1,000,000 = square metres.', '2,440 × 1,220 = 2,976,800 sq mm = 2.9768 sq m', '2440 × 1220 ÷ 1000000 ='),
        ],
        tryit=('A round plate has r = 12". Find the area in sq in.', '452.39 sq in', '12 x² × π =', PI * 144),
        hub='Module 14, Area and plate mass', sc='mass',
        say=("Lesson five. Area. "
             "Area is the flat space a plate covers. You need it to find the weight, and to order steel. "
             "For a rectangle, multiply the length by the width. A plate forty eight inches by thirty inches is one thousand four hundred forty square inches. "
             "A square foot holds one hundred forty four square inches. So divide by one hundred forty four. The plate is ten square feet. "
             "For a circle, multiply pi by the radius, times the radius again. On the calculator, type the radius, press x squared, then times pi. "
             "A circle with a radius of ten inches is about three hundred fourteen point one six square inches. "
             "In metric, millimetres times millimetres gives square millimetres. Divide by one million to get square metres. "
             "Now try one. A round plate has a radius of twelve inches. Find the area. Pause and work it out. "
             "The answer is about four hundred fifty two point three nine square inches. Well done.")))
    # 6 plate mass
    L.append(dict(
        n=6, slug='lesson-06-plate-mass', title='Plate mass by the shop rule',
        goal='Find how much a steel plate weighs before you lift it.',
        visual=plate_svg("8'", "4'", '1/2"', '40.8 lb per sq ft per inch thick', '652.8 lb'),
        steps=[
            ('Imperial rule: 40.8 lb per square foot, for each inch thick.', 'lb = L\' × W\' × 40.8 × T"', None),
            ('Plate 8\' × 4\' × 1/2".', '8 × 4 × 40.8 × 0.5 = 652.8 lb', '8 × 4 × 40.8 × .5 ='),
            ('Metric rule: 7.85 kg per square metre, for each mm thick.', 'kg = L m × W m × T mm × 7.85', None),
            ('Plate 2,440 × 1,220 × 10 mm.', '2.44 × 1.22 × 10 × 7.85 = 233.68 kg', '2.44 × 1.22 × 10 × 7.85 ='),
        ],
        tryit=('Plate 6\' × 3\' × 3/8". Find the weight.', '275.4 lb', '6 × 3 × 40.8 × .375 =', 6 * 3 * 40.8 * 0.375),
        hub='Module 14, Area and plate mass', sc='mass',
        say=("Lesson six. Plate mass by the shop rule. "
             "Before you lift a plate, know how heavy it is. It tells you which sling and which crane to use. "
             "The shop rule for mild steel, in imperial. A plate one inch thick weighs forty point eight pounds for every square foot. "
             "So weight equals length in feet, times width in feet, times forty point eight, times the thickness in inches. "
             "Our plate is eight feet by four feet, one half inch thick. Eight times four times forty point eight times zero point five. That is six hundred fifty two point eight pounds. "
             "The metric rule. A plate one millimetre thick weighs seven point eight five kilograms for every square metre. "
             "Change the length and width to metres. Keep the thickness in millimetres. "
             "A plate two thousand four hundred forty by one thousand two hundred twenty, ten millimetres thick. Two point four four times one point two two times ten times seven point eight five. That is two hundred thirty three point six eight kilograms. "
             "Now try one. A plate six feet by three feet, three eighths of an inch thick. Pause and work it out. "
             "The answer is two hundred seventy five point four pounds. Good job.")))
    # 7 formed plate
    L.append(dict(
        n=7, slug='lesson-07-formed-plate', title='Formed plate and radiused sections',
        goal='Find the flat length of a plate before it is bent.',
        visual=bend_svg(),
        steps=[
            ('Bend line: the middle of the plate.', 'MR = IR + T ÷ 2 = 1 + 0.25 = 1.25"', None),
            ('Length of a 90° bend.', 'B = π × 1.25 × 90 ÷ 180 = 1.9635"', 'π × 1.25 × 90 ÷ 180 ='),
            ('Straight legs. Take off IR + T.', 'A = 6 − 1.5 = 4.5".  C = 6 − 1.5 = 4.5"', None),
            ('Flat length = A + B + C.', '4.5 + 1.9635 + 4.5 = 10.9635 → 10 15/16"', '4.5 + 1.9635 + 4.5 ='),
            ('Quick rule for 90° parts.', 'Up to 3/8" thick: add the inside legs. 7/16" or more: add the mean legs.', None),
        ],
        tryit=('IR 2", T 1/2", 90° bend. Find B to the nearest 1/16".', '3 9/16"', 'π × 2.25 × 90 ÷ 180 =', PI * 2.25 / 2),
        hub='Module 9, Shop sheet skills', sc=None,
        say=("Lesson seven. Formed plate and radiused sections. "
             "When plate is bent, the outside stretches and the inside squeezes, just like rolling. The middle keeps its length. "
             "The middle of the bend is the mean radius. M R equals the inside radius plus half the thickness. "
             "Our plate is one half inch thick, with a one inch inside radius. Half of one half is one quarter. So the mean radius is one point two five inches. "
             "The bend length is pi times the mean radius, times the angle, divided by one hundred eighty. For a ninety degree bend, that is one point nine six three five inches. "
             "Each straight leg is the outside leg, minus the inside radius and the thickness. Six minus one and a half is four and a half inches. "
             "Add the pieces. Four and a half, plus one point nine six three five, plus four and a half. That is ten point nine six three five. To the nearest sixteenth, ten and fifteen sixteenths inches. "
             "For quick ninety degree parts, use the course rule. Up to three eighths thick, add the inside legs. Seven sixteenths or thicker, add the mean legs. "
             "Now try one. Inside radius two inches, plate one half inch, ninety degree bend. Find the bend length. Pause and work it out. "
             "The answer is three and nine sixteenths inches. Nice work.")))
    # 8 pythagoras
    cc = math.sqrt(28.25 ** 2 + 64.25 ** 2)
    L.append(dict(
        n=8, slug='lesson-08-pythagoras-and-trusses', title='Pythagoras and trusses',
        goal='Find the long side of a right triangle.',
        visual=triangle_svg(),
        steps=[
            ('Square both short sides. Add. Take the square root.', 'c = √(a² + b²)', None),
            ('Square the rise and the run.', '28.25² = 798.0625.  64.25² = 4,128.0625', None),
            ('Add, then press √x.', '√4,926.125 = %.7f"' % cc, '28.25 x² + 64.25 x² = √x'),
            ('Make it a tape length.', '%s"' % f16(cc), None),
            ('Check square with 3-4-5.', 'Sides 3 and 4 make a diagonal of 5.', '3 x² + 4 x² = √x'),
        ],
        tryit=('Rise 24", run 32". Find c.', '40"', '24 x² + 32 x² = √x', 40.0),
        hub='Module 5, Squaring and bracing', sc=None,
        say=("Lesson eight. Pythagoras and trusses. "
             "A truss is made of right triangles. The rise is the height. The run is across. The top chord is the long side. "
             "To find the long side, square both short sides, add them, and take the square root. "
             "Our rise is twenty eight and one quarter inches. Our run is sixty four and one quarter inches. "
             "On the calculator: twenty eight point two five, x squared, plus, sixty four point two five, x squared, equals, then the square root key. "
             "The screen shows seventy point one eight six. To the nearest sixteenth, that is seventy and three sixteenths inches. "
             "You can check that a frame is square the same way. Sides of three and four make a diagonal of five. "
             "Now try one. The rise is twenty four inches. The run is thirty two inches. Find the long side. Pause and work it out. "
             "The answer is forty inches. Excellent.")))
    # 9 tanks
    vr = PI * 18 * 18 * 72 / 1728
    L.append(dict(
        n=9, slug='lesson-09-tanks', title='Tank capacity and fit-ups',
        goal='Find how much a tank holds.',
        visual=tank_svg(),
        steps=[
            ('Box tank: L × W × H, inside sizes.', "8 × 4 × 3.5 = 112 cu ft", '8 × 4 × 3.5 ='),
            ('Course factor: 1 cu ft holds 6.25 gallons.', '112 × 6.25 = 700 gallons', '112 × 6.25 ='),
            ('Round tank: π × r × r × L. Inches ÷ 1,728 = cu ft.', 'π × 18² × 72 ÷ 1,728 = %.2f cu ft' % vr, '18 x² × π × 72 ÷ 1728 ='),
            ('Then × 6.25.', '%.2f × 6.25 = %.2f gallons' % (vr, vr * 6.25), None),
            ('Metric: 1 cubic metre holds 1,000 litres.', '1.2 × 0.8 × 0.5 = 0.48 cu m = 480 L', None),
            ('Fit-up changes the plate sizes.', 'Ask which: corner to corner, outside flush, or inside flush.', None),
        ],
        tryit=("Box tank 6' × 3' × 2'. Find the gallons.", '225 gallons', '6 × 3 × 2 × 6.25 =', 225.0),
        hub='Module 15, Tank volume and capacity', sc='capacity',
        say=("Lesson nine. Tank capacity and fit-ups. "
             "Volume is the space inside a tank. Capacity is how much liquid fits in that space. Always use the inside sizes. "
             "A box tank is length times width times height. Eight feet by four feet by three and a half feet is one hundred twelve cubic feet. "
             "In this course, one cubic foot holds six point two five gallons. One hundred twelve times six point two five is seven hundred gallons. "
             "A round tank is pi times the radius times the radius, times the length. "
             "A tank thirty six inches across has a radius of eighteen. Eighteen squared, times pi, times seventy two inches long. Divide by one thousand seven hundred twenty eight to get cubic feet. That is about forty two point four one cubic feet. Times six point two five is about two hundred sixty five gallons. "
             "In metric, one cubic metre holds one thousand litres. "
             "When you build a tank, ask which fit-up to use. Corner to corner, outside flush, or inside flush. It changes the plate sizes. "
             "Now try one. A box tank six feet by three feet by two feet. Find the gallons. Pause and work it out. "
             "The answer is two hundred twenty five gallons. Great job.")))
    # 10 parallel line development
    so = PI * 168
    L.append(dict(
        n=10, slug='lesson-10-parallel-line-development', title='Parallel line development',
        goal='Lay out the pattern for a pipe cut at an angle.',
        visual=pld_svg(),
        steps=[
            ('The pattern is the pipe rolled flat.', 'Length = π × D', None),
            ('Pipe D = 168 mm.', 'SO = π × 168 = %.1f mm' % so, 'π × 168 ='),
            ('Split it into 12 equal spaces.', '%.1f ÷ 12 = %.1f mm' % (so, so / 12), 'π × 168 ÷ 12 ='),
            ('Each space gets a line. Measure each line.', 'Cut 22.5°, L = 200: shortest 165 mm, longest 235 mm', '200 − 84 × 22.5 tan ='),
            ('Join the tops with a smooth curve. That is the cut line.', 'Lines 8 to 12 repeat lines 6 to 2.', None),
        ],
        tryit=('Pipe D = 114 mm. Find one of the 12 spaces.', '29.8 mm', 'π × 114 ÷ 12 =', PI * 114 / 12),
        hub='Module 16, Parallel line development', sc='pld',
        say=("Lesson ten. Parallel line development. "
             "A pattern is the flat shape you wrap around a pipe to mark a cut. Think of the pipe rolled out flat. "
             "The pattern is as long as the distance around the pipe. That is pi times the diameter. "
             "Our pipe is one hundred sixty eight millimetres across. Pi times one hundred sixty eight is five hundred twenty seven point eight millimetres. "
             "Split that length into twelve equal spaces. Each space is forty three point nine eight millimetres. "
             "Draw a line at each space. These are the element lines. Each one is a different length, because the cut is on an angle. "
             "For a cut twenty two and a half degrees off square, with two hundred millimetres on the centre line, the shortest line is one hundred sixty five millimetres. The longest is two hundred thirty five. "
             "Join the tops of the lines with a smooth curve. That curve is your cut line. "
             "Now try one. A pipe is one hundred fourteen millimetres across. Find one of the twelve spaces. Pause and work it out. "
             "The answer is about twenty nine point eight millimetres. You did it.")))
    return L
