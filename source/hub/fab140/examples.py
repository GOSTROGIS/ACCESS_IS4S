"""More worked examples, a common mistake and practice for each Intake 140 study guide.

Every number is computed here from the example's inputs. Every key sequence carries the value it must
show, and build_guides.py plays it on the TI-30Xa engine and stops if the screen disagrees.
"""
import math
import re

from num2words import num2words

from guides import DEFS, angle, arrow_h, bar, circle, plate, ring, rtri, svg, t

PI = math.pi


def K(seq, value):
    """A key sequence and the value the calculator must show."""
    return (seq, value)


def r(x, dp):
    return ('%.' + str(dp) + 'f') % x


def two_bars(label, a, b_, ans):
    g = DEFS + '<rect class="go" x="40" y="40" width="480" height="30" rx="4"/>' + t(280, 30, a)
    g += '<rect class="go" x="40" y="95" width="200" height="30" rx="4"/>' + t(140, 145, b_, 'gt')
    g += '<rect class="gbg" x="240" y="95" width="280" height="30" rx="4" stroke-dasharray="6 4"/>' + t(380, 145, ans, 'gt gk')
    return svg(560, 160, label, g)


def plate_hole(label):
    b = '<rect class="go" x="60" y="30" width="300" height="200"/><circle class="gbg" cx="210" cy="130" r="45"/>'
    b += t(210, 22, '36"') + t(372, 135, '24"', 'gt', 'start') + t(210, 134, 'r = 4"', 'gt gsm')
    b += t(470, 90, 'Plate', 'gt') + t(470, 120, 'minus', 'gt gsm') + t(470, 150, 'the hole', 'gt gk')
    return svg(560, 245, label, b)


def disc(label, d, th, m):
    b = '<path class="go" d="M120,120 a110,40 0 1,0 220,0 a110,40 0 1,0 -220,0"/><path class="go gside" d="M120,120 L120,136 a110,40 0 0,0 220,0 L340,120" fill="none"/>'
    b += '<line class="gd" x1="120" y1="120" x2="340" y2="120"/>' + t(230, 112, d) + t(350, 146, th, 'gt', 'start') + t(280, 205, m, 'gt gk gbig')
    return svg(560, 220, label, b)


def frame(label):
    b = '<rect class="go" x="80" y="40" width="320" height="160" fill-opacity=".4"/><line class="gk-line" x1="80" y1="200" x2="400" y2="40"/>'
    b += t(240, 225, '48"') + t(412, 125, '36"', 'gt', 'start') + t(230, 110, 'brace = ?', 'gt gk gbig')
    return svg(560, 240, label, b)


def tank_round(label, d, l, ans):
    b = '<rect class="go" x="90" y="60" width="320" height="110"/><ellipse class="go gside" cx="90" cy="115" rx="22" ry="55"/>'
    b += DEFS + arrow_h(90, 410, 40) + t(250, 30, l) + '<line class="gd" x1="440" y1="60" x2="440" y2="170"/>' + t(450, 120, d, 'gt', 'start')
    b += t(250, 205, ans, 'gt gk')
    return svg(560, 220, label, b)


def box(label, l, w, h, ans):
    b = ('<path class="go" d="M60,180 L280,180 L280,90 L60,90 Z"/><path class="go gside" d="M280,180 L350,140 L350,50 L280,90 Z"/>'
         '<path class="go gside" d="M60,90 L130,50 L350,50 L280,90 Z"/>')
    b += t(170, 205, l) + t(330, 180, w, 'gt', 'start') + t(50, 140, h, 'gt', 'end') + t(470, 120, ans, 'gt gk')
    return svg(560, 220, label, b)


