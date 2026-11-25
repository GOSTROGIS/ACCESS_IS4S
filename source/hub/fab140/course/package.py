"""Metal Fab math package: trusses IT1-a to IT1-j, radiused sections and the twelve tank fit-ups.

Givens come from the package worksheets. Every answer is computed here, played on the TI-30Xa emulator,
and checked against the instructor's answer keys (as listed in the worked-solutions PDF).
"""
import json
import math
import pathlib
import sys

from guides import f16



def inch(s):
    """Feet-inches text such as 2'-0 1/2" or 15 5/8" to decimal inches."""
    s = s.replace('"', '').strip()
    ft = 0
    if "'" in s:
        a, s = s.split("'")
        ft = int(a)
        s = s.lstrip('-')
    tot = 0.0
    for part in s.split():
        if '/' in part:
            n, d = part.split('/')
            tot += int(n) / int(d)
        elif part:
            tot += float(part)
    return ft * 12 + tot


def fi(x):
    """Decimal inches to feet-inches to the nearest 1/16."""
    n = round(x * 16)
    ft, rem = divmod(n, 192)
    i = f16(rem / 16) if rem else '0'
    if ft and 0 < rem < 16:
        i = '0 ' + i
    return "%d'-%s\"" % (ft, i) if ft else '%s"' % i


TRUSS = [('IT1-a', "2'-0 1/2", "3'-6", "1'-5 1/4"), ('IT1-b', "2'-4 1/4", "5'-4 1/4", "2'-4 3/8"),
         ('IT1-c', "3'-0 7/8", "7'-4 5/8", "3'-4 9/16"), ('IT1-d', "3'-4 1/8", "10'-8 1/2", "5'-0 1/2"),
         ('IT1-e', "6'-0 5/8", "7'-4 7/8", "3'-4 11/16"), ('IT1-f', "7'-0 3/4", "12'-0 1/8", "5'-8 5/16"),
         ('IT1-g', "8'-0 1/16", "10'-2 3/8", "4'-9 7/16"), ('IT1-h', "8'-6 5/16", "14'-7 3/4", "7'-0 1/8"),
         ('IT1-i', "9'-7 5/8", "16'-10 1/2", "8'-1 1/2"), ('IT1-j', "10'-0 15/16", "11'-4 1/2", "5'-4 1/2")]
# Instructor key, truss answer key page 11: C D F G H I
TRUSS_KEY = {'IT1-a': ("4'-0 5/8", '7', "2'-0 3/4", "1'-2 7/16", "1'-8", "2'-4 5/8"),
             'IT1-b': ("5'-10 3/16", '5 1/4', "2'-11 7/8", "1'-3 3/4", "2'-7", "3'-3 3/16"),
             'IT1-c': ("8'-0", '5', "4'-0 1/16", "1'-8", "3'-7 15/16", "4'-4 1/16"),
             'IT1-d': ("11'-2 5/8", '3 3/4', "5'-8", "1'-9 1/4", "5'-3 3/8", "5'-11 1/4"),
             'IT1-e': ("9'-6 3/4", '9 13/16', "4'-0 3/16", "3'-3 3/8", "4'-4 9/16", "5'-2 1/4"),
             'IT1-f': ("13'-11 3/16", '7 1/16', "6'-3 13/16", "3'-8 9/16", "6'-7 1/4", "7'-3 15/16"),
             'IT1-g': ("12'-11 9/16", '9 7/16', "5'-4 15/16", "4'-3", "6'-1", "6'-10 9/16"),
             'IT1-h': ("16'-11 3/8", '7', "7'-7 5/8", "4'-5 5/16", "8'-1 5/16", "8'-10"),
             'IT1-i': ("19'-5 3/16", '6 7/8', "8'-9", "4'-11 15/16", "9'-4 1/4", "10'-0 15/16"),
             'IT1-j': ("15'-2 3/8", '10 5/8', "6'-0", "5'-3 13/16", "7'-2 3/16", "8'-0 3/16")}
