/* Metal Fabricator Foundation, Intake 140: shop math modules for the Fabrication tab and the Exam builder. MF140
   Lessons: decimals of a foot, circles, mean diameter and stretch-out, area and plate mass by the shop rule,
   tank volume and capacity, and parallel line development. Same task shape as the FAB engine: gen(r, fx) gives
   {params, q, answers, steps, keys, fig}. Every key sequence is played on the TI-30Xa emulator by the tests.
   Shop rules used, as on the course formula sheet: 40.8 lb per sq ft per inch of thickness, 7.85 kg per sq m per mm,
   MD = ID + T or OD − T, SO = π × MD, 1 cu ft holds 6.25 gallons (the course factor), 1 cu m holds 1,000 litres. */
var MF140 = (function () {
  'use strict';
  var PI = Math.PI, D2R = PI / 180;

  /* ---------- numbers ---------- */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function fpart(rem) { var g = gcd(rem, 16); return (rem / g) + '/' + (16 / g); }
  function f16(n16) {
    var w = Math.floor(n16 / 16), rem = n16 % 16;
    if (rem === 0) return String(w);
    return w ? w + ' ' + fpart(rem) : fpart(rem);
  }
  function fr(x) { return f16(Math.round(x * 16)); }
  function clean(x) { return Number(Number(x).toPrecision(12)); }
  /* one number formatter per count of decimal places: building a formatter on every call is slow */
  var NF = {};
  function num(x, dp) { return (NF[dp] || (NF[dp] = new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))).format(Number(x)); }
  /* full calculator-style decimal, no grouping: 10 significant figures, trailing zeros dropped */
  function cd(x) { return String(Number(Number(x).toPrecision(10))); }
  function key(x) { var s = cd(x); return s.replace(/^0\./, '.'); }
  /* feet and inches from whole sixteenths: 6'-4 7/8" */
  function ftin(n16) {
    var ft = Math.floor(n16 / 192), rest = n16 - ft * 192;
    return ft + "'-" + f16(rest) + '"';
  }
  /* a fraction of an inch as calculator keys: 7 ÷ 16 */
  function fracKeys(k16) { var g = gcd(k16, 16); return (k16 / g) + ' ÷ ' + (16 / g); }

  /* ---------- answers and checking ---------- */
  function A(o) {
    var a = { label: o.label, unit: o.unit || '', value: o.value, kind: o.kind || 'num', dp: o.dp == null ? 2 : o.dp,
      tol: o.tol, rel: o.rel || 0, alts: o.alts || [], require: o.require || null, mf140: true };
    if (a.kind === 'frac') a.display = fr(a.value);
    else if (a.kind === 'int') a.display = num(a.value, 0);
    else a.display = num(a.value, a.dp);
    if (o.display) a.display = o.display;
    if (a.tol == null) a.tol = a.kind === 'int' ? 0.001 : 0.6 * Math.pow(10, -a.dp) + 1e-9;
    return a;
  }
  function parse(str) {
    var s = String(str == null ? '' : str).trim().replace(/[,\s]+$/, '').replace(/,(?=\d{3}\b)/g, '');
    s = s.replace(/\s*(in|inches|inch|"|mm|m|kg|lb|lbs|ft|sq ft|sq in|cu ft|gal|gallons|l|litres|liters|L)\.?\s*$/i, '').trim();
    if (!s) return { v: NaN, kind: 'empty' };
    var m = /^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (m && +m[3]) return { v: +m[1] + (+m[2]) / (+m[3]), kind: 'fraction' };
    m = /^(-?\d+)\s*\/\s*(\d+)$/.exec(s);
    if (m && +m[2]) return { v: (+m[1]) / (+m[2]), kind: 'fraction' };
    m = /^-?(\d+\.?\d*|\.\d+)$/.exec(s);
    if (m) return { v: parseFloat(s), kind: /\./.test(s) ? 'decimal' : 'whole' };
    return { v: NaN, kind: 'bad' };
  }
  function within(v, target, a) { return Math.abs(v - target) <= Math.max(a.tol, a.rel * Math.abs(target)) + 1e-9; }
  function checkOne(a, str) {
    var p = parse(str);
    if (p.kind === 'empty') return { ok: false, code: 'empty' };
    if (isNaN(p.v)) return { ok: false, code: 'bad' };
    var isWhole = Math.abs(a.value - Math.round(a.value)) < 1e-9;
    if (a.require === 'fraction' && p.kind !== 'fraction' && !(isWhole && p.kind === 'whole')) return { ok: false, code: 'needFraction' };
    if (a.require === 'decimal' && p.kind === 'fraction') return { ok: false, code: 'needDecimal' };
    if (within(p.v, a.value, a)) return { ok: true };
    for (var i = 0; i < a.alts.length; i++) if (within(p.v, a.alts[i], a)) return { ok: true, alt: true };
    return { ok: false, code: 'wrong' };
  }
  function K(label, seq, expect) { return { label: label, seq: seq, expect: expect }; }

  /* feet-and-inches pieces from a length in inches, rounded to the nearest 1/16 */
  function ftinParts(inches) {
    var n16 = Math.round(inches * 16), ft = Math.floor(n16 / 192);
    return { n16: n16, ft: ft, in16: n16 - ft * 192 };
  }
  /* steps that turn decimal feet into feet, inches and sixteenths */
  function dfSteps(df) {
    var ft = Math.floor(df), dpart = df - ft, inch = dpart * 12, w = Math.floor(inch), s = (inch - w) * 16, k = Math.round(s);
    var out = ['Keep the whole feet: ' + ft + "'.",
      'Multiply the decimal part by 12 to get inches: ' + key(dpart) + ' × 12 = ' + cd(inch) + '".',
      'Keep the whole inches: ' + w + '".',
      'Multiply the part left over by 16 to count sixteenths: ' + key(inch - w) + ' × 16 = ' + cd(s) + '. Round to ' + k + '.'];
    if (k === 16) out.push('16/16 is a whole inch. Add 1 to the inches.');
    else if (k > 0 && gcd(k, 16) > 1) out.push(k + '/16 = ' + fpart(k) + '.');
    return out;
  }

  /* ---------- drawings (paper style, the same classes as the Fabrication diagrams) ---------- */
  var W = 560;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function isQ(s) { return /\?/.test(String(s)); }
  function svg(h, label, body) {
    return '<svg class="dg" viewBox="0 0 ' + W + ' ' + h + '" role="img" aria-label="' + esc(label) + '"><rect class="paper-grid" x="0" y="0" width="' + W + '" height="' + h + '"/>' + body + '</svg>';
  }
  function tx(x, y, s, o) {
    o = o || {};
    var c = 't' + (o.k || isQ(s) ? ' tk' : '') + (o.sm ? ' tsm' : '') + (o.big ? ' tbig' : '');
    return '<text class="' + c + '" x="' + r1(x) + '" y="' + r1(y) + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + '>' + esc(s) + '</text>';
  }
  function ln(x1, y1, x2, y2, c) { return '<line class="' + c + '" x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '"/>'; }
  function rc(x, y, w, h, c) { return '<rect class="' + c + '" x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(h) + '"/>'; }
  function ci(x, y, r, c) { return '<circle class="' + c + '" cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r) + '"/>'; }
  function pa(d, c, fill) { return '<path class="' + c + '" d="' + d + '"' + (fill === false ? ' fill="none"' : '') + '/>'; }
  function dimH(x1, x2, y, lab, below) { return ln(x1, y, x2, y, isQ(lab) ? 'dk' : 'd') + tx((x1 + x2) / 2, below ? y + 19 : y - 8, lab, { a: 'middle' }); }

  var FIG = {
    /* a feet-and-inches length on a bar, with its decimal-feet partner */
    bar: function (f) {
      return svg(150, f.label, rc(70, 52, 420, 26, 'o') + ln(70, 40, 70, 90, 'ext') + ln(490, 40, 490, 90, 'ext') +
        dimH(70, 490, 36, f.top) + tx(280, 120, f.bottom, { a: 'middle', big: true }));
    },
    circle: function (f) {
      var cx = 200, cy = 112, R = 80, h = ci(cx, cy, R, 'o') + ln(cx - R, cy, cx + R, cy, 'd') + ci(cx, cy, 3, 'o');
      h += tx(cx, cy - 10, f.d, { a: 'middle' });
      if (f.r) h += tx(cx + R / 2, cy + 22, f.r, { a: 'middle', sm: true });
      h += tx(390, 80, 'Around the outside:', { sm: true }) + tx(390, 104, f.c, { big: true });
      if (f.note) h += tx(390, 136, f.note, { sm: true });
      return svg(224, f.label, h);
    },
    shell: function (f) {
      var cx = 150, cy = 112, Ro = 82, Ri = 64, h = ci(cx, cy, Ro, 'o') + ci(cx, cy, Ri, 'o side') + ci(cx, cy, (Ro + Ri) / 2, 'fold');
      h += tx(cx, cy - Ro - 10, f.od, { a: 'middle', sm: true }) + tx(cx, cy + 5, f.id, { a: 'middle', sm: true });
      h += tx(cx + Ro + 8, cy + 40, f.t, { sm: true });
      h += tx(300, 58, 'Rolled flat:', { sm: true }) + rc(300, 70, 230, 34, 'o') + dimH(300, 530, 128, f.so, true);
      h += tx(300, 196, f.md, { sm: true });
      return svg(214, f.label, h);
    },
    plate: function (f) {
      var h = pa('M60,128 L340,128 L420,72 L140,72 Z', 'o') + pa('M60,128 L340,128 L340,142 L60,142 Z', 'o side') + pa('M340,128 L420,72 L420,86 L340,142 Z', 'o side2');
      h += tx(200, 166, f.L, { a: 'middle' }) + tx(392, 116, f.W) + tx(52, 141, f.T, { a: 'end' }) + tx(280, 40, f.rule, { a: 'middle', sm: true });
      h += tx(280, 196, f.m, { a: 'middle', big: true });
      return svg(212, f.label, h);
    },
    disc: function (f) {
      var h = pa('M120,120 a110,40 0 1,0 220,0 a110,40 0 1,0 -220,0', 'o') + pa('M120,120 L120,134 a110,40 0 0,0 220,0 L340,120', 'o side', false);
      h += ln(120, 120, 340, 120, 'd') + tx(230, 112, f.d, { a: 'middle' }) + tx(350, 140, f.T) + tx(280, 40, f.rule, { a: 'middle', sm: true }) + tx(280, 200, f.m, { a: 'middle', big: true });
      return svg(214, f.label, h);
    },
    box: function (f) {
      var h = pa('M90,150 L330,150 L330,70 L90,70 Z', 'o') + pa('M330,150 L410,110 L410,30 L330,70 Z', 'o side2') + pa('M90,70 L170,30 L410,30 L330,70 Z', 'o side');
      h += tx(210, 174, f.L, { a: 'middle' }) + tx(382, 146, f.W) + tx(82, 115, f.H, { a: 'end' }) + tx(470, 80, f.v, { a: 'middle', sm: true }) + tx(470, 104, f.c, { a: 'middle', sm: true });
      return svg(196, f.label, h);
    },
    tank: function (f) {
      var h = rc(90, 60, 300, 100, 'o') + pa('M90,60 a24,50 0 0,0 0,100', 'o side', false) + pa('M390,60 a24,50 0 0,1 0,100', 'o', false) + pa('M390,60 a24,50 0 0,0 0,100', 'fold', false);
      h += dimH(90, 390, 44, f.L) + ln(420, 60, 420, 160, 'd') + tx(430, 115, f.D) + tx(240, 190, f.c, { a: 'middle', sm: true });
      return svg(206, f.label, h);
    },
    /* stretch-out of a pipe pattern divided into 12 spaces */
    spaces: function (f) {
      var x0 = 50, w = 460, y = 60, h = rc(x0, y, w, 60, 'o');
      for (var i = 1; i < 12; i++) h += ln(x0 + w * i / 12, y, x0 + w * i / 12, y + 60, 'fold');
      for (var j = 0; j <= 12; j++) h += tx(x0 + w * j / 12, y + 78, String(j % 12 + 1), { a: 'middle', sm: true });
      h += dimH(x0, x0 + w, y - 14, f.so) + dimH(x0, x0 + w / 12, y + 108, f.sp, false);
      h += tx(280, 196, f.d, { a: 'middle', sm: true });
      return svg(212, f.label, h);
    },
    /* a pipe cut at an angle: front view with element lines */
    mitre: function (f) {
      var x0 = 120, wd = 140, yb = 190, L = 110, k = Math.min(60, Math.tan(f.t * D2R) * wd / 2), h = '';
      h += pa('M' + x0 + ',' + yb + ' L' + (x0 + wd) + ',' + yb + ' L' + (x0 + wd) + ',' + (yb - L - k) + ' L' + x0 + ',' + (yb - L + k) + ' Z', 'o');
      for (var i = 0; i <= 6; i++) {
        var x = x0 + wd / 2 - (wd / 2) * Math.cos(i * 30 * D2R), yt = yb - (L - k * Math.cos(i * 30 * D2R));
        h += ln(x, yb, x, yt, 'fold');
        if (i % 3 === 0) h += tx(x, yb + 16, String(i + 1), { a: 'middle', sm: true });
      }
      h += ln(x0 + wd / 2, yb + 22, x0 + wd / 2, yb - L - 20, 'ext');
      h += dimH(x0, x0 + wd, yb + 40, f.d, false);
      h += tx(x0 + wd + 30, yb - L - k + 4, f.b, { sm: true }) + tx(x0 - 10, yb - L + k + 4, f.a, { a: 'end', sm: true });
      h += tx(x0 + wd / 2 + 6, yb - L / 2, f.L, { sm: true }) + tx(340, 200, f.t + '° cut, off square', { sm: true });
      if (f.e) h += tx(340, 224, f.e, { sm: true });
      return svg(250, f.label, h);
    },
    /* a branch on a main: end view of the tee */
    tee: function (f) {
      var cx = 280, cy = 170, R = 70, r = Math.max(26, Math.min(R - 6, R * f.rr)), h = '';
      h += ci(cx, cy, R, 'o');
      var yTop = cy - R - 80;
      h += pa('M' + (cx - r) + ',' + yTop + ' L' + (cx - r) + ',' + (cy - Math.sqrt(R * R - r * r)) + ' A' + R + ',' + R + ' 0 0,1 ' + (cx + r) + ',' + (cy - Math.sqrt(R * R - r * r)) + ' L' + (cx + r) + ',' + yTop + ' Z', 'o side');
      h += ln(cx, yTop - 10, cx, cy, 'ext') + ci(cx, cy, 3, 'o');
      h += ln(cx + R + 30, yTop, cx + R + 30, cy, 'd') + tx(cx + R + 38, (yTop + cy) / 2, f.H);
      h += tx(cx, cy + R + 22, f.R, { a: 'middle', sm: true }) + tx(cx - r - 10, yTop + 18, f.r, { a: 'end', sm: true });
      if (f.e) h += tx(20, 258, f.e, { sm: true });
      return svg(270, f.label, h);
    }
  };
  function draw(fig) { return fig && fig.mf && FIG[fig.type] ? FIG[fig.type](fig) : ''; }
  function fg(type, o) { o.mf = true; o.type = type; return o; }

  /* ---------- modules and task generators ---------- */
  var MODULES = [
    {
      id: 'dfoot', title: 'Decimals of a foot', short: 'Feet and inches to decimal feet and back, nearest 1/16", decimal inches for machines',
      why: 'Calculators and machine screens work in decimals. Drawings and tapes work in feet, inches and sixteenths. You change from one to the other many times a day.',
      lesson: 2,
      example: { task: 'm111', fx: { ft: 6, inch: 4, k: 14 } },
      tasks: [
        { id: 'm111', level: 1, title: 'Feet and inches to decimal feet', gen: function (r, fx) {
          var p = fx || { ft: ri(r, 2, 20), inch: ri(r, 1, 11), k: ri(r, 1, 15) };
          var g = gcd(p.k, 16), n = p.k / g, d = 16 / g, fd = p.k / 16, ins = p.inch + fd, v = p.ft + ins / 12;
          var txt = p.ft + "'-" + f16(p.inch * 16 + p.k) + '"';
          return {
            params: p,
            q: 'Change ' + txt + ' to decimal feet. Round to 4 decimal places.',
            answers: [A({ label: 'Decimal feet', unit: 'ft', value: v, dp: 4, require: 'decimal' })],
            steps: ['Change the fraction to a decimal: ' + n + ' ÷ ' + d + ' = ' + cd(fd) + '.',
              'Add the whole inches: ' + p.inch + ' + ' + key(fd) + ' = ' + cd(ins) + '".',
              'Divide by 12 to change inches to feet: ' + cd(ins) + ' ÷ 12 = ' + cd(ins / 12) + "'.",
              'Add the whole feet: ' + p.ft + ' + ' + key(ins / 12) + ' = ' + cd(v) + "'.",
              'Rounded: ' + num(v, 4) + "'."],
            keys: [K('Decimal feet', n + ' ÷ ' + d + ' + ' + p.inch + ' = ÷ 12 + ' + p.ft + ' =', v)],
            fig: fg('bar', { label: 'A bar ' + txt + ' long', top: txt, bottom: '? decimal feet' })
          };
        } },
        { id: 'm112', level: 2, title: 'Decimal feet to feet, inches and sixteenths', gen: function (r, fx) {
          var p = fx;
          if (!p) { var t; do { p = { ft: ri(r, 1, 24), d4: ri(r, 1, 9999) }; t = Math.round((p.d4 / 10000) * 12 * 16); } while (t < 1 || t > 191 || t % 16 === 0); }
          var df = p.ft + p.d4 / 10000, inch = (df - p.ft) * 12, w = Math.floor(inch), n16 = Math.round(inch * 16);
          var dtxt = p.ft + '.' + String(p.d4).padStart(4, '0');
          return {
            params: p,
            q: 'A calculator gives a length of ' + dtxt + "' (decimal feet). Write it in feet and inches to the nearest 1/16\" for your tape.",
            answers: [A({ label: 'Feet', unit: 'ft', value: p.ft, kind: 'int' }), A({ label: 'Inches', unit: 'in', value: n16 / 16, kind: 'frac', tol: 0.01 })],
            steps: dfSteps(df).concat(['Answer: ' + ftin(p.ft * 192 + n16) + '.']),
            keys: [K('Inches', '.' + String(p.d4).padStart(4, '0') + ' × 12 =', inch), K('Sixteenths left over', '.' + String(p.d4).padStart(4, '0') + ' × 12 − ' + w + ' = × 16 =', (inch - w) * 16)],
            fig: fg('bar', { label: 'A length of ' + dtxt + ' feet', top: dtxt + "'", bottom: "?' - ? \"" })
          };
        } },
        { id: 'm113', level: 1, title: 'Decimal inches to the nearest 1/16"', gen: function (r, fx) {
          var p = fx;
          if (!p) { var k; do { p = { w: ri(r, 0, 11), d4: ri(r, 1, 9999) }; k = Math.round(p.d4 / 10000 * 16); } while (k < 1 || k > 15 || Math.abs(p.d4 / 10000 * 16 - k) < 0.05 || Math.abs(Math.abs(p.d4 / 10000 * 16 - k) - 0.5) < 0.05); }
          var d = p.d4 / 10000, s = d * 16, k2 = Math.round(s), v = p.w + k2 / 16;
          var dtxt = (p.w ? p.w : '') + '.' + String(p.d4).padStart(4, '0');
          var steps = [(p.w ? 'Keep the whole inches: ' + p.w + '. ' : '') + 'Take the decimal part: .' + String(p.d4).padStart(4, '0') + '.',
            'Multiply by 16: ' + key(d) + ' × 16 = ' + cd(s) + '.',
            'Round to the nearest whole number: ' + k2 + '. That is ' + k2 + '/16".'];
          if (gcd(k2, 16) > 1) steps.push('Reduce: ' + k2 + '/16 = ' + fpart(k2) + '.');
          steps.push('Answer: ' + f16(p.w * 16 + k2) + '".');
          return {
            params: p,
            q: 'A shop drawing gives ' + dtxt + '". Write it to the nearest 1/16" as a fraction, reduced.',
            answers: [A({ label: 'Nearest 1/16"', unit: 'in', value: v, kind: 'frac', tol: 0.01, require: 'fraction' })],
            steps: steps,
            keys: [K('Sixteenths', '.' + String(p.d4).padStart(4, '0') + ' × 16 =', s)]
          };
        } },
        { id: 'm114', level: 2, title: 'Feet and inches to decimal inches for a machine', gen: function (r, fx) {
          var p = fx || { ft: ri(r, 1, 9), inch: ri(r, 0, 11), k: ri(r, 1, 15) };
          var v = p.ft * 12 + p.inch + p.k / 16, txt = p.ft + "'-" + f16(p.inch * 16 + p.k) + '"';
          return {
            params: p,
            q: 'The saw screen takes lengths in decimal inches. The cut list says ' + txt + '. What do you type in?',
            answers: [A({ label: 'Decimal inches', unit: 'in', value: v, dp: 4, display: cd(v), require: 'decimal' })],
            steps: ['Change the feet to inches: ' + p.ft + ' × 12 = ' + (p.ft * 12) + '".',
              'Add the inches: ' + (p.ft * 12) + ' + ' + p.inch + ' = ' + (p.ft * 12 + p.inch) + '".',
              'Change the fraction to a decimal: ' + fracKeys(p.k) + ' = ' + cd(p.k / 16) + '.',
              'Add it on: ' + (p.ft * 12 + p.inch) + ' + ' + key(p.k / 16) + ' = ' + cd(v) + '".'],
            keys: [K('Decimal inches', p.ft + ' × 12 + ' + p.inch + ' + ' + fracKeys(p.k) + ' =', v)],
            fig: fg('bar', { label: 'A cut length of ' + txt, top: txt, bottom: '? decimal inches' })
          };
        } }
      ]
    },
    {
      id: 'circles', title: 'Circles: diameter and circumference', short: 'C = π × D in millimetres, metres, inches and feet-inches',
      why: 'Rings, flanges, pipe and tanks are round. The circumference is the length around the outside. It tells you how long a bar or plate must be before it is rolled.',
      lesson: 3,
      example: { task: 'm121', fx: { d: 265 } },
      tasks: [
        { id: 'm121', level: 1, pi: 'calc', title: 'Circumference in millimetres', gen: function (r, fx) {
          var p = fx || { d: ri(r, 30, 300) * 5 }, c = PI * p.d;
          return {
            params: p,
            q: 'A ring has a diameter of ' + p.d + ' mm. What is its circumference? Use calculator π. Round to the nearest millimetre.',
            answers: [A({ label: 'Circumference', unit: 'mm', value: c, dp: 0, tol: 0.5 })],
            steps: ['C = π × D.', 'C = π × ' + p.d + ' = ' + cd(c) + ' mm.', 'Rounded: ' + num(c, 0) + ' mm.'],
            keys: [K('Circumference', 'π × ' + p.d + ' =', c)],
            fig: fg('circle', { label: 'A ring ' + p.d + ' millimetres across', d: 'D = ' + p.d + ' mm', c: 'C = ? mm' })
          };
        } },
        { id: 'm122', level: 2, pi: 'calc', title: 'Circumference in inches', gen: function (r, fx) {
          var p = fx;
          if (!p) { do { p = { d16: ri(r, 8 * 16, 48 * 16) }; } while (p.d16 % 16 === 0); }
          var d = p.d16 / 16, c = PI * d, n16 = Math.round(c * 16);
          return {
            params: p,
            q: 'A round flange has a diameter of ' + f16(p.d16) + '". What is its circumference to the nearest 1/16"? Use calculator π.',
            answers: [A({ label: 'Circumference', unit: 'in', value: n16 / 16, kind: 'frac', tol: 0.01 })],
            steps: ['Change the diameter to a decimal: ' + f16(p.d16) + '" = ' + cd(d) + '".', 'C = π × D = π × ' + cd(d) + ' = ' + cd(c) + '".'].concat(sixteenths(c)),
            keys: [K('Circumference', fracKeys(p.d16 % 16) + ' + ' + Math.floor(d) + ' = × π =', c), K('Sixteenths', fracKeys(p.d16 % 16) + ' + ' + Math.floor(d) + ' = × π − ' + Math.floor(c) + ' = × 16 =', (c - Math.floor(c)) * 16)],
            fig: fg('circle', { label: 'A flange ' + f16(p.d16) + ' inches across', d: 'D = ' + f16(p.d16) + '"', c: 'C = ?"' })
          };
        } },
        { id: 'm123', level: 3, pi: 'calc', title: 'Circumference in feet and inches', gen: function (r, fx) {
          var p = fx;
          if (!p) { var t; do { p = { ft: ri(r, 2, 9), inch: ri(r, 0, 11), k: ri(r, 1, 15) }; t = ftinParts(PI * (p.ft * 12 + p.inch + p.k / 16)); } while (t.in16 === 0); }
          var din = p.ft * 12 + p.inch + p.k / 16, df = din / 12, cf = PI * df, cp = ftinParts(cf * 12), txt = p.ft + "'-" + f16(p.inch * 16 + p.k) + '"';
          var ins = p.inch + p.k / 16;
          return {
            params: p,
            q: 'A tank has a diameter of ' + txt + '. Find the circumference in feet and inches to the nearest 1/16". Use calculator π. Change to decimal feet first.',
            answers: [A({ label: 'Feet', unit: 'ft', value: cp.ft, kind: 'int' }), A({ label: 'Inches', unit: 'in', value: cp.in16 / 16, kind: 'frac', tol: 0.01 })],
            steps: ['Change to decimal feet: ' + fracKeys(p.k) + ' + ' + p.inch + ' = ' + cd(ins) + '", and ' + cd(ins) + ' ÷ 12 + ' + p.ft + ' = ' + cd(df) + "'.",
              'C = π × D = π × ' + cd(df) + ' = ' + cd(cf) + "'."].concat(dfSteps(cf)).concat(['Answer: ' + ftin(cp.n16) + '.']),
            keys: [K('Circumference in decimal feet', fracKeys(p.k) + ' + ' + p.inch + ' = ÷ 12 + ' + p.ft + ' = × π =', cf)],
            fig: fg('circle', { label: 'A tank ' + txt + ' across', d: 'D = ' + txt, c: "C = ?' - ?\"" })
          };
        } },
        { id: 'm124', level: 1, pi: 'calc', title: 'From the radius, in metres', gen: function (r, fx) {
          var p = fx || { r3: ri(r, 400, 3500) }, rad = p.r3 / 1000, d = 2 * rad, c = PI * d;
          return {
            params: p,
            q: 'A round platform has a radius of ' + cd(rad) + ' m. Find the diameter, then the circumference. Use calculator π. Round to 3 decimal places.',
            answers: [A({ label: 'Diameter', unit: 'm', value: d, dp: 3 }), A({ label: 'Circumference', unit: 'm', value: c, dp: 3 })],
            steps: ['D = 2 × r = 2 × ' + cd(rad) + ' = ' + cd(d) + ' m.', 'C = π × D = π × ' + cd(d) + ' = ' + cd(c) + ' m.', 'Rounded: ' + num(c, 3) + ' m.'],
            keys: [K('Diameter', '2 × ' + key(rad) + ' =', d), K('Circumference', '2 × ' + key(rad) + ' × π =', c)],
            fig: fg('circle', { label: 'A circle with radius ' + cd(rad) + ' metres', d: 'D = ? m', r: 'r = ' + cd(rad) + ' m', c: 'C = ? m' })
          };
        } }
      ]
    },
    {
      id: 'rolled', title: 'Mean diameter and stretch-out', short: 'MD = ID + T or OD − T, SO = π × MD, metric and imperial',
      why: 'When plate is rolled, the outside stretches and the inside squeezes. The middle of the plate keeps its length. That middle circle is the mean diameter (MD). Cut the plate to π × MD.',
      lesson: 4,
      example: { task: 'm133', fx: { ID: 245, PL: 10 } },
      tasks: [
        { id: 'm131', level: 1, title: 'Mean diameter from the inside', gen: function (r, fx) {
          var p = fx || { ID: ri(r, 20, 160) * 5, PL: pick(r, [6, 8, 10, 12, 16, 20, 25]) };
          return {
            params: p,
            q: 'A shell has an inside diameter (ID) of ' + p.ID + ' mm. It is rolled from ' + p.PL + ' mm plate. What is the mean diameter (MD)?',
            answers: [A({ label: 'MD', unit: 'mm', value: p.ID + p.PL, kind: 'int' })],
            steps: ['From the inside, add one plate thickness: MD = ID + T.', 'MD = ' + p.ID + ' + ' + p.PL + ' = ' + (p.ID + p.PL) + ' mm.'],
            keys: [K('MD', p.ID + ' + ' + p.PL + ' =', p.ID + p.PL)],
            fig: fg('shell', { label: 'A rolled shell, inside diameter ' + p.ID + ' millimetres', od: '', id: 'ID ' + p.ID, t: 'T ' + p.PL, so: '', md: 'MD = ? mm' })
          };
        } },
        { id: 'm132', level: 1, title: 'Mean diameter from the outside', gen: function (r, fx) {
          var p = fx;
          if (!p) p = { OD16: ri(r, 12, 60) * 16 + ri(r, 0, 7) * 2, T16: pick(r, [3, 4, 5, 6, 8, 10, 12]) };
          var md16 = p.OD16 - p.T16;
          return {
            params: p,
            q: 'A shell has an outside diameter (OD) of ' + f16(p.OD16) + '". The plate is ' + f16(p.T16) + '" thick. What is the mean diameter (MD)?',
            answers: [A({ label: 'MD', unit: 'in', value: md16 / 16, kind: 'frac', tol: 0.01 })],
            steps: ['From the outside, take off one plate thickness: MD = OD − T.', 'Work in sixteenths: ' + f16(p.OD16) + '" = ' + p.OD16 + '/16 and ' + f16(p.T16) + '" = ' + p.T16 + '/16.',
              p.OD16 + ' − ' + p.T16 + ' = ' + md16 + '/16 = ' + f16(md16) + '".'],
            keys: [K('MD', (p.OD16 % 16 ? Math.floor(p.OD16 / 16) + ' ab/c ' + (p.OD16 % 16 / gcd(p.OD16 % 16, 16)) + ' ab/c ' + (16 / gcd(p.OD16 % 16, 16)) : String(p.OD16 / 16)) + ' − ' + (p.T16 / gcd(p.T16, 16)) + ' ab/c ' + (16 / gcd(p.T16, 16)) + ' =', md16 / 16)],
            fig: fg('shell', { label: 'A rolled shell, outside diameter ' + f16(p.OD16) + ' inches', od: 'OD ' + f16(p.OD16) + '"', id: '', t: 'T ' + f16(p.T16) + '"', so: '', md: 'MD = ?"' })
          };
        } },
        { id: 'm133', level: 2, pi: 'calc', title: 'Stretch-out in millimetres', gen: function (r, fx) {
          var p = fx || { ID: ri(r, 20, 240) * 5, PL: pick(r, [6, 8, 10, 12, 16, 20]) };
          var md = p.ID + p.PL, so = PI * md;
          return {
            params: p,
            q: 'A ring is rolled from ' + p.PL + ' mm plate (PL). Its inside diameter (ID) is ' + p.ID + ' mm. Find the mean diameter, then the stretch-out (SO). Use calculator π. Round SO to the nearest millimetre.',
            answers: [A({ label: 'MD', unit: 'mm', value: md, kind: 'int' }), A({ label: 'SO', unit: 'mm', value: so, dp: 0, tol: 0.5 })],
            steps: ['MD = ID + PL = ' + p.ID + ' + ' + p.PL + ' = ' + md + ' mm.', 'SO = π × MD = π × ' + md + ' = ' + cd(so) + ' mm.', 'Rounded: ' + num(so, 0) + ' mm.'],
            keys: [K('Stretch-out', p.ID + ' + ' + p.PL + ' = × π =', so)],
            fig: fg('shell', { label: 'A ring with inside diameter ' + p.ID + ' and plate ' + p.PL + ' millimetres', od: '', id: 'ID ' + p.ID, t: 'PL ' + p.PL, so: 'SO = ? mm', md: 'MD = ID + PL' })
          };
        } },
        { id: 'm134', level: 3, pi: 'calc', title: 'Stretch-out in feet and inches', gen: function (r, fx) {
          var p = fx;
          if (!p) { var t; do { p = { OD16: ri(r, 24, 96) * 16 + ri(r, 0, 3) * 4, T16: pick(r, [4, 6, 8, 10, 12, 16]) }; t = ftinParts(PI * (p.OD16 - p.T16) / 16); } while (t.in16 === 0); }
          var md = (p.OD16 - p.T16) / 16, so = PI * md, sp = ftinParts(so);
          return {
            params: p,
            q: 'A tank shell has an outside diameter of ' + f16(p.OD16) + '" and is rolled from ' + f16(p.T16) + '" plate. Find the mean diameter, then the stretch-out in feet and inches to the nearest 1/16". Use calculator π.',
            answers: [A({ label: 'MD', unit: 'in', value: md, kind: 'frac', tol: 0.01 }), A({ label: 'SO feet', unit: 'ft', value: sp.ft, kind: 'int' }), A({ label: 'SO inches', unit: 'in', value: sp.in16 / 16, kind: 'frac', tol: 0.01 })],
            steps: ['MD = OD − T = ' + f16(p.OD16) + ' − ' + f16(p.T16) + ' = ' + f16(p.OD16 - p.T16) + '" = ' + cd(md) + '".',
              'SO = π × MD = π × ' + cd(md) + ' = ' + cd(so) + '".',
              'Change to feet: ' + cd(so) + ' ÷ 12 = ' + cd(so / 12) + "'."].concat(dfSteps(so / 12)).concat(['Answer: ' + ftin(sp.n16) + '.']),
            keys: [K('Stretch-out in inches', key((p.OD16 - p.T16) / 16) + ' × π =', so), K('In decimal feet', key((p.OD16 - p.T16) / 16) + ' × π ÷ 12 =', so / 12)],
            fig: fg('shell', { label: 'A tank shell, outside diameter ' + f16(p.OD16) + ' inches', od: 'OD ' + f16(p.OD16) + '"', id: '', t: 'T ' + f16(p.T16) + '"', so: "SO = ?' - ?\"", md: 'MD = OD − T' })
          };
        } }
      ]
    },
    {
      id: 'mass', title: 'Area and plate mass by the shop rule', short: 'Circle and plate areas, 40.8 lb per sq ft per inch, 7.85 kg per sq m per mm',
      why: 'Mass tells you how to lift a part safely, which sling and crane to use, and what the steel costs. The shop rule makes it quick: mild steel plate 1" thick weighs 40.8 lb per square foot, and plate 1 mm thick weighs 7.85 kg per square metre.',
      lesson: 6,
      example: { task: 'm143', fx: { L: 2440, Wd: 1220, T: 10 } },
      tasks: [
        { id: 'm141', level: 1, pi: 'calc', title: 'Circle area in square inches', gen: function (r, fx) {
          var p = fx || { r16: ri(r, 3 * 16, 30 * 16) }, rad = p.r16 / 16, a = PI * rad * rad;
          return {
            params: p,
            q: 'A round cover plate has a radius of ' + f16(p.r16) + '". What is its area in square inches? Use calculator π. Round to 2 decimal places.',
            answers: [A({ label: 'Area', unit: 'sq in', value: a, dp: 2 })],
            steps: ['A = π × r².', 'r = ' + f16(p.r16) + '" = ' + cd(rad) + '".', 'r² = ' + cd(rad) + ' × ' + cd(rad) + ' = ' + cd(rad * rad) + '.', 'A = π × ' + cd(rad * rad) + ' = ' + cd(a) + ' sq in.', 'Rounded: ' + num(a, 2) + ' sq in.'],
            keys: [K('Area', key(rad) + ' x² × π =', a)],
            fig: fg('circle', { label: 'A round plate with radius ' + f16(p.r16) + ' inches', d: '', r: 'r = ' + f16(p.r16) + '"', c: 'A = ? sq in', note: 'A = π × r²' })
          };
        } },
        { id: 'm142', level: 2, pi: 'calc', title: 'Circle area in square feet', gen: function (r, fx) {
          var p = fx || { ft: ri(r, 1, 6), inch: ri(r, 0, 11), k: ri(r, 1, 15) };
          var ins = p.inch + p.k / 16, rf = p.ft + ins / 12, a = PI * rf * rf, txt = p.ft + "'-" + f16(p.inch * 16 + p.k) + '"';
          return {
            params: p,
            q: 'A round tank floor has a radius of ' + txt + '. What is its area in square feet? Change to decimal feet first. Use calculator π. Round to 2 decimal places.',
            answers: [A({ label: 'Area', unit: 'sq ft', value: a, dp: 2, rel: 0.0005 })],
            steps: ['Decimal feet: ' + fracKeys(p.k) + ' + ' + p.inch + ' = ' + cd(ins) + '", ' + cd(ins) + ' ÷ 12 + ' + p.ft + ' = ' + cd(rf) + "'.",
              'A = π × r² = π × ' + cd(rf) + '² = ' + cd(a) + ' sq ft.', 'Rounded: ' + num(a, 2) + ' sq ft.'],
            keys: [K('Radius in decimal feet', fracKeys(p.k) + ' + ' + p.inch + ' = ÷ 12 + ' + p.ft + ' =', rf), K('Area', fracKeys(p.k) + ' + ' + p.inch + ' = ÷ 12 + ' + p.ft + ' = x² × π =', a)],
            fig: fg('circle', { label: 'A round floor with radius ' + txt, d: '', r: 'r = ' + txt, c: 'A = ? sq ft', note: 'A = π × r²' })
          };
        } },
        { id: 'm143', level: 1, title: 'Plate mass in kilograms', gen: function (r, fx) {
          var p = fx || { L: ri(r, 6, 60) * 50, Wd: ri(r, 4, 30) * 50, T: pick(r, [3, 5, 6, 8, 10, 12, 16, 20, 25]) };
          var Lm = p.L / 1000, Wm = p.Wd / 1000, m = Lm * Wm * p.T * 7.85;
          return {
            params: p,
            q: 'A mild steel plate is ' + num(p.L, 0) + ' mm × ' + num(p.Wd, 0) + ' mm × ' + p.T + ' mm thick. Mild steel weighs 7.85 kg per square metre for each millimetre of thickness. What is its mass? Round to 2 decimal places.',
            answers: [A({ label: 'Mass', unit: 'kg', value: m, dp: 2 })],
            steps: ['Change the length and width to metres (÷ 1,000): ' + num(p.L, 0) + ' mm = ' + cd(Lm) + ' m, ' + num(p.Wd, 0) + ' mm = ' + cd(Wm) + ' m.',
              'Keep the thickness in millimetres: ' + p.T + ' mm.',
              'Mass = L × W × T × 7.85 = ' + cd(Lm) + ' × ' + cd(Wm) + ' × ' + p.T + ' × 7.85 = ' + cd(m) + ' kg.', 'Rounded: ' + num(m, 2) + ' kg.'],
            keys: [K('Mass', key(Lm) + ' × ' + key(Wm) + ' × ' + p.T + ' × 7.85 =', m)],
            fig: fg('plate', { label: 'A steel plate ' + p.L + ' by ' + p.Wd + ' by ' + p.T + ' millimetres', L: num(p.L, 0) + ' mm', W: num(p.Wd, 0) + ' mm', T: p.T + ' mm', rule: '7.85 kg per sq m per mm', m: 'm = ? kg' })
          };
        } },
        { id: 'm144', level: 2, title: 'Plate weight in pounds, sizes in inches', gen: function (r, fx) {
          var p = fx || { L: ri(r, 12, 96), Wd: ri(r, 6, 48), T16: pick(r, [3, 4, 5, 6, 8, 10, 12, 16]) };
          var T = p.T16 / 16, wt = p.L * p.Wd * 40.8 * T / 144;
          return {
            params: p,
            q: 'A mild steel plate is ' + p.L + '" × ' + p.Wd + '" × ' + f16(p.T16) + '". Plate 1" thick weighs 40.8 lb per square foot. What does it weigh? Round to 2 decimal places.',
            answers: [A({ label: 'Weight', unit: 'lb', value: wt, dp: 2 })],
            steps: ['Area in square inches: ' + p.L + ' × ' + p.Wd + ' = ' + (p.L * p.Wd) + ' sq in.', 'Divide by 144 to get square feet: ' + (p.L * p.Wd) + ' ÷ 144 = ' + cd(p.L * p.Wd / 144) + ' sq ft.',
              'Thickness as a decimal: ' + f16(p.T16) + '" = ' + cd(T) + '".',
              'Weight = sq ft × 40.8 × T = ' + cd(p.L * p.Wd / 144) + ' × 40.8 × ' + cd(T) + ' = ' + cd(wt) + ' lb.', 'Rounded: ' + num(wt, 2) + ' lb.'],
            keys: [K('Weight', p.L + ' × ' + p.Wd + ' × 40.8 × ' + key(T) + ' ÷ 144 =', wt)],
            fig: fg('plate', { label: 'A steel plate ' + p.L + ' by ' + p.Wd + ' inches, ' + f16(p.T16) + ' inch thick', L: p.L + '"', W: p.Wd + '"', T: f16(p.T16) + '"', rule: '40.8 lb per sq ft per inch thick', m: 'Weight = ? lb' })
          };
        } },
        { id: 'm145', level: 3, pi: 'calc', title: 'Round plate mass in kilograms', gen: function (r, fx) {
          var p = fx || { D: ri(r, 10, 120) * 10, T: pick(r, [6, 8, 10, 12, 16, 20, 25]) };
          var rm = p.D / 2 / 1000, a = PI * rm * rm, m = a * p.T * 7.85;
          return {
            params: p,
            q: 'A round end plate is ' + num(p.D, 0) + ' mm across and ' + p.T + ' mm thick. Mild steel weighs 7.85 kg per square metre per millimetre. What is its mass? Use calculator π. Round to 2 decimal places.',
            answers: [A({ label: 'Mass', unit: 'kg', value: m, dp: 2, rel: 0.0005 })],
            steps: ['Radius = D ÷ 2 = ' + num(p.D, 0) + ' ÷ 2 = ' + cd(p.D / 2) + ' mm = ' + cd(rm) + ' m.', 'Area = π × r² = π × ' + cd(rm) + '² = ' + cd(a) + ' sq m.',
              'Mass = area × T × 7.85 = ' + cd(a) + ' × ' + p.T + ' × 7.85 = ' + cd(m) + ' kg.', 'Rounded: ' + num(m, 2) + ' kg.'],
            keys: [K('Mass', key(rm) + ' x² × π × ' + p.T + ' × 7.85 =', m)],
            fig: fg('disc', { label: 'A round plate ' + p.D + ' millimetres across, ' + p.T + ' millimetres thick', d: 'D = ' + num(p.D, 0) + ' mm', T: 'T = ' + p.T + ' mm', rule: '7.85 kg per sq m per mm', m: 'm = ? kg' })
          };
        } },
        { id: 'm146', level: 3, title: 'Plate weight in pounds, sizes in feet and inches', gen: function (r, fx) {
          var p = fx || { lf: ri(r, 3, 12), li: ri(r, 0, 11), lk: pick(r, [0, 4, 8, 12, 2, 6, 10, 14]), wf: ri(r, 1, 5), wi: ri(r, 0, 11), wk: pick(r, [0, 8, 4, 12]), T16: pick(r, [4, 6, 8, 12, 16]) };
          var L = p.lf + (p.li + p.lk / 16) / 12, Wd = p.wf + (p.wi + p.wk / 16) / 12, T = p.T16 / 16, wt = L * Wd * 40.8 * T;
          var lt = p.lf + "'-" + f16(p.li * 16 + p.lk) + '"', wtx = p.wf + "'-" + f16(p.wi * 16 + p.wk) + '"';
          return {
            params: p,
            q: 'A plate is ' + lt + ' × ' + wtx + ' × ' + f16(p.T16) + '" thick. Plate 1" thick weighs 40.8 lb per square foot. Work in decimal feet. What does it weigh? Round to 2 decimal places.',
            answers: [A({ label: 'Weight', unit: 'lb', value: wt, dp: 2, rel: 0.0005 })],
            steps: ['Length in decimal feet: ' + lt + ' = ' + cd(L) + "'.", 'Width in decimal feet: ' + wtx + ' = ' + cd(Wd) + "'.", 'Thickness: ' + f16(p.T16) + '" = ' + cd(T) + '".',
              "Weight = L' × W' × 40.8 × T\" = " + cd(L) + ' × ' + cd(Wd) + ' × 40.8 × ' + cd(T) + ' = ' + cd(wt) + ' lb.', 'Rounded: ' + num(wt, 2) + ' lb.'],
            keys: [K('Length in decimal feet', (p.lk ? fracKeys(p.lk) + ' + ' + p.li + ' =' : p.li) + ' ÷ 12 + ' + p.lf + ' =', L), K('Width in decimal feet', (p.wk ? fracKeys(p.wk) + ' + ' + p.wi + ' =' : p.wi) + ' ÷ 12 + ' + p.wf + ' =', Wd),
              K('Weight', key(L) + ' × ' + key(Wd) + ' × 40.8 × ' + key(T) + ' =', wt)],
            fig: fg('plate', { label: 'A plate ' + lt + ' by ' + wtx, L: lt, W: wtx, T: f16(p.T16) + '"', rule: '40.8 lb per sq ft per inch thick', m: 'Weight = ? lb' })
          };
        } }
      ]
    },
    {
      id: 'capacity', title: 'Tank volume and capacity', short: 'Cubic feet × 6.25 gallons, cubic metres × 1,000 litres, box and round tanks',
      why: 'Volume is the space inside a tank. Capacity is how much liquid fits in that space. Find the inside volume first, then change it to gallons or litres.',
      lesson: 9,
      example: { task: 'm151', fx: { L: 8, Wd: 4, H: 3.5 } },
      tasks: [
        { id: 'm151', level: 1, title: 'Box tank in feet', gen: function (r, fx) {
          var p = fx || { L: ri(r, 3, 14), Wd: ri(r, 2, 8), H: ri(r, 4, 16) / 2 };
          var v = p.L * p.Wd * p.H, g = v * 6.25;
          return {
            params: p,
            q: 'A box tank measures ' + p.L + "' long × " + p.Wd + "' wide × " + cd(p.H) + "' deep, inside. Use the course factor: 1 cubic foot holds 6.25 gallons. Find the volume and the capacity.",
            answers: [A({ label: 'Volume', unit: 'cu ft', value: v, dp: 2 }), A({ label: 'Capacity', unit: 'gal', value: g, dp: 2 })],
            steps: ['Volume = L × W × H = ' + p.L + ' × ' + p.Wd + ' × ' + cd(p.H) + ' = ' + cd(v) + ' cu ft.', 'Capacity = volume × 6.25 = ' + cd(v) + ' × 6.25 = ' + cd(g) + ' gallons.'],
            keys: [K('Volume', p.L + ' × ' + p.Wd + ' × ' + key(p.H) + ' =', v), K('Capacity', p.L + ' × ' + p.Wd + ' × ' + key(p.H) + ' × 6.25 =', g)],
            fig: fg('box', { label: 'A box tank ' + p.L + ' by ' + p.Wd + ' by ' + cd(p.H) + ' feet', L: p.L + "'", W: p.Wd + "'", H: cd(p.H) + "'", v: 'V = ? cu ft', c: '? gallons' })
          };
        } },
        { id: 'm152', level: 2, title: 'Box tank in inches', gen: function (r, fx) {
          var p = fx || { L: ri(r, 24, 96), Wd: ri(r, 18, 48), H: ri(r, 12, 48) };
          var vi = p.L * p.Wd * p.H, vf = vi / 1728, g = vf * 6.25;
          return {
            params: p,
            q: 'A box tank is ' + p.L + '" × ' + p.Wd + '" × ' + p.H + '" inside. 1 cubic foot is 1,728 cubic inches and holds 6.25 gallons (course factor). Find the volume in cubic feet and the capacity. Round both to 2 decimal places.',
            answers: [A({ label: 'Volume', unit: 'cu ft', value: vf, dp: 2 }), A({ label: 'Capacity', unit: 'gal', value: g, dp: 2, rel: 0.0005 })],
            steps: ['Volume in cubic inches = ' + p.L + ' × ' + p.Wd + ' × ' + p.H + ' = ' + num(vi, 0) + ' cu in.', 'Change to cubic feet: ' + num(vi, 0) + ' ÷ 1,728 = ' + cd(vf) + ' cu ft.', 'Capacity = ' + cd(vf) + ' × 6.25 = ' + cd(g) + ' gallons.'],
            keys: [K('Volume in cubic feet', p.L + ' × ' + p.Wd + ' × ' + p.H + ' ÷ 1728 =', vf), K('Capacity', p.L + ' × ' + p.Wd + ' × ' + p.H + ' ÷ 1728 × 6.25 =', g)],
            fig: fg('box', { label: 'A box tank ' + p.L + ' by ' + p.Wd + ' by ' + p.H + ' inches', L: p.L + '"', W: p.Wd + '"', H: p.H + '"', v: 'V = ? cu ft', c: '? gallons' })
          };
        } },
        { id: 'm153', level: 1, title: 'Box tank in metres and litres', gen: function (r, fx) {
          var p = fx || { L: ri(r, 6, 40) * 50, Wd: ri(r, 4, 24) * 50, H: ri(r, 4, 24) * 50 };
          var v = (p.L / 1000) * (p.Wd / 1000) * (p.H / 1000), l = v * 1000;
          return {
            params: p,
            q: 'A box tank is ' + num(p.L, 0) + ' mm × ' + num(p.Wd, 0) + ' mm × ' + num(p.H, 0) + ' mm inside. 1 cubic metre holds 1,000 litres. Find the volume in cubic metres (3 decimal places) and the capacity in litres (nearest litre).',
            answers: [A({ label: 'Volume', unit: 'cu m', value: v, dp: 3 }), A({ label: 'Capacity', unit: 'L', value: l, dp: 0, tol: 0.5 })],
            steps: ['Change to metres: ' + cd(p.L / 1000) + ' m × ' + cd(p.Wd / 1000) + ' m × ' + cd(p.H / 1000) + ' m.', 'Volume = ' + cd(p.L / 1000) + ' × ' + cd(p.Wd / 1000) + ' × ' + cd(p.H / 1000) + ' = ' + cd(v) + ' cu m.', 'Capacity = ' + cd(v) + ' × 1,000 = ' + cd(l) + ' L.'],
            keys: [K('Volume', key(p.L / 1000) + ' × ' + key(p.Wd / 1000) + ' × ' + key(p.H / 1000) + ' =', v), K('Litres', key(p.L / 1000) + ' × ' + key(p.Wd / 1000) + ' × ' + key(p.H / 1000) + ' × 1000 =', l)],
            fig: fg('box', { label: 'A box tank in millimetres', L: num(p.L, 0) + ' mm', W: num(p.Wd, 0) + ' mm', H: num(p.H, 0) + ' mm', v: 'V = ? cu m', c: '? litres' })
          };
        } },
        { id: 'm154', level: 3, pi: 'calc', title: 'Round tank capacity', gen: function (r, fx) {
          var p = fx || { ID: ri(r, 12, 48) * 2, Li: ri(r, 24, 120) };
          var rad = p.ID / 2, vi = PI * rad * rad * p.Li, vf = vi / 1728, g = vf * 6.25;
          return {
            params: p,
            q: 'A round tank has an inside diameter of ' + p.ID + '" and an inside length of ' + p.Li + '". Find the volume in cubic feet and the capacity in gallons (6.25 gallons per cubic foot, the course factor). Use calculator π. Round to 2 decimal places.',
            answers: [A({ label: 'Volume', unit: 'cu ft', value: vf, dp: 2, rel: 0.0005 }), A({ label: 'Capacity', unit: 'gal', value: g, dp: 2, rel: 0.0005 })],
            steps: ['Radius = ' + p.ID + ' ÷ 2 = ' + cd(rad) + '".', 'Volume = π × r² × L = π × ' + cd(rad) + '² × ' + p.Li + ' = ' + cd(vi) + ' cu in.', 'Cubic feet: ' + cd(vi) + ' ÷ 1,728 = ' + cd(vf) + ' cu ft.', 'Gallons: ' + cd(vf) + ' × 6.25 = ' + cd(g) + '.'],
            keys: [K('Volume in cubic feet', cd(rad) + ' x² × π × ' + p.Li + ' ÷ 1728 =', vf), K('Capacity', cd(rad) + ' x² × π × ' + p.Li + ' ÷ 1728 × 6.25 =', g)],
            fig: fg('tank', { label: 'A round tank ' + p.ID + ' inches across, ' + p.Li + ' inches long inside', L: 'Inside length ' + p.Li + '"', D: 'ID ' + p.ID + '"', c: 'V = ? cu ft, ? gallons' })
          };
        } }
      ]
    },
    {
      id: 'pld', title: 'Parallel line development', short: 'Pattern stretch-out in 12 spaces, element lines for a pipe cut at an angle and a tee branch',
      why: 'A pattern is the flat shape you wrap around a pipe and mark. Parallel line development finds it with 12 element lines. The math gives each line its exact length, so you can check a drawn pattern or lay one out with a tape.',
      lesson: 10,
      example: { task: 'm162', fx: { D: 168, L: 200, t: 22.5 } },
      tasks: [
        { id: 'm161', level: 1, pi: 'calc', title: 'Pattern length and the 12 spaces', gen: function (r, fx) {
          var p = fx || { D: pick(r, [60, 89, 114, 141, 168, 219, 273, 324, 356, 406]) }, so = PI * p.D, sp = so / 12;
          return {
            params: p,
            q: 'A pipe pattern is laid out for a pipe ' + p.D + ' mm in diameter. Find the stretch-out (π × D) and the width of each of the 12 equal spaces. Use calculator π. Round to 1 decimal place.',
            answers: [A({ label: 'Stretch-out', unit: 'mm', value: so, dp: 1 }), A({ label: 'One space', unit: 'mm', value: sp, dp: 1 })],
            steps: ['Stretch-out = π × D = π × ' + p.D + ' = ' + cd(so) + ' mm.', 'Divide by 12: ' + cd(so) + ' ÷ 12 = ' + cd(sp) + ' mm.', 'Rounded: ' + num(so, 1) + ' mm and ' + num(sp, 1) + ' mm.'],
            keys: [K('Stretch-out', 'π × ' + p.D + ' =', so), K('One space', 'π × ' + p.D + ' ÷ 12 =', sp)],
            fig: fg('spaces', { label: 'A pattern divided into 12 spaces', so: 'π × D = ? mm', sp: '?', d: 'D = ' + p.D + ' mm' })
          };
        } },
        { id: 'm162', level: 2, title: 'Pipe cut at an angle: shortest and longest lines', gen: function (r, fx) {
          var p = fx || { D: pick(r, [114, 141, 168, 219, 273, 324]), L: ri(r, 15, 50) * 10, t: pick(r, [11.25, 15, 22.5, 30, 45]) };
          var rad = p.D / 2, k = rad * Math.tan(p.t * D2R), a = p.L - k, b = p.L + k;
          return {
            params: p,
            q: 'A pipe ' + p.D + ' mm in diameter is cut ' + cd(p.t) + '° off square. Its length on the centre line is ' + p.L + ' mm. Find the shortest element line (a) and the longest (b), to the nearest millimetre.',
            answers: [A({ label: 'Shortest, a', unit: 'mm', value: a, dp: 0, tol: 0.5 }), A({ label: 'Longest, b', unit: 'mm', value: b, dp: 0, tol: 0.5 })],
            steps: ['Radius r = D ÷ 2 = ' + p.D + ' ÷ 2 = ' + cd(rad) + ' mm.', 'The cut rises r × tan θ each side of the centre line: ' + cd(rad) + ' × tan ' + cd(p.t) + '° = ' + cd(k) + ' mm.',
              'a = L − ' + cd(k) + ' = ' + p.L + ' − ' + cd(k) + ' = ' + cd(a) + ' mm.', 'b = L + ' + cd(k) + ' = ' + p.L + ' + ' + cd(k) + ' = ' + cd(b) + ' mm.', 'Rounded: a = ' + num(a, 0) + ' mm, b = ' + num(b, 0) + ' mm.'],
            keys: [K('Rise of the cut', cd(rad) + ' × ' + cd(p.t) + ' tan =', k), K('Shortest, a', p.L + ' − ' + cd(rad) + ' × ' + cd(p.t) + ' tan =', a), K('Longest, b', p.L + ' + ' + cd(rad) + ' × ' + cd(p.t) + ' tan =', b)],
            fig: fg('mitre', { label: 'A pipe cut at an angle', d: 'D = ' + p.D + ' mm', L: 'L = ' + p.L, t: cd(p.t), a: 'a = ?', b: 'b = ?' })
          };
        } },
        { id: 'm163', level: 3, title: 'Pipe cut at an angle: one element line', gen: function (r, fx) {
          var p = fx || { D: pick(r, [114, 141, 168, 219, 273, 324]), L: ri(r, 15, 50) * 10, t: pick(r, [15, 22.5, 30, 45]), n: ri(r, 2, 6) };
          var rad = p.D / 2, k = rad * Math.tan(p.t * D2R), ang = (p.n - 1) * 30, c = Math.cos(ang * D2R), e = p.L - k * c;
          return {
            params: p,
            q: 'A pipe ' + p.D + ' mm in diameter is cut ' + cd(p.t) + '° off square, ' + p.L + ' mm long on the centre line. The half circle is divided into 6 spaces of 30°, and point 1 is the shortest line. How long is element line ' + p.n + '? Round to the nearest millimetre.',
            answers: [A({ label: 'Element line ' + p.n, unit: 'mm', value: e, dp: 0, tol: 0.5 })],
            steps: ['Point ' + p.n + ' is ' + (p.n - 1) + ' × 30° = ' + ang + '° around from point 1.', 'Rise of the cut: r × tan θ = ' + cd(rad) + ' × tan ' + cd(p.t) + '° = ' + cd(k) + ' mm.',
              'Each line = L − rise × cos(angle). cos ' + ang + '° = ' + cd(c) + '.', 'Line ' + p.n + ' = ' + p.L + ' − ' + cd(k) + ' × ' + cd(c) + ' = ' + cd(e) + ' mm.', 'Rounded: ' + num(e, 0) + ' mm.'],
            keys: [K('Element line ' + p.n, p.L + ' − ' + cd(rad) + ' × ' + cd(p.t) + ' tan × ' + ang + ' cos =', e)],
            fig: fg('mitre', { label: 'A pipe cut at an angle with 7 element lines', d: 'D = ' + p.D + ' mm', L: 'L = ' + p.L, t: cd(p.t), a: 'line 1', b: 'line 7', e: 'Line ' + p.n + ' = ? mm' })
          };
        } },
        { id: 'm164', level: 3, title: '90° tee branch: one element line', gen: function (r, fx) {
          var p = fx;
          if (!p) { var m = pick(r, [219, 273, 324, 406]); p = { Dm: m, Db: pick(r, [114, 141, 168, 219].filter(function (x) { return x <= m; })), H: ri(r, 25, 45) * 10, phi: pick(r, [30, 60, 90]) }; }
          var R = p.Dm / 2, rb = p.Db / 2, s = Math.sin(p.phi * D2R), y = rb * s, z = Math.sqrt(R * R - y * y), e = p.H - z;
          return {
            params: p,
            q: 'A ' + p.Db + ' mm branch sits square on a ' + p.Dm + ' mm main, on the centre line. The branch end is ' + p.H + ' mm above the centre of the main. Point ' + (p.phi / 30 + 1) + ' on the branch is ' + p.phi + '° around from the front (point 1). How long is that element line, from the branch end down to the main? Round to the nearest millimetre.',
            answers: [A({ label: 'Element line', unit: 'mm', value: e, dp: 0, tol: 0.5 })],
            steps: ['Main radius R = ' + p.Dm + ' ÷ 2 = ' + cd(R) + ' mm. Branch radius r = ' + p.Db + ' ÷ 2 = ' + cd(rb) + ' mm.',
              'How far the point sits out to the side: r × sin ' + p.phi + '° = ' + cd(rb) + ' × ' + cd(s) + ' = ' + cd(y) + ' mm.',
              'Height of the main at that point (Pythagoras): √(R² − ' + cd(y) + '²) = √(' + cd(R) + '² − ' + cd(y) + '²) = ' + cd(z) + ' mm.',
              'Element line = H − ' + cd(z) + ' = ' + p.H + ' − ' + cd(z) + ' = ' + cd(e) + ' mm.', 'Rounded: ' + num(e, 0) + ' mm.'],
            keys: [K('Side offset', cd(rb) + ' × ' + p.phi + ' sin =', y), K('Element line', p.H + ' − ( ' + cd(R) + ' x² − ( ' + cd(rb) + ' × ' + p.phi + ' sin ) x² ) √x =', e)],
            fig: fg('tee', { label: 'A branch on a main pipe, end view', rr: rb / R, H: 'H = ' + p.H, R: 'Main ' + p.Dm + ' mm', r: 'Branch ' + p.Db + ' mm', e: 'Line at ' + p.phi + '° = ? mm' })
          };
        } }
      ]
    }
  ];
  /* rounding a decimal-inch answer to sixteenths, as steps */
  function sixteenths(x) {
    var w = Math.floor(x), s = (x - w) * 16, k = Math.round(s), out = ['Keep the whole inches: ' + w + '".', 'Multiply the decimal part by 16: ' + key(x - w) + ' × 16 = ' + cd(s) + '. Round to ' + k + '.'];
    if (k === 16) out.push('16/16 is 1 more inch: ' + (w + 1) + '".');
    else if (k && gcd(k, 16) > 1) out.push(k + '/16 = ' + fpart(k) + '.');
    out.push('Answer: ' + f16(Math.round(x * 16)) + '".');
    return out;
  }

  var BY_ID = {};
  MODULES.forEach(function (m) { m.tasks.forEach(function (t) { t.module = m.id; BY_ID[t.id] = t; }); });
  return { MODULES: MODULES, BY_ID: BY_ID, makeRng: makeRng, checkOne: checkOne, draw: draw };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MF140;