def pattern(label, lines, unit='mm'):
    """A flat pattern: 12 spaces, with the element lines 1 to 7 drawn to scale and labelled."""
    x0, w, base, top = 40, 480, 210, 40
    hi = max(lines)
    sc = (base - top) / hi
    b = '<rect class="go" x="%d" y="%d" width="%d" height="%d" fill-opacity=".35"/>' % (x0, top, w, base - top)
    pts = []
    for i in range(13):
        e = lines[i if i <= 6 else 12 - i]
        x, y = x0 + w * i / 12, base - e * sc
        pts.append('%.1f,%.1f' % (x, y))
        b += '<line class="gl" x1="%.1f" y1="%.1f" x2="%.1f" y2="%d"/>' % (x, y, x, base)
        b += t('%.1f' % x, base + 20, str(i % 12 + 1), 'gt gsm')
        if i <= 6:
            b += t('%.1f' % x, '%.1f' % (y - 6), '%g' % round(e), 'gt gk gsm')
    b += '<polyline class="gk-line" fill="none" stroke-width="3" points="%s"/>' % ' '.join(pts)
    return svg(560, 240, label, b)


def tee(label, h, main, branch, ans):
    b = '<circle class="go" cx="280" cy="170" r="70"/><path class="go gside" d="M250,40 L250,107 A70,70 0 0,1 310,107 L310,40 Z"/>'
    b += '<line class="gd" x1="380" y1="40" x2="380" y2="170"/>' + t(390, 110, h, 'gt', 'start')
    b += t(280, 262, main, 'gt gsm') + t(240, 60, branch, 'gt gsm', 'end') + t(100, 140, ans, 'gt gk')
    return svg(560, 275, label, b)


def wrong_right(label, wrong, right):
    b = ('<rect x="20" y="10" width="520" height="95" rx="8" class="gbad"/><rect x="20" y="120" width="520" height="95" rx="8" class="ggood"/>'
         '<text class="gt gbad-t gbig" x="40" y="45">✗ Wrong</text><text class="gt ggood-t gbig" x="40" y="155">✓ Right</text>')
    b += t(40, 85, wrong, 'gt', 'start') + t(40, 195, right, 'gt', 'start')
    return svg(560, 225, label, b)


def _mistake(head, pic, fix):
    return dict(head=head, pic=pic, fix=fix)


# ---------- lesson extras ----------