# Radiused sections: name, unit, T, inside radius, A-leg OAL, C-leg OAL
RADIUS = [('Metric 1', 'mm', '12', '248', '358', '552'), ('Metric 2', 'mm', '10', '184', '309', '398'),
          ('Metric 3', 'mm', '16', '387', '606', '860'), ('Metric 4', 'mm', '19', '473', '816', '1114'),
          ('Imperial 1', 'in', '1/2', '8 7/8', '15 5/8', "1'-9 3/8"), ('Imperial 2', 'in', '1/4', '6 1/8', '11 5/8', "1'-9"),
          ('Imperial 3', 'in', '1/8', '4 3/4', '10 3/8', "1'-2 3/8"), ('Imperial 4', 'in', '3/8', '8 3/8', '13', "1'-7 13/16")]
# Tanks: name, fit-up, shell OD, shell T, end plate EP, overall length, G, H
TANKS = [('ICC-A', 'ICC', "1'-6 1/2", '1/4', '3/8', "3'-10 1/4", '8 1/2', "2'-9 3/4"),
         ('ICC-B', 'ICC', "2'-2 7/8", '3/8', '1/2', "4'-10 3/4", "1'-4 7/8", "3'-10 1/4"),
         ('ICC-C', 'ICC', "4'-1 5/8", '1/2', '3/4', "9'-4 7/8", "3'-3 5/8", "8'-4 3/8"),
         ('ICC-D', 'ICC', "7'-0 1/4", '3/4', '1 1/4', "12'-0 1/8", "6'-2 1/4", "10'-11 5/8"),
         ('IOF-A', 'IOF', "3'-0 1/4", '1/4', '1/2', "5'-8 3/4", "2'-2", "4'-6 3/8"),
         ('IOF-B', 'IOF', "5'-1 7/8", '3/8', '5/8', "6'-7 1/8", "4'-3 5/8", "5'-4 3/4"),
         ('IOF-C', 'IOF', "7'-4 13/16", '1/2', '3/4', "8'-2 1/4", "6'-6 9/16", "6'-11 7/8"),
         ('IOF-D', 'IOF', "8'-6 1/2", '5/8', '7/8', "12'-1 5/8", "7'-8 1/4", "10'-11 1/4"),
         ('IIF-A', 'IIF', "1'-10 1/4", '1/4', '3/8', "5'-5 7/8", "1'-2", "4'-5 1/8"),
         ('IIF-B', 'IIF', "2'-6 1/8", '3/8', '5/8', "6'-2 1/2", "1'-9 7/8", "5'-1 3/4"),
         ('IIF-C', 'IIF', "3'-6 5/8", '1/2', '3/4', "8'-3 9/16", "2'-10 3/8", "7'-2 13/16"),
         ('IIF-D', 'IIF', "7'-11 3/8", '5/8', '1', "10'-7 1/4", "7'-3 1/8", "9'-6 1/2")]
# Instructor-key answer table as printed in the worked solutions: A B C D E F I J K L
TANK_KEY = {
  'ICC-A': ("3'-9 1/2", "4'-9 5/16", 184.78, "6'-1 3/16", 1.77, 54.07, "2'-10 13/16", 238.86, 6.70, 41.88),
  'ICC-B': ("4'-9 3/4", "6'-11 1/4", 510.83, "8'-5 5/16", 3.72, 151.88, "4'-1 1/4", 662.71, 17.91, 111.97),
  'ICC-C': ("9'-3 3/8", "12'-10 5/16", 2435.05, "15'-10 5/16", 12.90, 789.22, "8'-11 15/16", 3224.27, 119.69, 748.05),
  'ICC-D': ("11'-9 5/8", "21'-10 5/16", 7894.69, "24'-10 1/8", 37.35, 3809.46, "12'-7 1/8", 11704.15, 440.78, 2754.88),
  'IOF-A': ("5'-7 3/4", "9'-5 1/8", 542.75, "10'-11 13/16", 7.17, 292.42, "5'-0 1/4", 835.17, 39.36, 245.97),
  'IOF-B': ("6'-5 7/8", "16'-1 3/16", 1598.64, "17'-4 5/16", 20.88, 1064.95, "6'-10 13/16", 2663.59, 132.25, 826.54),
  'IOF-C': ("8'-0 3/4", "23'-1 7/16", 3802.69, "24'-5 13/16", 43.02, 2632.86, "9'-6 15/16", 6435.54, 339.09, 2119.29),
  'IOF-D': ("11'-11 7/8", "26'-8 1/16", 8154.18, "29'-2 7/8", 57.30, 4091.41, "13'-4 7/16", 12245.60, 670.38, 4189.88),
  'IIF-A': ("5'-5 7/8", "5'-9 1/8", 322.50, "7'-11 1/2", 2.58, 78.95, "4'-6 15/16", 401.45, 14.00, 87.52),
  'IIF-B': ("6'-2 1/2", "7'-9 7/16", 739.81, "9'-11 1/2", 4.71, 240.02, "5'-5 1/2", 979.84, 28.73, 179.55),
  'IIF-C': ("8'-3 9/16", "11'-0 5/16", 1866.61, "13'-9 5/8", 9.45, 578.35, "7'-9 3/8", 2444.95, 77.22, 482.66),
  'IIF-D': ("10'-7 1/4", "24'-9 11/16", 6707.56, "26'-11 3/4", 48.32, 3943.01, "11'-11 7/8", 10650.57, 504.35, 3152.20)}
TANK_UNIT = {'C': 'lb', 'E': 'sq ft', 'F': 'lb', 'J': 'lb', 'K': 'cu ft', 'L': 'gal'}
FITUP = {'ICC': 'Corner to corner', 'IOF': 'Outside flush', 'IIF': 'Inside flush'}


def n(x):
    """A given as keyed on the calculator: 0.375 is keyed .375, 46.0 is keyed 46."""
    t = ('%.6f' % x).rstrip('0').rstrip('.')
    return t[1:] if t.startswith('0.') else t


def q4(x):
    """An intermediate value as it is shown in the working, to 4 decimal places."""
    return ('%.4f' % x).rstrip('0').rstrip('.')


def rows_of(spec, fmt, unit):
    """Answer rows. unit(k) names the unit: in, mm, lb, sq ft, cu ft or gal."""
    return [{'k': k, 'what': w, 'f': f, 'w': nums, 'v': v, 'ans': fmt(k, v), 'u': unit(k), 'seq': seq} for k, w, f, nums, v, seq in spec]


def truss(name, a, b, e):
    A, B, E = inch(a), inch(b), inch(e)
    F = B - E
    D = A / B * 12
    G = F * A / B
    C = math.hypot(A, B)
    I = math.hypot(F, G)
    H = C - I
    a_, b_, e_ = n(A), n(B), n(E)
    f_ = '( %s − %s )' % (b_, e_)
    g_ = '( %s × %s ÷ %s )' % (f_, a_, b_)
    spec = [('F', 'Heel to web, along the run', 'F = B − E', '%s − %s' % (b_, e_), F, '%s − %s =' % (b_, e_)),
            ('D', 'Rise per 12" of run', 'D = A ÷ B × 12', '%s ÷ %s × 12' % (a_, b_), D, '%s ÷ %s × 12 =' % (a_, b_)),
            ('G', 'Web height', 'G = F × A ÷ B', '%s × %s ÷ %s' % (fi(F), a_, b_), G, '%s × %s ÷ %s =' % (f_, a_, b_)),
            ('C', 'Top chord, heel to peak', 'C = √(A² + B²)', '√(%s² + %s²)' % (a_, b_), C, '%s x² + %s x² = √x' % (a_, b_)),
            ('I', 'Top chord, heel to web', 'I = √(F² + G²)', '√(%s² + %s²)' % (fi(F), fi(G)), I, '%s x² + %s x² = √x' % (f_, g_)),
            ('H', 'Top chord, web to peak', 'H = C − I', '%s − %s' % (fi(C), fi(I)), H,
             '%s x² + %s x² = √x − ( %s x² + %s x² ) √x =' % (a_, b_, f_, g_))]
    return {'name': name, 'kind': 'truss', 'given': [('A rise', a + '"'), ('B run', b + '"'), ('E web to peak', e + '"')],
            'rows': rows_of(spec, lambda k, v: fi(v), lambda k: 'in'), 'num': {'A': A, 'B': B, 'E': E}}