def extras():
    X = {}

    # 1 tape and fractions
    a = 12 + 3 / 8 - (4 + 15 / 16)
    c = (37 + 5 / 8) / 2
    X[1] = dict(
        examples=[
            dict(title='Cut a piece off a bar',
                 visual=two_bars('A bar 12 3/8 inches long. A piece 4 15/16 inches is cut off. The piece left is unknown.', '12 3/8"', '4 15/16"', '? = 7 7/16"'),
                 steps=[('Write both lengths in sixteenths.', '3/8 = 6/16.  So 12 6/16" − 4 15/16".', None),
                        ('6/16 is less than 15/16. Borrow one inch.', '12 6/16 = 11 22/16', None),
                        ('Subtract.', '11 22/16 − 4 15/16 = 7 7/16"', K('12 ab/c 3 ab/c 8 − 4 ab/c 15 ab/c 16 =', a))],
                 answer='7 7/16"'),
            dict(title='Find the centre of a bar',
                 visual=bar('A bar 37 5/8 inches long, split into two equal halves.', '37 5/8"', [(240, '?'), (240, '?')]),
                 steps=[('Centre = length ÷ 2.', '37 5/8 ÷ 2', None),
                        ('Use ab/c for the fraction.', '37 5/8 ÷ 2 = 18 13/16"', K('37 ab/c 5 ab/c 8 ÷ 2 =', c)),
                        ('Mark 18 13/16" from one end. Check from the other end.', '18 13/16 + 18 13/16 = 37 5/8"', None)],
                 answer='18 13/16"')],
        mistake=_mistake('Counting eighth marks as sixteenths.', wrong_right('Wrong: 7 of the big marks read as 7/16. Right: 7 eighth marks is 14/16, which is 7/8.', '7 marks → 7/16"', '14 marks → 14/16 = 7/8"'),
                 'Check which marks you count. The smallest marks are sixteenths.'),
        practice=[('Subtract: 20 1/4" − 7 9/16".', '12 11/16"', K('20 ab/c 1 ab/c 4 − 7 ab/c 9 ab/c 16 =', 20.25 - 7.5625)),
                  ('Find the centre of a bar 45 3/8" long.', '22 11/16"', K('45 ab/c 3 ab/c 8 ÷ 2 =', 45.375 / 2))])

    # 2 decimals of a foot
    d1 = 14 + (9 + 3 / 16) / 12
    i2 = 0.3542 * 12
    s2 = (i2 - 4) * 16
    X[2] = dict(
        examples=[
            dict(title='A long length to decimal feet',
                 visual=bar("A length of 14 feet 9 and 3 sixteenths inches.", "14'-9 3/16\"", [(60, '3/16'), (180, '9"'), (240, "14'")]),
                 steps=[('Fraction first.', '3 ÷ 16 = 0.1875', None),
                        ('Add the inches.', '0.1875 + 9 = 9.1875"', None),
                        ('Inches to feet: ÷ 12.', '9.1875 ÷ 12 = 0.765625', None),
                        ('Add the feet.', "0.765625 + 14 = 14.765625'", K('3 ÷ 16 + 9 = ÷ 12 + 14 =', d1))],
                 answer="14.7656'"),
            dict(title='A calculator answer back to the tape',
                 visual=bar("A length of 8.3542 decimal feet, changed to feet and inches.", "8.3542'", [(160, "8'"), (60, '4"'), (40, '1/4"')]),
                 steps=[('Keep the 8 feet. Decimal part × 12.', '0.3542 × 12 = 4.2504"', K('.3542 × 12 =', i2)),
                        ('Keep the 4 inches. Decimal part × 16.', '0.2504 × 16 = 4.0064 → 4/16', K('.3542 × 12 − 4 = × 16 =', s2)),
                        ('Make the fraction smaller.', '4/16 = 1/4', None)],
                 answer="8'-4 1/4\"")],
        mistake=_mistake("Treating inches like a decimal.", wrong_right("Wrong: 6 feet 4 7/8 inches written as 6.4875. Right: 6.40625 feet.", "6'-4 7/8\" → 6.4875'", "6'-4 7/8\" → 6.40625'"),
                 'There are 12 inches in a foot, not 10. Always divide the inches by 12.'),
        practice=[("Change 11'-2 5/8\" to decimal feet.", "11.2188'", K('5 ÷ 8 + 2 = ÷ 12 + 11 =', 11 + 2.625 / 12)),
                  ("Change 5.6875' to feet and inches.", "5'-8 1/4\"", K('.6875 × 12 =', 0.6875 * 12))])

    # 3 circles
    c1 = PI * 18.75
    c2 = PI * 6
    X[3] = dict(
        examples=[
            dict(title='A flange in inches',
                 visual=circle('A flange 18 3/4 inches across. The distance around is 58 7/8 inches.', 'D = 18 3/4"', '58 7/8"'),
                 steps=[('Fraction to decimal.', '18 3/4" = 18.75"', None),
                        ('C = π × D.', 'π × 18.75 = %s"' % r(c1, 4), K('18.75 × π =', c1)),
                        ('Decimal part × 16.', '0.9049 × 16 = 14.48 → 14/16 = 7/8', K('18.75 × π − 58 = × 16 =', (c1 - 58) * 16))],
                 answer='58 7/8"'),
            dict(title='A tank in feet',
                 visual=circle("A tank 6 feet across. The distance around is 18 feet 10 and 3 sixteenths inches.", "D = 6'", "18'-10 3/16\""),
                 steps=[('C = π × D, in feet.', "π × 6 = %s'" % r(c2, 4), K('6 × π =', c2)),
                        ('Keep 18 feet. Decimal part × 12.', '0.8496 × 12 = 10.195"', K('6 × π − 18 = × 12 =', (c2 - 18) * 12)),
                        ('Keep 10 inches. Decimal part × 16.', '0.195 × 16 = 3.12 → 3/16', None)],
                 answer="18'-10 3/16\"")],
        mistake=_mistake('Using the radius instead of the diameter.', wrong_right('Wrong: pi times the radius 16 1/2 gives 51.8. Right: pi times the diameter 33 gives 103.7.', 'π × 16.5 = 51.8"', 'π × 33 = 103.7"'),
                 'C = π × D. If the drawing gives r, double it first.'),
        practice=[('A ring is 420 mm across. Find C to the nearest mm.', '1,319 mm', K('420 × π =', PI * 420)),
                  ('A circle has a radius of 9". Find C to the nearest 1/16".', '56 9/16"', K('9 × 2 × π =', PI * 18))])

    # 4 mean diameter
    so1 = PI * 598
    so2 = PI * 48.5
    X[4] = dict(
        examples=[
            dict(title='From the outside, in millimetres',
                 visual=ring('A shell with outside diameter 610, plate 12. Mean diameter 598. Stretch-out 1,879 mm.', 'OD 610', 'PL 12', 'MD 598', 'SO = 1,879 mm'),
                 steps=[('From the outside: take off one thickness.', 'MD = OD − T = 610 − 12 = 598 mm', None),
                        ('SO = π × MD.', 'π × 598 = %s mm' % r(so1, 2), K('610 − 12 = × π =', so1)),
                        ('Round to the nearest mm.', '1,879 mm', None)],
                 answer='1,879 mm'),
            dict(title='From the inside, in inches',
                 visual=ring('A shell with inside diameter 48 inches, plate 1/2 inch. Stretch-out 12 feet 8 and 3 eighths inches.', 'ID 48"', 'T 1/2"', 'MD 48 1/2"', "SO = 12'-8 3/8\""),
                 steps=[('From the inside: add one thickness.', 'MD = 48 + 1/2 = 48 1/2"', None),
                        ('SO = π × MD.', 'π × 48.5 = %s"' % r(so2, 4), K('48.5 × π =', so2)),
                        ('Make it a tape length.', '0.3672 × 16 = 5.88 → 6/16 = 3/8.  152 3/8" = 12\'-8 3/8"', K('48.5 × π − 152 = × 16 =', (so2 - 152) * 16))],
                 answer="12'-8 3/8\"")],
        mistake=_mistake('Cutting the plate to π × OD.', wrong_right('Wrong: pi times the outside diameter 265 is 832 mm, 31 mm too long. Right: pi times the mean diameter 255 is 801 mm.', 'π × 265 = 832 mm', 'π × 255 = 801 mm'),
                 'Too long by about π × T. Always find MD first.'),
        practice=[('ID 900 mm, plate 16 mm. Find SO to the nearest mm.', '2,878 mm', K('900 + 16 = × π =', PI * 916)),
                  ('OD 24", plate 3/8". Find SO to the nearest 1/16".', '74 1/4"', K('24 − .375 = × π =', PI * 23.625))])

    # 5 area
    a1 = 36 * 24 - PI * 16
    a2 = PI * 0.3 ** 2
    X[5] = dict(
        examples=[
            dict(title='A plate with a round hole',
                 visual=plate_hole('A plate 36 by 24 inches with a round hole, radius 4 inches.'),
                 steps=[('Area of the plate.', '36 × 24 = 864 sq in', None),
                        ('Area of the hole: π × r × r.', 'π × 4 × 4 = 50.27 sq in', K('4 x² × π =', PI * 16)),
                        ('Take the hole away.', '864 − 50.27 = %s sq in' % r(a1, 2), K('36 × 24 − 4 x² × π =', a1))],
                 answer='%s sq in' % r(a1, 2)),
            dict(title='A round plate in square metres',
                 visual=circle('A round plate 600 millimetres across. Radius 0.3 metres.', '', 'A = 0.2827 sq m', show_r='r = 0.3 m'),
                 steps=[('Radius = 600 ÷ 2 = 300 mm.', '300 mm = 0.3 m', None),
                        ('A = π × r × r.', 'π × 0.3 × 0.3 = %s sq m' % r(a2, 4), K('.3 x² × π =', a2))],
                 answer='0.2827 sq m')],
        mistake=_mistake('Forgetting to divide by 144.', wrong_right('Wrong: 1,440 square inches called 1,440 square feet. Right: 1,440 divided by 144 is 10 square feet.', '1,440 sq in = 1,440 sq ft', '1,440 ÷ 144 = 10 sq ft'),
                 'A square foot is 12 × 12 = 144 square inches.'),
        practice=[('A plate is 60" × 42". Find the area in sq ft.', '17.5 sq ft', K('60 × 42 ÷ 144 =', 17.5)),
                  ('A round plate has D = 20". Find the area in sq in.', '314.16 sq in', K('10 x² × π =', PI * 100))])

    # 6 plate mass
    m1 = 48 * 30 * 40.8 * 0.75 / 144
    m2 = PI * 0.3 ** 2 * 20 * 7.85
    X[6] = dict(
        examples=[
            dict(title='Sizes in inches',
                 visual=plate('A plate 48 by 30 inches, 3/4 inch thick. It weighs 306 pounds.', '48"', '30"', '3/4"', '40.8 lb per sq ft per inch thick', '306 lb'),
                 steps=[('Square inches to square feet: ÷ 144.', '48 × 30 ÷ 144 = 10 sq ft', None),
                        ('× 40.8 × thickness in inches.', '10 × 40.8 × 0.75 = 306 lb', K('48 × 30 × 40.8 × .75 ÷ 144 =', m1))],
                 answer='306 lb'),
            dict(title='A round plate, metric',
                 visual=disc('A round plate 600 millimetres across and 20 millimetres thick. It weighs 44.39 kilograms.', 'D = 600 mm', 'T = 20 mm', '44.39 kg'),
                 steps=[('Area in square metres.', 'π × 0.3 × 0.3 = 0.2827 sq m', None),
                        ('× thickness in mm × 7.85.', '0.2827 × 20 × 7.85 = %s kg' % r(m2, 2), K('.3 x² × π × 20 × 7.85 =', m2))],
                 answer='%s kg' % r(m2, 2))],
        mistake=_mistake('Putting the thickness in metres.', wrong_right('Wrong: 10 millimetres typed as 0.010 gives 0.23 kilograms. Right: keep 10 millimetres, 233.68 kilograms.', 'T = 0.010 → 0.23 kg', 'T = 10 → 233.68 kg'),
                 'Metric rule: length and width in metres, thickness in millimetres.'),
        practice=[("Plate 10' × 5' × 1/4\". Find the weight.", '510 lb', K('10 × 5 × 40.8 × .25 =', 510.0)),
                  ('Plate 1,500 × 1,000 × 12 mm. Find the mass.', '141.3 kg', K('1.5 × 1 × 12 × 7.85 =', 141.3))])

    # 7 formed plate
    b1 = PI * 0.625 * 90 / 180
    blank1 = 2.25 + b1 + 2.25
    X[7] = dict(
        examples=[
            dict(title='A small formed angle',
                 visual=angle('A 3 by 3 inch angle, 1/4 inch plate, inside radius 1/2 inch.', 'A', 'C', ['Legs 3" × 3"', 'T = 1/4"', 'IR = 1/2"']),
                 steps=[('Mean radius.', 'MR = 1/2 + 1/4 ÷ 2 = 0.625"', None),
                        ('Bend, 90°.', 'B = π × 0.625 × 90 ÷ 180 = %s"' % r(b1, 4), K('π × .625 × 90 ÷ 180 =', b1)),
                        ('Straight legs: leg − (IR + T).', 'A = C = 3 − 0.75 = 2.25"', None),
                        ('Add.', '2.25 + %s + 2.25 = %s → 5 1/2"' % (r(b1, 4), r(blank1, 4)), K('2.25 + %s + 2.25 =' % r(b1, 7), 2.25 + float(r(b1, 7)) + 2.25))],
                 answer='5 1/2"'),
            dict(title='The quick rule for 90° parts',
                 visual=angle('A 90 degree part with outside legs 4 and 6 inches.', '4"', '6"', ['3/8" plate: add the', 'inside legs', '1/2" plate: add the', 'mean legs']),
                 steps=[('3/8" plate. Inside leg = outside leg − T.', '3 5/8 + 5 5/8 = 9 1/4"', K('4 − .375 + 6 − .375 =', 9.25)),
                        ('1/2" plate. Mean leg = outside leg − T ÷ 2.', '3 3/4 + 5 3/4 = 9 1/2"', K('4 − .25 + 6 − .25 =', 9.5))],
                 answer='9 1/4" and 9 1/2"')],
        mistake=_mistake('Adding the outside legs.', wrong_right('Wrong: 6 plus 6 is 12 inches, too long. Right: A plus B plus C is 10 15/16 inches.', '6 + 6 = 12"', 'A + B + C = 10 15/16"'),
                 'The bend uses up length. Never add the outside legs.'),
        practice=[('IR 3/4", T 1/4", 90° bend. Find B to the nearest 1/16".', '1 3/8"', K('π × .875 × 90 ÷ 180 =', PI * 0.875 / 2)),
                  ('IR 1", T 1/2", 45° bend. Find B to the nearest 1/16".', '1"', K('π × 1.25 × 45 ÷ 180 =', PI * 1.25 / 4))])

    # 8 pythagoras
    tc = math.sqrt(120 ** 2 + 40 ** 2)
    X[8] = dict(
        examples=[
            dict(title='Check a frame is square',
                 visual=frame('A frame 48 by 36 inches with a diagonal brace.'),
                 steps=[('Square both sides. Add.', '48² + 36² = 2,304 + 1,296 = 3,600', None),
                        ('Square root.', '√3,600 = 60"', K('48 x² + 36 x² = √x', 60.0)),
                        ('Measure the diagonal. 60" means the frame is square.', 'Both diagonals equal = square', None)],
                 answer='60"'),
            dict(title='A truss from its slope',
                 visual=rtri('A half truss, run 120 inches, rise 40 inches, top chord unknown.', 'run 120"', 'rise 40"', 'c = ?'),
                 steps=[('Slope 4 in 12: rise = run × 4 ÷ 12.', '120 × 4 ÷ 12 = 40"', K('120 × 4 ÷ 12 =', 40.0)),
                        ('Top chord.', '√(120² + 40²) = %s"' % r(tc, 4), K('120 x² + 40 x² = √x', tc)),
                        ('Tape length.', '0.4911 × 16 = 7.86 → 8/16 = 1/2.  126 1/2"', None)],
                 answer='126 1/2"')],
        mistake=_mistake('Adding the sides without squaring.', wrong_right('Wrong: 28 1/4 plus 64 1/4 is 92 1/2. Right: square, add, square root gives 70 3/16.', '28.25 + 64.25 = 92.5"', '√(28.25² + 64.25²) = 70 3/16"'),
                 'Square, add, then press √x.'),
        practice=[('Sides 9 ft and 12 ft. Find the diagonal.', "15'", K('9 x² + 12 x² = √x', 15.0)),
                  ('Run 96", rise 36". Find the top chord to the nearest 1/16".', '102 1/2"', K('96 x² + 36 x² = √x', math.sqrt(96 ** 2 + 36 ** 2)))])

    # 9 tanks
    v1 = PI * 0.6 ** 2 * 2
    v2 = 60 * 30 * 24 / 1728
    X[9] = dict(
        examples=[
            dict(title='A round tank in litres',
                 visual=tank_round('A round tank 1,200 millimetres inside diameter and 2,000 millimetres long. It holds 2,262 litres.', 'ID 1,200 mm', 'L 2,000 mm', '%s cu m = 2,262 L' % r(v1, 3)),
                 steps=[('Radius in metres.', '1,200 ÷ 2 = 600 mm = 0.6 m', None),
                        ('V = π × r × r × L.', 'π × 0.6 × 0.6 × 2 = %s cu m' % r(v1, 4), K('.6 x² × π × 2 =', v1)),
                        ('× 1,000 for litres.', '%s × 1,000 = 2,262 L' % r(v1, 4), K('.6 x² × π × 2 × 1000 =', v1 * 1000))],
                 answer='2,262 L'),
            dict(title='A box tank in inches',
                 visual=box('A box tank 60 by 30 by 24 inches inside. It holds 156.25 gallons.', '60"', '30"', '24"', '156.25 gal'),
                 steps=[('Volume in cubic inches.', '60 × 30 × 24 = 43,200 cu in', None),
                        ('÷ 1,728 for cubic feet.', '43,200 ÷ 1,728 = 25 cu ft', K('60 × 30 × 24 ÷ 1728 =', v2)),
                        ('× 6.25 for gallons.', '25 × 6.25 = 156.25 gal', K('25 × 6.25 =', 156.25))],
                 answer='156.25 gal')],
        mistake=_mistake('Using outside sizes.', wrong_right('Wrong: outside sizes count the plate, so the tank seems to hold more. Right: use inside sizes.', 'Outside sizes → too much', 'Inside sizes → right'),
                 'Capacity is the space inside. Take off the plate thickness.'),
        practice=[("Box tank 5' × 4' × 3'. Find the gallons.", '375 gal', K('5 × 4 × 3 × 6.25 =', 375.0)),
                  ('Round tank ID 1 m, L 1.5 m. Find the litres.', '1,178 L', K('.5 x² × π × 1.5 × 1000 =', PI * 0.25 * 1.5 * 1000))])

    # 10 parallel line development
    k = 57 * math.tan(math.radians(45))
    lines = [150 - k * math.cos(math.radians(30 * i)) for i in range(7)]
    R, rb, H = 84, 57, 200
    z30 = math.sqrt(R * R - (rb * 0.5) ** 2)
    tl = [H - math.sqrt(R * R - (rb * math.sin(math.radians(p))) ** 2) for p in (0, 30, 60, 90)]
    X[10] = dict(
        examples=[
            dict(title='All 7 lines for a 45° cut',
                 visual=pattern('A pattern for a pipe 114 millimetres across, 150 long, cut at 45 degrees. Element lines from 93 to 207 millimetres.', lines),
                 steps=[('Rise of the cut: r × tan θ.', '57 × tan 45° = 57 mm', K('57 × 45 tan =', k)),
                        ('Line = L − 57 × cos(angle). Angles go up by 30°.', 'cos 0° = 1, cos 30° = 0.866, cos 60° = 0.5, cos 90° = 0', None),
                        ('Line 2.', '150 − 57 × 0.866 = %s mm' % r(lines[1], 1), K('150 − 57 × 30 cos =', lines[1])),
                        ('All 7 lines.', ', '.join('%g' % round(x, 1) for x in lines) + ' mm', None)],
                 answer='93 to 207 mm'),
            dict(title='A 90° tee: branch on a main',
                 visual=tee('A 114 millimetre branch on a 168 millimetre main. Branch end 200 millimetres above the main centre.', 'H = 200', 'Main 168 mm', 'Branch 114', 'Lines: %d to %d mm' % (round(tl[0]), round(tl[-1]))),
                 steps=[('Main radius %d. Branch radius %d.' % (R, rb), 'Point at 30°: out to the side %d × sin 30° = %g mm' % (rb, rb / 2), K('%d × 30 sin =' % rb, rb / 2)),
                        ('Height of the main there.', '√(%d² − %g²) = %s mm' % (R, rb / 2, r(z30, 2)), None),
                        ('Line = H − height.', '%d − %s = %s mm' % (H, r(z30, 2), r(tl[1], 2)), K('%d − ( %d x² − %g x² ) √x =' % (H, R, rb / 2), tl[1])),
                        ('Lines at 0°, 30°, 60°, 90°.', ', '.join('%g' % round(x, 1) for x in tl) + ' mm', None)],
                 answer=', '.join('%g' % round(x) for x in tl) + ' mm')],
        mistake=_mistake('Calculator in RAD, not DEG.', wrong_right('Wrong: in RAD mode, tan 45 gives 1.62. Right: in DEG mode, tan 45 gives 1.', 'RAD: tan 45 = 1.62', 'DEG: tan 45 = 1'),
                 'Look for DEG on the screen before you press sin, cos or tan.'),
        practice=[('D = 219 mm. Find the stretch-out to 1 decimal.', '688.0 mm', K('π × 219 =', PI * 219)),
                  ('D 168, L 200, cut 30°. Find the longest line.', '248 mm', K('200 + 84 × 30 tan =', 200 + 84 * math.tan(math.radians(30))))])
    return X