def radius(name, unit, t, ir, oa, oc):
    Tt, IR, OA, OC = inch(t), inch(ir), inch(oa), inch(oc)
    MR = IR + Tt / 2
    A = OA - (IR + Tt)
    B = math.pi * MR * 90 / 180
    C = OC - (IR + Tt)
    tot = A + B + C
    t_, ir_, oa_, oc_ = n(Tt), n(IR), n(OA), n(OC)
    mm = unit == 'mm'
    u = ' mm' if mm else '"'
    spec = [('MR', 'Mean radius', 'MR = IR + ½T', '%s + %s ÷ 2' % (ir_, t_), MR, '%s + %s ÷ 2 =' % (ir_, t_)),
            ('A', 'Straight leg to the tangent point', 'A = OAL − (IR + T)', '%s − (%s + %s)' % (oa_, ir_, t_), A, '%s − ( %s + %s ) =' % (oa_, ir_, t_)),
            ('B', 'Stretchout of the 90° bend', 'B = π × MR × 90 ÷ 180', 'π × %s × 90 ÷ 180' % n(MR), B, '( %s + %s ÷ 2 ) × π × 90 ÷ 180 =' % (ir_, t_)),
            ('C', 'Other straight leg', 'C = OAL − (IR + T)', '%s − (%s + %s)' % (oc_, ir_, t_), C, '%s − ( %s + %s ) =' % (oc_, ir_, t_)),
            ('Total', 'Flat plate length', 'A + B + C', '%s + %s + %s' % (q4(A), q4(B), q4(C)), tot,
             '%s − ( %s + %s ) + ( %s + %s ÷ 2 ) × π × 90 ÷ 180 + %s − ( %s + %s ) =' % (oa_, ir_, t_, ir_, t_, oc_, ir_, t_))]
    fmt = (lambda k, v: '%s mm' % (('%.1f' % v) if k == 'MR' else round(v))) if mm else (lambda k, v: fi(v))
    return {'name': name, 'kind': 'radius', 'given': [('Plate T', t + u), ('Inside radius', ir + u), ('OAL, A leg', oa + u), ('OAL, C leg', oc + u)],
            'rows': rows_of(spec, fmt, lambda k: 'mm' if mm else 'in'), 'num': {'T': Tt, 'IR': IR, 'OA': OA, 'OC': OC, 'mm': mm}}


def tank(name, fit, od, t, ep, oal, g, h):
    OD, Tt, EP, L, G, H = (inch(x) for x in (od, t, ep, oal, g, h))
    ID = OD - 2 * Tt
    MD = OD - Tt
    A = L if fit == 'IIF' else L - 2 * EP
    inside = L - 2 * EP
    disc = OD if fit == 'IOF' else ID
    B = math.pi * MD
    C = A * B * Tt * 40.8 / 144
    D = math.hypot(A, B)
    E = math.pi * disc ** 2 / 4 / 144
    F = E * EP * 40.8 * 2
    I = math.hypot(G, H)
    J = C + F
    K = math.pi * ID ** 2 / 4 * inside / 1728
    Lg = K * 6.25
    od_, t_, ep_, l_, g_, h_ = n(OD), n(Tt), n(EP), n(L), n(G), n(H)
    two_ep = '%s − 2 × %s' % (l_, ep_)
    a_k = l_ if fit == 'IIF' else '( %s )' % two_ep
    in_k = '( %s )' % two_ep
    id_k = '( %s − 2 × %s )' % (od_, t_)
    disc_k = od_ if fit == 'IOF' else id_k
    b_k = '( %s − %s ) × π' % (od_, t_)
    c_k = '%s × %s × %s × 40.8 ÷ 144' % (a_k, b_k, t_)
    f_k = '%s x² × π ÷ 4 ÷ 144 × %s × 40.8 × 2' % (disc_k, ep_)
    k_k = '%s x² × π ÷ 4 × %s ÷ 1728' % (id_k, in_k)
    spec = [('A', 'Shell plate width (shell length)', 'A = OAL' if fit == 'IIF' else 'A = OAL − 2 × EP', l_ if fit == 'IIF' else two_ep, A,
             (l_ if fit == 'IIF' else two_ep) + ' ='),
            ('B', 'Shell stretch-out', 'B = π × (OD − T)', 'π × (%s − %s)' % (od_, t_), B, b_k + ' ='),
            ('C', 'Shell mass (lb)', 'C = A × B × T × 40.8 ÷ 144', '%s × %s × %s × 40.8 ÷ 144' % (q4(A), q4(B), t_), C, c_k + ' ='),
            ('D', 'Diagonal of the shell plate', 'D = √(A² + B²)', '√(%s² + %s²)' % (q4(A), q4(B)), D, '%s x² + ( %s ) x² = √x' % (a_k, b_k)),
            ('E', 'One end plate area (sq ft)', 'E = π × Ø² ÷ 4 ÷ 144', 'π × %s² ÷ 4 ÷ 144' % n(disc), E, '%s x² × π ÷ 4 ÷ 144 =' % disc_k),
            ('F', 'Both end plates, mass (lb)', 'F = E × EP × 40.8 × 2', '%s × %s × 40.8 × 2' % (q4(E), ep_), F, f_k + ' ='),
            ('I', 'Saddle bolt holes, diagonal check', 'I = √(G² + H²)', '√(%s² + %s²)' % (g_, h_), I, '%s x² + %s x² = √x' % (g_, h_)),
            ('J', 'Total tank mass (lb)', 'J = C + F', '%s + %s' % (q4(C), q4(F)), J, '%s + %s =' % (c_k, f_k)),
            ('K', 'Volume (cu ft)', 'K = π × ID² ÷ 4 × inside length ÷ 1728', 'π × %s² ÷ 4 × %s ÷ 1728' % (n(ID), n(inside)), K, k_k + ' ='),
            ('L', 'Capacity (gal)', 'L = K × 6.25', '%s × 6.25' % q4(K), Lg, k_k + ' × 6.25 =')]
    ft = {'A', 'B', 'D', 'I'}
    return {'name': name, 'kind': 'tank', 'fit': FITUP[fit],
            'given': [('Shell OD', od + '"'), ('Shell T', t + '"'), ('End plate EP', ep + '"'), ('Overall length', oal + '"'), ('G c-c, saddle bolt holes', g + '"'), ('H c-c, saddle bolt holes', h + '"')],
            'rows': rows_of(spec, lambda k, v: fi(v) if k in ft else '%.2f' % v, lambda k: 'in' if k in ft else TANK_UNIT[k]),
            'num': {'fit': fit, 'OD': OD, 'T': Tt, 'EP': EP, 'L': L, 'G': G, 'H': H}}


# Trades Math Formulas sheets 1 to 4: worked examples with the value printed on each sheet.
FORMULA = [('Sheet 1', '13/16" to a decimal', '13 ÷ 16 =', 0.8125, '.8125'),
           ('Sheet 1', '.4375" to sixteenths', '.4375 × 16 =', 7, '7/16'),
           ('Sheet 2', "6'-4 7/8\" to decimal feet", '7 ÷ 8 + 4 = ÷ 12 + 6 =', 6.40625, "6.40625'"),
           ('Sheet 3', 'Circumference, r = 16 1/2"', '16.5 × 2 × π =', math.pi * 33, '103.6725576"'),
           ('Sheet 3', 'Stretch-out, ID 245, plate 10', '245 + 10 = × π =', math.pi * 255, '801.1061267 mm'),
           ('Sheet 4', 'c = √(247² + 846²)', '247 x² + 846 x² = √x', math.hypot(247, 846), '881.3200327')]