# spoken words for the narration of the worked examples

UNITS = [(' sq in', ' square inches'), (' sq ft', ' square feet'), (' sq m', ' square metres'), (' cu in', ' cubic inches'),
         (' cu ft', ' cubic feet'), (' cu m', ' cubic metres'), (' mm', ' millimetres'), (' kg', ' kilograms'), (' lb', ' pounds'),
         (' gal', ' gallons'), (' L', ' litres'), (' m', ' metres')]
SYMBOLS = [('×', ' times '), ('÷', ' divided by '), ('=', ' equals '), ('+', ' plus '), ('−', ' minus '), ('π', ' pi '), ('√', ' the square root of '),
           ('²', ' squared '), ('θ', ' theta '), ('°', ' degrees '), ('→', ', rounded, '), ('(', ' '), (')', ' '), (':', ','), ('  ', ' ')]
ORD = {2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth'}


def speak(text):
    def n(s):
        return num2words(int(s.replace(',', ''))).replace(' and ', ' ').replace(',', '').replace('-', ' ')

    def frac(a, b):
        a, b = int(a), int(b)
        word = ORD.get(b, num2words(b, to='ordinal'))
        return '%s %s%s' % (n(str(a)), word, 's' if a > 1 else '')

    def dec(m):
        whole, part = m.group(0).replace(',', '').split('.')
        return (n(whole) if whole else 'zero') + ' point ' + ' '.join(num2words(int(c)) for c in part)

    s = text.replace('nearest 1/16"', 'nearest sixteenth of an inch').replace('nearest mm', 'nearest millimetre')
    s = re.sub(r"(\d+)'-(\d+) (\d+)/(\d+)\"", lambda m: '%s feet, %s and %s inches' % (n(m[1]), n(m[2]), frac(m[3], m[4])), s)
    s = re.sub(r"(\d+)'-(\d+)\"", lambda m: '%s feet, %s inches' % (n(m[1]), n(m[2])), s)
    s = re.sub(r'(\d+) (\d+)/(\d+)"', lambda m: '%s and %s inches' % (n(m[1]), frac(m[2], m[3])), s)
    s = re.sub(r'\b(\d+)/(\d+)"', lambda m: '%s of an inch' % frac(m[1], m[2]), s)
    s = re.sub(r'(\d+) (\d+)/(\d+)', lambda m: '%s and %s' % (n(m[1]), frac(m[2], m[3])), s)
    s = re.sub(r'\b(\d+)/(\d+)\b', lambda m: frac(m[1], m[2]), s)
    s = re.sub(r'(\d[\d,]*\.\d+|\.\d+)"', lambda m: m.group(1) + ' inches', s)
    s = re.sub(r"(\d[\d,]*\.\d+|\.\d+)'", lambda m: m.group(1) + ' feet', s)
    s = re.sub(r'(\d[\d,]*)"', lambda m: m.group(1) + ' inches', s)
    s = re.sub(r"(\d[\d,]*)'", lambda m: m.group(1) + ' feet', s)
    for a, b in UNITS:
        s = re.sub(r'(\d)' + re.escape(a) + r'\b', lambda m, b=b: m.group(1) + b, s)
    s = re.sub(r'(?:\d{1,3}(?:,\d{3})+|\d+)?\.\d+', dec, s)
    s = re.sub(r'\d{1,3}(?:,\d{3})+|\d+', lambda m: n(m.group(0)), s)
    for a, b in SYMBOLS:
        s = s.replace(a, b)
    for a, b in (('tan', 'tangent'), ('cos', 'cosine'), ('sin', 'sine'), ('MD', 'M D'), ('SO', 'S O'), ('OD', 'O D'), ('ID', 'I D'), ('IR', 'I R'), ('MR', 'M R'), ('DEG', 'D E G'), ('RAD', 'R A D')):
        s = re.sub(r'\b%s\b' % a, b, s)
    return re.sub(r'\s+', ' ', s).strip()


def narration(n, ex):
    parts = ['Lesson %d, worked examples.' % n]
    for i, e in enumerate(ex['examples'], 1):
        parts.append('Example %d. %s.' % (i, speak(e['title'])))
        for say, math_, _ in e['steps']:
            parts.append(speak(say) + ' ' + speak(math_) + '.')
        parts.append('The answer is ' + speak(e['answer']) + '.')
    m = ex['mistake']
    parts.append('Watch out. ' + speak(m['head']) + ' ' + speak(m['fix']))
    parts.append('Now practise. Pause after each question and work it out.')
    for q, a, _ in ex['practice']:
        parts.append(speak(q) + ' ... The answer is ' + speak(a) + '.')
    parts.append('Well done. Play this again any time.')
    return ' '.join(parts)