# CWB all-position bend test handout: (part, item, working, keys, value, answer, printed on the handout, check).
# Check: ok = within 1/16", near = within 1/8" (nominal stock size), off = further off than that.
CWB = [('a', 'Back-up bar width', '50 ÷ 25.4', '50 ÷ 25.4 =', 50 / 25.4, '1 15/16"', '2"', 'ok'),
       ('a', 'Back-up bar thickness', '6 ÷ 25.4', '6 ÷ 25.4 =', 6 / 25.4, '1/4"', '1/4"', 'ok'),
       ('a', 'Back-up bar length', '180 ÷ 25.4', '180 ÷ 25.4 =', 180 / 25.4, '7 1/16"', '7"', 'near'),
       ('a', 'Plate thickness', '10 ÷ 25.4', '10 ÷ 25.4 =', 10 / 25.4, '3/8"', '3/8"', 'ok'),
       ('a', 'Plate width', '75 ÷ 25.4', '75 ÷ 25.4 =', 75 / 25.4, '2 15/16"', '3 1/2"', 'off'),
       ('a', 'Plate length (the weld joint)', '150 ÷ 25.4', '150 ÷ 25.4 =', 150 / 25.4, '5 7/8"', '6"', 'near'),
       ('a', 'Top cut-off', '19 ÷ 25.4', '19 ÷ 25.4 =', 19 / 25.4, '3/4"', '3/4"', 'ok'),
       ('a', 'Bend strap width', '38 ÷ 25.4', '38 ÷ 25.4 =', 38 / 25.4, '1 1/2"', '1 1/2"', 'ok'),
       ('a', 'The handout\'s 3 1/2" plate width, back to mm', '3.5 × 25.4', '3.5 × 25.4 =', 3.5 * 25.4, '88.9 mm', '75 mm', 'off'),
       ('b', '1st pass stop, 2/3 of the joint', '150 × 2 ÷ 3', '150 × 2 ÷ 3 =', 100, '100 mm', '112 mm', 'off'),
       ('b', '1st pass stop, 3/4 of the joint', '150 × 3 ÷ 4', '150 × 3 ÷ 4 =', 112.5, '112.5 mm', '125 mm', 'off'),
       ('b', '2nd pass stop, 1/4 of the joint', '150 ÷ 4', '150 ÷ 4 =', 37.5, '37.5 mm', '38 mm', 'ok'),
       ('b', '2nd pass stop, 1/3 of the joint', '150 ÷ 3', '150 ÷ 3 =', 50, '50 mm', '50 mm', 'ok'),
       ('b', '1st pass stop, 2/3 of 6"', '6 × 2 ÷ 3', '6 × 2 ÷ 3 =', 4, '4"', '4 1/2"', 'off'),
       ('b', '1st pass stop, 3/4 of 6"', '6 × 3 ÷ 4', '6 × 3 ÷ 4 =', 4.5, '4 1/2"', '5"', 'off'),
       ('b', '2nd pass stop, 1/4 of 6"', '6 ÷ 4', '6 ÷ 4 =', 1.5, '1 1/2"', '1 1/2"', 'ok'),
       ('b', '2nd pass stop, 1/3 of 6"', '6 ÷ 3', '6 ÷ 3 =', 2, '2"', '2"', 'ok'),
       ('b', '112 mm as a part of 150', '112 ÷ 150', '112 ÷ 150 =', 112 / 150, '0.747 (about 3/4)', '', ''),
       ('b', '125 mm as a part of 150', '125 ÷ 150', '125 ÷ 150 =', 125 / 150, '0.833 (5/6)', '', ''),
       ('c', 'Cut-off plus three straps', '19 + 3 × 38', '19 + 3 × 38 =', 133, '133 mm', '', ''),
       ('c', 'Left at the start end', '150 − (19 + 3 × 38)', '150 − ( 19 + 3 × 38 ) =', 17, '17 mm', '', ''),
       ('c', 'Cut-off plus three straps, inches', '3/4 + 3 × 1 1/2', '.75 + 3 × 1.5 =', 5.25, '5 1/4"', '', ''),
       ('c', 'Left at the start end, inches', '6 − (3/4 + 3 × 1 1/2)', '6 − ( .75 + 3 × 1.5 ) =', 0.75, '3/4"', '', ''),
       ('d', 'Bevel width across the top face', '10 × tan 30°', '10 × 30 tan =', 10 * math.tan(math.radians(30)), '5.77 mm', '', ''),
       ('d', 'Bevel width, inches', '3/8 × tan 30°', '.375 × 30 tan =', 0.375 * math.tan(math.radians(30)), '3/16"', '', ''),
       ('d', 'Back-up bar past each plate end', '(180 − 150) ÷ 2', '( 180 − 150 ) ÷ 2 =', 15, '15 mm', '', ''),
       ('d', 'Back-up bar past each plate end, inches', '(7 − 6) ÷ 2', '( 7 − 6 ) ÷ 2 =', 0.5, '1/2"', '', '')]


def problems():
    return ([truss(*t) for t in TRUSS] + [radius(*r) for r in RADIUS] + [tank(*t) for t in TANKS])


def check(ps):
    """Compare every truss and tank answer with the instructor key. Returns a list of mismatches."""
    bad = []
    for p in ps:
        if p['kind'] == 'truss':
            got = {r['k']: r['ans'] for r in p['rows']}
            for k, want in zip('CDFGHI', TRUSS_KEY[p['name']]):
                if got[k] != want + '"':
                    bad.append((p['name'], k, got[k], want))
        if p['kind'] == 'tank':
            got = {r['k']: r['ans'] for r in p['rows']}
            for k, want in zip('ABCDEFIJKL', TANK_KEY[p['name']]):
                w = want + '"' if isinstance(want, str) else '%.2f' % want
                if got[k] != w:
                    bad.append((p['name'], k, got[k], w))
    return bad


HUB_JS = pathlib.Path(__file__).resolve().parent.parent / 'mf140.js'
MARK = ('/* PKG-DATA */', '/* /PKG-DATA */')


def write_hub(ps):
    """Puts the package problems into mf140.js between the PKG-DATA markers, for Module 17 in the Numeracy Hub."""
    data = [{'n': p['name'], 'kind': p['kind'], 'fit': p.get('fit', ''), 'g': p['num'], 'gt': p['given'],
             'rows': [{'k': r['k'], 'w': r['what'], 'f': r['f'], 'n': r['w'], 'v': round(r['v'], 10), 'a': r['ans'], 's': r['seq'], 'u': r['u']} for r in p['rows']]}
            for p in ps]
    js = HUB_JS.read_text(encoding='utf-8')
    a, b = js.index(MARK[0]) + len(MARK[0]), js.index(MARK[1])
    HUB_JS.write_text(js[:a] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + js[b:], encoding='utf-8')


if __name__ == '__main__':
    ps = problems()
    print(len(ps), 'problems', sum(len(p['rows']) for p in ps), 'answers')
    print('mismatches vs key:', check(ps))
    from build_guides import play
    res = play([r['seq'] for p in ps for r in p['rows']])
    bad = [(p['name'], r['k'], r['seq'], res[r['seq']]['value'], r['v']) for p in ps for r in p['rows']
           if res[r['seq']]['error'] or abs(float(res[r['seq']]['value']) - r['v']) > 1e-6 * max(1, abs(r['v']))]
    print('calculator mismatches:', bad)
    extra = [(x[2], x[3]) for x in FORMULA] + [(x[3], x[4]) for x in CWB]
    res = play([q for q, _ in extra])
    print('formula/CWB key mismatches:', [(q, res[q]['value'], v) for q, v in extra
                                          if res[q]['error'] or abs(float(res[q]['value']) - v) > 1e-6 * max(1, abs(v))])
    print('CWB inch answers vs nearest 1/16:', [(x[1], x[5], f16(x[4])) for x in CWB
                                               if x[5].endswith('"') and x[5][:-1] != f16(x[4])])
    if '--hub' in sys.argv:
        write_hub(ps)
        print('wrote the package data into', HUB_JS)
