/* Metal Fabricator Foundation, Intake 140: shop math modules for the Fabrication tab and the Exam builder. MF140
   Lessons: decimals of a foot, circles, mean diameter and stretch-out, area and plate mass by the shop rule,
   tank volume and capacity, parallel line development, and the Metal Fab package sheets (Module 17). Same task shape as the FAB engine: gen(r, fx) gives
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
  function ci(x, y, r, c, fill) { return '<circle class="' + c + '" cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r) + '"' + (fill === false ? ' fill="none"' : '') + '/>'; }
  function pa(d, c, fill) { return '<path class="' + c + '" d="' + d + '"' + (fill === false ? ' fill="none"' : '') + '/>'; }
  function dimH(x1, x2, y, lab, below) { return ln(x1, y, x2, y, isQ(lab) ? 'dk' : 'd') + tx((x1 + x2) / 2, below ? y + 19 : y - 8, lab, { a: 'middle' }); }

  var FIG = {
    /* a half truss: heel at the left, peak over the right end of the run, one web */
    truss: function (f) {
      var x0 = 70, x1 = 440, y0 = 180, y1 = 60, xw = x0 + (x1 - x0) * f.wx, yw = y0 - (y0 - y1) * f.wx;
      var at = { F: [(x0 + xw) / 2, y0 + 20], G: [xw + 8, (y0 + yw) / 2], C: [(x0 + x1) / 2 - 30, (y0 + y1) / 2 - 22], I: [(x0 + xw) / 2 - 14, (y0 + yw) / 2 - 12], H: [(xw + x1) / 2 - 14, (yw + y1) / 2 - 12], D: [x1 - 60, y1 + 10] };
      var h = pa('M' + x0 + ',' + y0 + ' L' + x1 + ',' + y0 + ' L' + x1 + ',' + y1 + ' Z', 'o', false) + ln(xw, y0, xw, yw, 'fold');
      h += dimH(x0, x1, y0 + 34, f.B, true) + tx(x1 + 10, (y0 + y1) / 2, f.A) + tx((xw + x1) / 2, y0 - 8, f.E, { a: 'middle', sm: true });
      h += tx(x0, y0 + 16, 'heel', { a: 'middle', sm: true }) + tx(x1, y1 - 8, 'peak', { a: 'middle', sm: true });
      if (at[f.ask]) h += tx(at[f.ask][0], at[f.ask][1], f.ask + ' = ?', { a: 'middle' });
      return svg(236, f.label, h);
    },
    /* a formed plate: two legs joined by a 90° bend, A, B and C sections */
    bend: function (f) {
      var h = pa('M80,30 L80,140 A60,60 0 0 0 140,200 L340,200', 'o', false) + ln(66, 140, 94, 140, 'fold') + ln(140, 186, 140, 214, 'fold');
      var at = { A: [60, 90, 'end'], B: [92, 196, 'end'], C: [240, 226, 'middle'], MR: [180, 150, 'middle'], Total: [240, 30, 'middle'] };
      h += tx(370, 60, f.T) + tx(370, 84, f.R) + tx(370, 108, f.a) + tx(370, 132, f.c);
      if (at[f.ask]) h += tx(at[f.ask][0], at[f.ask][1], (f.ask === 'Total' ? 'Flat plate' : f.ask) + ' = ?', { a: at[f.ask][2] });
      return svg(240, f.label, h);
    },
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
      var cx = 150, cy = 112, Ro = 82, Ri = 64, h = ci(cx, cy, Ro, 'o') + ci(cx, cy, Ri, 'paper-cut') + ci(cx, cy, (Ro + Ri) / 2, 'fold', false);
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

  /* ---------- Metal Fab package (Module 17) ---------- */
  /* Givens and answers from the package worked solutions, written here by course/package.py --hub. Every answer
     matches the instructor keys and every key sequence was played on the TI-30Xa emulator. Do not edit by hand. */
  var PKG = /* PKG-DATA */[{"n":"IT1-a","kind":"truss","fit":"","g":{"A":24.5,"B":42.0,"E":17.25},"gt":[["A rise","2'-0 1/2\""],["B run","3'-6\""],["E web to peak","1'-5 1/4\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"42 − 17.25","v":24.75,"a":"2'-0 3/4\"","s":"42 − 17.25 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"24.5 ÷ 42 × 12","v":7.0,"a":"7\"","s":"24.5 ÷ 42 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"2'-0 3/4\" × 24.5 ÷ 42","v":14.4375,"a":"1'-2 7/16\"","s":"( 42 − 17.25 ) × 24.5 ÷ 42 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(24.5² + 42²)","v":48.6235539631,"a":"4'-0 5/8\"","s":"24.5 x² + 42 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(2'-0 3/4\"² + 1'-2 7/16\"²)","v":28.6531657282,"a":"2'-4 5/8\"","s":"( 42 − 17.25 ) x² + ( ( 42 − 17.25 ) × 24.5 ÷ 42 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"4'-0 5/8\" − 2'-4 5/8\"","v":19.9703882348,"a":"1'-8\"","s":"24.5 x² + 42 x² = √x − ( ( 42 − 17.25 ) x² + ( ( 42 − 17.25 ) × 24.5 ÷ 42 ) x² ) √x ="}]},{"n":"IT1-b","kind":"truss","fit":"","g":{"A":28.25,"B":64.25,"E":28.375},"gt":[["A rise","2'-4 1/4\""],["B run","5'-4 1/4\""],["E web to peak","2'-4 3/8\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"64.25 − 28.375","v":35.875,"a":"2'-11 7/8\"","s":"64.25 − 28.375 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"28.25 ÷ 64.25 × 12","v":5.2762645914,"a":"5 1/4\"","s":"28.25 ÷ 64.25 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"2'-11 7/8\" × 28.25 ÷ 64.25","v":15.7738326848,"a":"1'-3 3/4\"","s":"( 64.25 − 28.375 ) × 28.25 ÷ 64.25 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(28.25² + 64.25²)","v":70.1863590735,"a":"5'-10 3/16\"","s":"28.25 x² + 64.25 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(2'-11 7/8\"² + 1'-3 3/4\"²)","v":39.1896596383,"a":"3'-3 3/16\"","s":"( 64.25 − 28.375 ) x² + ( ( 64.25 − 28.375 ) × 28.25 ÷ 64.25 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"5'-10 3/16\" − 3'-3 3/16\"","v":30.9966994352,"a":"2'-7\"","s":"28.25 x² + 64.25 x² = √x − ( ( 64.25 − 28.375 ) x² + ( ( 64.25 − 28.375 ) × 28.25 ÷ 64.25 ) x² ) √x ="}]},{"n":"IT1-c","kind":"truss","fit":"","g":{"A":36.875,"B":88.625,"E":40.5625},"gt":[["A rise","3'-0 7/8\""],["B run","7'-4 5/8\""],["E web to peak","3'-4 9/16\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"88.625 − 40.5625","v":48.0625,"a":"4'-0 1/16\"","s":"88.625 − 40.5625 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"36.875 ÷ 88.625 × 12","v":4.9929478138,"a":"5\"","s":"36.875 ÷ 88.625 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"4'-0 1/16\" × 36.875 ÷ 88.625","v":19.9977961918,"a":"1'-8\"","s":"( 88.625 − 40.5625 ) × 36.875 ÷ 88.625 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(36.875² + 88.625²)","v":95.9903966551,"a":"8'-0\"","s":"36.875 x² + 88.625 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(4'-0 1/16\"² + 1'-8\"²)","v":52.0568512184,"a":"4'-4 1/16\"","s":"( 88.625 − 40.5625 ) x² + ( ( 88.625 − 40.5625 ) × 36.875 ÷ 88.625 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"8'-0\" − 4'-4 1/16\"","v":43.9335454366,"a":"3'-7 15/16\"","s":"36.875 x² + 88.625 x² = √x − ( ( 88.625 − 40.5625 ) x² + ( ( 88.625 − 40.5625 ) × 36.875 ÷ 88.625 ) x² ) √x ="}]},{"n":"IT1-d","kind":"truss","fit":"","g":{"A":40.125,"B":128.5,"E":60.5},"gt":[["A rise","3'-4 1/8\""],["B run","10'-8 1/2\""],["E web to peak","5'-0 1/2\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"128.5 − 60.5","v":68.0,"a":"5'-8\"","s":"128.5 − 60.5 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"40.125 ÷ 128.5 × 12","v":3.7470817121,"a":"3 3/4\"","s":"40.125 ÷ 128.5 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"5'-8\" × 40.125 ÷ 128.5","v":21.233463035,"a":"1'-9 1/4\"","s":"( 128.5 − 60.5 ) × 40.125 ÷ 128.5 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(40.125² + 128.5²)","v":134.6189645815,"a":"11'-2 5/8\"","s":"40.125 x² + 128.5 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(5'-8\"² + 1'-9 1/4\"²)","v":71.2380512961,"a":"5'-11 1/4\"","s":"( 128.5 − 60.5 ) x² + ( ( 128.5 − 60.5 ) × 40.125 ÷ 128.5 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"11'-2 5/8\" − 5'-11 1/4\"","v":63.3809132855,"a":"5'-3 3/8\"","s":"40.125 x² + 128.5 x² = √x − ( ( 128.5 − 60.5 ) x² + ( ( 128.5 − 60.5 ) × 40.125 ÷ 128.5 ) x² ) √x ="}]},{"n":"IT1-e","kind":"truss","fit":"","g":{"A":72.625,"B":88.875,"E":40.6875},"gt":[["A rise","6'-0 5/8\""],["B run","7'-4 7/8\""],["E web to peak","3'-4 11/16\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"88.875 − 40.6875","v":48.1875,"a":"4'-0 3/16\"","s":"88.875 − 40.6875 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"72.625 ÷ 88.875 × 12","v":9.805907173,"a":"9 13/16\"","s":"72.625 ÷ 88.875 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"4'-0 3/16\" × 72.625 ÷ 88.875","v":39.3768459916,"a":"3'-3 3/8\"","s":"( 88.875 − 40.6875 ) × 72.625 ÷ 88.875 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(72.625² + 88.875²)","v":114.7743710503,"a":"9'-6 3/4\"","s":"72.625 x² + 88.875 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(4'-0 3/16\"² + 3'-3 3/8\"²)","v":62.2299859914,"a":"5'-2 1/4\"","s":"( 88.875 − 40.6875 ) x² + ( ( 88.875 − 40.6875 ) × 72.625 ÷ 88.875 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"9'-6 3/4\" − 5'-2 1/4\"","v":52.5443850589,"a":"4'-4 9/16\"","s":"72.625 x² + 88.875 x² = √x − ( ( 88.875 − 40.6875 ) x² + ( ( 88.875 − 40.6875 ) × 72.625 ÷ 88.875 ) x² ) √x ="}]},{"n":"IT1-f","kind":"truss","fit":"","g":{"A":84.75,"B":144.125,"E":68.3125},"gt":[["A rise","7'-0 3/4\""],["B run","12'-0 1/8\""],["E web to peak","5'-8 5/16\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"144.125 − 68.3125","v":75.8125,"a":"6'-3 13/16\"","s":"144.125 − 68.3125 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"84.75 ÷ 144.125 × 12","v":7.0563746748,"a":"7 1/16\"","s":"84.75 ÷ 144.125 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"6'-3 13/16\" × 84.75 ÷ 144.125","v":44.5801170859,"a":"3'-8 9/16\"","s":"( 144.125 − 68.3125 ) × 84.75 ÷ 144.125 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(84.75² + 144.125²)","v":167.1962264078,"a":"13'-11 3/16\"","s":"84.75 x² + 144.125 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(6'-3 13/16\"² + 3'-8 9/16\"²)","v":87.9484053047,"a":"7'-3 15/16\"","s":"( 144.125 − 68.3125 ) x² + ( ( 144.125 − 68.3125 ) × 84.75 ÷ 144.125 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"13'-11 3/16\" − 7'-3 15/16\"","v":79.2478211031,"a":"6'-7 1/4\"","s":"84.75 x² + 144.125 x² = √x − ( ( 144.125 − 68.3125 ) x² + ( ( 144.125 − 68.3125 ) × 84.75 ÷ 144.125 ) x² ) √x ="}]},{"n":"IT1-g","kind":"truss","fit":"","g":{"A":96.0625,"B":122.375,"E":57.4375},"gt":[["A rise","8'-0 1/16\""],["B run","10'-2 3/8\""],["E web to peak","4'-9 7/16\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"122.375 − 57.4375","v":64.9375,"a":"5'-4 15/16\"","s":"122.375 − 57.4375 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"96.0625 ÷ 122.375 × 12","v":9.4198161389,"a":"9 7/16\"","s":"96.0625 ÷ 122.375 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"5'-4 15/16\" × 96.0625 ÷ 122.375","v":50.9749425434,"a":"4'-3\"","s":"( 122.375 − 57.4375 ) × 96.0625 ÷ 122.375 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(96.0625² + 122.375²)","v":155.5752053871,"a":"12'-11 9/16\"","s":"96.0625 x² + 122.375 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(5'-4 15/16\"² + 4'-3\"²)","v":82.5549736452,"a":"6'-10 9/16\"","s":"( 122.375 − 57.4375 ) x² + ( ( 122.375 − 57.4375 ) × 96.0625 ÷ 122.375 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"12'-11 9/16\" − 6'-10 9/16\"","v":73.020231742,"a":"6'-1\"","s":"96.0625 x² + 122.375 x² = √x − ( ( 122.375 − 57.4375 ) x² + ( ( 122.375 − 57.4375 ) × 96.0625 ÷ 122.375 ) x² ) √x ="}]},{"n":"IT1-h","kind":"truss","fit":"","g":{"A":102.3125,"B":175.75,"E":84.125},"gt":[["A rise","8'-6 5/16\""],["B run","14'-7 3/4\""],["E web to peak","7'-0 1/8\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"175.75 − 84.125","v":91.625,"a":"7'-7 5/8\"","s":"175.75 − 84.125 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"102.3125 ÷ 175.75 × 12","v":6.9857752489,"a":"7\"","s":"102.3125 ÷ 175.75 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"7'-7 5/8\" × 102.3125 ÷ 175.75","v":53.3393047653,"a":"4'-5 5/16\"","s":"( 175.75 − 84.125 ) × 102.3125 ÷ 175.75 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(102.3125² + 175.75²)","v":203.3615257522,"a":"16'-11 3/8\"","s":"102.3125 x² + 175.75 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(7'-7 5/8\"² + 4'-5 5/16\"²)","v":106.0199134967,"a":"8'-10\"","s":"( 175.75 − 84.125 ) x² + ( ( 175.75 − 84.125 ) × 102.3125 ÷ 175.75 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"16'-11 3/8\" − 8'-10\"","v":97.3416122555,"a":"8'-1 5/16\"","s":"102.3125 x² + 175.75 x² = √x − ( ( 175.75 − 84.125 ) x² + ( ( 175.75 − 84.125 ) × 102.3125 ÷ 175.75 ) x² ) √x ="}]},{"n":"IT1-i","kind":"truss","fit":"","g":{"A":115.625,"B":202.5,"E":97.5},"gt":[["A rise","9'-7 5/8\""],["B run","16'-10 1/2\""],["E web to peak","8'-1 1/2\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"202.5 − 97.5","v":105.0,"a":"8'-9\"","s":"202.5 − 97.5 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"115.625 ÷ 202.5 × 12","v":6.8518518519,"a":"6 7/8\"","s":"115.625 ÷ 202.5 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"8'-9\" × 115.625 ÷ 202.5","v":59.9537037037,"a":"4'-11 15/16\"","s":"( 202.5 − 97.5 ) × 115.625 ÷ 202.5 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(115.625² + 202.5²)","v":233.1853139136,"a":"19'-5 3/16\"","s":"115.625 x² + 202.5 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(8'-9\"² + 4'-11 15/16\"²)","v":120.9109035108,"a":"10'-0 15/16\"","s":"( 202.5 − 97.5 ) x² + ( ( 202.5 − 97.5 ) × 115.625 ÷ 202.5 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"19'-5 3/16\" − 10'-0 15/16\"","v":112.2744104029,"a":"9'-4 1/4\"","s":"115.625 x² + 202.5 x² = √x − ( ( 202.5 − 97.5 ) x² + ( ( 202.5 − 97.5 ) × 115.625 ÷ 202.5 ) x² ) √x ="}]},{"n":"IT1-j","kind":"truss","fit":"","g":{"A":120.9375,"B":136.5,"E":64.5},"gt":[["A rise","10'-0 15/16\""],["B run","11'-4 1/2\""],["E web to peak","5'-4 1/2\""]],"rows":[{"k":"F","w":"Heel to web, along the run","f":"F = B − E","n":"136.5 − 64.5","v":72.0,"a":"6'-0\"","s":"136.5 − 64.5 ="},{"k":"D","w":"Rise per 12\" of run","f":"D = A ÷ B × 12","n":"120.9375 ÷ 136.5 × 12","v":10.6318681319,"a":"10 5/8\"","s":"120.9375 ÷ 136.5 × 12 ="},{"k":"G","w":"Web height","f":"G = F × A ÷ B","n":"6'-0\" × 120.9375 ÷ 136.5","v":63.7912087912,"a":"5'-3 13/16\"","s":"( 136.5 − 64.5 ) × 120.9375 ÷ 136.5 ="},{"k":"C","w":"Top chord, heel to peak","f":"C = √(A² + B²)","n":"√(120.9375² + 136.5²)","v":182.3681137322,"a":"15'-2 3/8\"","s":"120.9375 x² + 136.5 x² = √x"},{"k":"I","w":"Top chord, heel to web","f":"I = √(F² + G²)","n":"√(6'-0\"² + 5'-3 13/16\"²)","v":96.1941698807,"a":"8'-0 3/16\"","s":"( 136.5 − 64.5 ) x² + ( ( 136.5 − 64.5 ) × 120.9375 ÷ 136.5 ) x² = √x"},{"k":"H","w":"Top chord, web to peak","f":"H = C − I","n":"15'-2 3/8\" − 8'-0 3/16\"","v":86.1739438515,"a":"7'-2 3/16\"","s":"120.9375 x² + 136.5 x² = √x − ( ( 136.5 − 64.5 ) x² + ( ( 136.5 − 64.5 ) × 120.9375 ÷ 136.5 ) x² ) √x ="}]},{"n":"Metric 1","kind":"radius","fit":"","g":{"T":12.0,"IR":248.0,"OA":358.0,"OC":552.0,"mm":true},"gt":[["Plate T","12 mm"],["Inside radius","248 mm"],["OAL, A leg","358 mm"],["OAL, C leg","552 mm"]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"248 + 12 ÷ 2","v":254.0,"a":"254.0 mm","s":"248 + 12 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"358 − (248 + 12)","v":98.0,"a":"98 mm","s":"358 − ( 248 + 12 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 254 × 90 ÷ 180","v":398.9822670059,"a":"399 mm","s":"( 248 + 12 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"552 − (248 + 12)","v":292.0,"a":"292 mm","s":"552 − ( 248 + 12 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"98 + 398.9823 + 292","v":788.9822670059,"a":"789 mm","s":"358 − ( 248 + 12 ) + ( 248 + 12 ÷ 2 ) × π × 90 ÷ 180 + 552 − ( 248 + 12 ) ="}]},{"n":"Metric 2","kind":"radius","fit":"","g":{"T":10.0,"IR":184.0,"OA":309.0,"OC":398.0,"mm":true},"gt":[["Plate T","10 mm"],["Inside radius","184 mm"],["OAL, A leg","309 mm"],["OAL, C leg","398 mm"]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"184 + 10 ÷ 2","v":189.0,"a":"189.0 mm","s":"184 + 10 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"309 − (184 + 10)","v":115.0,"a":"115 mm","s":"309 − ( 184 + 10 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 189 × 90 ÷ 180","v":296.8805057642,"a":"297 mm","s":"( 184 + 10 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"398 − (184 + 10)","v":204.0,"a":"204 mm","s":"398 − ( 184 + 10 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"115 + 296.8805 + 204","v":615.8805057642,"a":"616 mm","s":"309 − ( 184 + 10 ) + ( 184 + 10 ÷ 2 ) × π × 90 ÷ 180 + 398 − ( 184 + 10 ) ="}]},{"n":"Metric 3","kind":"radius","fit":"","g":{"T":16.0,"IR":387.0,"OA":606.0,"OC":860.0,"mm":true},"gt":[["Plate T","16 mm"],["Inside radius","387 mm"],["OAL, A leg","606 mm"],["OAL, C leg","860 mm"]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"387 + 16 ÷ 2","v":395.0,"a":"395.0 mm","s":"387 + 16 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"606 − (387 + 16)","v":203.0,"a":"203 mm","s":"606 − ( 387 + 16 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 395 × 90 ÷ 180","v":620.464549084,"a":"620 mm","s":"( 387 + 16 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"860 − (387 + 16)","v":457.0,"a":"457 mm","s":"860 − ( 387 + 16 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"203 + 620.4645 + 457","v":1280.464549084,"a":"1280 mm","s":"606 − ( 387 + 16 ) + ( 387 + 16 ÷ 2 ) × π × 90 ÷ 180 + 860 − ( 387 + 16 ) ="}]},{"n":"Metric 4","kind":"radius","fit":"","g":{"T":19.0,"IR":473.0,"OA":816.0,"OC":1114.0,"mm":true},"gt":[["Plate T","19 mm"],["Inside radius","473 mm"],["OAL, A leg","816 mm"],["OAL, C leg","1114 mm"]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"473 + 19 ÷ 2","v":482.5,"a":"482.5 mm","s":"473 + 19 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"816 − (473 + 19)","v":324.0,"a":"324 mm","s":"816 − ( 473 + 19 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 482.5 × 90 ÷ 180","v":757.9092276785,"a":"758 mm","s":"( 473 + 19 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"1114 − (473 + 19)","v":622.0,"a":"622 mm","s":"1114 − ( 473 + 19 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"324 + 757.9092 + 622","v":1703.9092276785,"a":"1704 mm","s":"816 − ( 473 + 19 ) + ( 473 + 19 ÷ 2 ) × π × 90 ÷ 180 + 1114 − ( 473 + 19 ) ="}]},{"n":"Imperial 1","kind":"radius","fit":"","g":{"T":0.5,"IR":8.875,"OA":15.625,"OC":21.375,"mm":false},"gt":[["Plate T","1/2\""],["Inside radius","8 7/8\""],["OAL, A leg","15 5/8\""],["OAL, C leg","1'-9 3/8\""]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"8.875 + .5 ÷ 2","v":9.125,"a":"9 1/8\"","s":"8.875 + .5 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"15.625 − (8.875 + .5)","v":6.25,"a":"6 1/4\"","s":"15.625 − ( 8.875 + .5 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 9.125 × 90 ÷ 180","v":14.333516482,"a":"1'-2 5/16\"","s":"( 8.875 + .5 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"21.375 − (8.875 + .5)","v":12.0,"a":"1'-0\"","s":"21.375 − ( 8.875 + .5 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"6.25 + 14.3335 + 12","v":32.583516482,"a":"2'-8 9/16\"","s":"15.625 − ( 8.875 + .5 ) + ( 8.875 + .5 ÷ 2 ) × π × 90 ÷ 180 + 21.375 − ( 8.875 + .5 ) ="}]},{"n":"Imperial 2","kind":"radius","fit":"","g":{"T":0.25,"IR":6.125,"OA":11.625,"OC":21.0,"mm":false},"gt":[["Plate T","1/4\""],["Inside radius","6 1/8\""],["OAL, A leg","11 5/8\""],["OAL, C leg","1'-9\""]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"6.125 + .25 ÷ 2","v":6.25,"a":"6 1/4\"","s":"6.125 + .25 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"11.625 − (6.125 + .25)","v":5.25,"a":"5 1/4\"","s":"11.625 − ( 6.125 + .25 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 6.25 × 90 ÷ 180","v":9.8174770425,"a":"9 13/16\"","s":"( 6.125 + .25 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"21 − (6.125 + .25)","v":14.625,"a":"1'-2 5/8\"","s":"21 − ( 6.125 + .25 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"5.25 + 9.8175 + 14.625","v":29.6924770425,"a":"2'-5 11/16\"","s":"11.625 − ( 6.125 + .25 ) + ( 6.125 + .25 ÷ 2 ) × π × 90 ÷ 180 + 21 − ( 6.125 + .25 ) ="}]},{"n":"Imperial 3","kind":"radius","fit":"","g":{"T":0.125,"IR":4.75,"OA":10.375,"OC":14.375,"mm":false},"gt":[["Plate T","1/8\""],["Inside radius","4 3/4\""],["OAL, A leg","10 3/8\""],["OAL, C leg","1'-2 3/8\""]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"4.75 + .125 ÷ 2","v":4.8125,"a":"4 13/16\"","s":"4.75 + .125 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"10.375 − (4.75 + .125)","v":5.5,"a":"5 1/2\"","s":"10.375 − ( 4.75 + .125 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 4.8125 × 90 ÷ 180","v":7.5594573227,"a":"7 9/16\"","s":"( 4.75 + .125 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"14.375 − (4.75 + .125)","v":9.5,"a":"9 1/2\"","s":"14.375 − ( 4.75 + .125 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"5.5 + 7.5595 + 9.5","v":22.5594573227,"a":"1'-10 9/16\"","s":"10.375 − ( 4.75 + .125 ) + ( 4.75 + .125 ÷ 2 ) × π × 90 ÷ 180 + 14.375 − ( 4.75 + .125 ) ="}]},{"n":"Imperial 4","kind":"radius","fit":"","g":{"T":0.375,"IR":8.375,"OA":13.0,"OC":19.8125,"mm":false},"gt":[["Plate T","3/8\""],["Inside radius","8 3/8\""],["OAL, A leg","13\""],["OAL, C leg","1'-7 13/16\""]],"rows":[{"k":"MR","w":"Mean radius","f":"MR = IR + ½T","n":"8.375 + .375 ÷ 2","v":8.5625,"a":"8 9/16\"","s":"8.375 + .375 ÷ 2 ="},{"k":"A","w":"Straight leg to the tangent point","f":"A = OAL − (IR + T)","n":"13 − (8.375 + .375)","v":4.25,"a":"4 1/4\"","s":"13 − ( 8.375 + .375 ) ="},{"k":"B","w":"Stretchout of the 90° bend","f":"B = π × MR × 90 ÷ 180","n":"π × 8.5625 × 90 ÷ 180","v":13.4499435482,"a":"1'-1 7/16\"","s":"( 8.375 + .375 ÷ 2 ) × π × 90 ÷ 180 ="},{"k":"C","w":"Other straight leg","f":"C = OAL − (IR + T)","n":"19.8125 − (8.375 + .375)","v":11.0625,"a":"11 1/16\"","s":"19.8125 − ( 8.375 + .375 ) ="},{"k":"Total","w":"Flat plate length","f":"A + B + C","n":"4.25 + 13.4499 + 11.0625","v":28.7624435482,"a":"2'-4 3/4\"","s":"13 − ( 8.375 + .375 ) + ( 8.375 + .375 ÷ 2 ) × π × 90 ÷ 180 + 19.8125 − ( 8.375 + .375 ) ="}]},{"n":"ICC-A","kind":"tank","fit":"Corner to corner","g":{"fit":"ICC","OD":18.5,"T":0.25,"EP":0.375,"L":46.25,"G":8.5,"H":33.75},"gt":[["Shell OD","1'-6 1/2\""],["Shell T","1/4\""],["End plate EP","3/8\""],["Overall length","3'-10 1/4\""],["G c-c, saddle bolt holes","8 1/2\""],["H c-c, saddle bolt holes","2'-9 3/4\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"46.25 − 2 × .375","v":45.5,"a":"3'-9 1/2\"","s":"46.25 − 2 × .375 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (18.5 − .25)","v":57.334065928,"a":"4'-9 5/16\"","s":"( 18.5 − .25 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"45.5 × 57.3341 × .25 × 40.8 ÷ 144","v":184.7829166472,"a":"184.78","s":"( 46.25 − 2 × .375 ) × ( 18.5 − .25 ) × π × .25 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(45.5² + 57.3341²)","v":73.194570262,"a":"6'-1 3/16\"","s":"( 46.25 − 2 × .375 ) x² + ( ( 18.5 − .25 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 18² ÷ 4 ÷ 144","v":1.7671458676,"a":"1.77","s":"( 18.5 − 2 × .25 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"1.7671 × .375 × 40.8 × 2","v":54.0746635499,"a":"54.07","s":"( 18.5 − 2 × .25 ) x² × π ÷ 4 ÷ 144 × .375 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(8.5² + 33.75²)","v":34.8039150097,"a":"2'-10 13/16\"","s":"8.5 x² + 33.75 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"184.7829 + 54.0747","v":238.8575801971,"a":"238.86","s":"( 46.25 − 2 × .375 ) × ( 18.5 − .25 ) × π × .25 × 40.8 ÷ 144 + ( 18.5 − 2 × .25 ) x² × π ÷ 4 ÷ 144 × .375 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 18² ÷ 4 × 45.5 ÷ 1728","v":6.7004280815,"a":"6.70","s":"( 18.5 − 2 × .25 ) x² × π ÷ 4 × ( 46.25 − 2 × .375 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"6.7004 × 6.25","v":41.8776755093,"a":"41.88","s":"( 18.5 − 2 × .25 ) x² × π ÷ 4 × ( 46.25 − 2 × .375 ) ÷ 1728 × 6.25 ="}]},{"n":"ICC-B","kind":"tank","fit":"Corner to corner","g":{"fit":"ICC","OD":26.875,"T":0.375,"EP":0.5,"L":58.75,"G":16.875,"H":46.25},"gt":[["Shell OD","2'-2 7/8\""],["Shell T","3/8\""],["End plate EP","1/2\""],["Overall length","4'-10 3/4\""],["G c-c, saddle bolt holes","1'-4 7/8\""],["H c-c, saddle bolt holes","3'-10 1/4\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"58.75 − 2 × .5","v":57.75,"a":"4'-9 3/4\"","s":"58.75 − 2 × .5 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (26.875 − .375)","v":83.2522053201,"a":"6'-11 1/4\"","s":"( 26.875 − .375 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"57.75 × 83.2522 × .375 × 40.8 ÷ 144","v":510.8303285815,"a":"510.83","s":"( 58.75 − 2 × .5 ) × ( 26.875 − .375 ) × π × .375 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(57.75² + 83.2522²)","v":101.3212326744,"a":"8'-5 5/16\"","s":"( 58.75 − 2 × .5 ) x² + ( ( 26.875 − .375 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 26.125² ÷ 4 ÷ 144","v":3.7225452664,"a":"3.72","s":"( 26.875 − 2 × .375 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"3.7225 × .5 × 40.8 × 2","v":151.8798468701,"a":"151.88","s":"( 26.875 − 2 × .375 ) x² × π ÷ 4 ÷ 144 × .5 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(16.875² + 46.25²)","v":49.2323889833,"a":"4'-1 1/4\"","s":"16.875 x² + 46.25 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"510.8303 + 151.8798","v":662.7101754516,"a":"662.71","s":"( 58.75 − 2 × .5 ) × ( 26.875 − .375 ) × π × .375 × 40.8 ÷ 144 + ( 26.875 − 2 × .375 ) x² × π ÷ 4 ÷ 144 × .5 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 26.125² ÷ 4 × 57.75 ÷ 1728","v":17.9147490947,"a":"17.91","s":"( 26.875 − 2 × .375 ) x² × π ÷ 4 × ( 58.75 − 2 × .5 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"17.9147 × 6.25","v":111.9671818417,"a":"111.97","s":"( 26.875 − 2 × .375 ) x² × π ÷ 4 × ( 58.75 − 2 × .5 ) ÷ 1728 × 6.25 ="}]},{"n":"ICC-C","kind":"tank","fit":"Corner to corner","g":{"fit":"ICC","OD":49.625,"T":0.5,"EP":0.75,"L":112.875,"G":39.625,"H":100.375},"gt":[["Shell OD","4'-1 5/8\""],["Shell T","1/2\""],["End plate EP","3/4\""],["Overall length","9'-4 7/8\""],["G c-c, saddle bolt holes","3'-3 5/8\""],["H c-c, saddle bolt holes","8'-4 3/8\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"112.875 − 2 × .75","v":111.375,"a":"9'-3 3/8\"","s":"112.875 − 2 × .75 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (49.625 − .5)","v":154.3307391076,"a":"12'-10 5/16\"","s":"( 49.625 − .5 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"111.375 × 154.3307 × .5 × 40.8 ÷ 144","v":2435.0496929821,"a":"2435.05","s":"( 112.875 − 2 × .75 ) × ( 49.625 − .5 ) × π × .5 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(111.375² + 154.3307²)","v":190.3217477287,"a":"15'-10 5/16\"","s":"( 112.875 − 2 × .75 ) x² + ( ( 49.625 − .5 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 48.625² ÷ 4 ÷ 144","v":12.895750378,"a":"12.90","s":"( 49.625 − 2 × .5 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"12.8958 × .75 × 40.8 × 2","v":789.2199231324,"a":"789.22","s":"( 49.625 − 2 × .5 ) x² × π ÷ 4 ÷ 144 × .75 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(39.625² + 100.375²)","v":107.9133043234,"a":"8'-11 15/16\"","s":"39.625 x² + 100.375 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"2435.0497 + 789.2199","v":3224.2696161145,"a":"3224.27","s":"( 112.875 − 2 × .75 ) × ( 49.625 − .5 ) × π × .5 × 40.8 ÷ 144 + ( 49.625 − 2 × .5 ) x² × π ÷ 4 ÷ 144 × .75 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 48.625² ÷ 4 × 111.375 ÷ 1728","v":119.6886831956,"a":"119.69","s":"( 49.625 − 2 × .5 ) x² × π ÷ 4 × ( 112.875 − 2 × .75 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"119.6887 × 6.25","v":748.0542699727,"a":"748.05","s":"( 49.625 − 2 × .5 ) x² × π ÷ 4 × ( 112.875 − 2 × .75 ) ÷ 1728 × 6.25 ="}]},{"n":"ICC-D","kind":"tank","fit":"Corner to corner","g":{"fit":"ICC","OD":84.25,"T":0.75,"EP":1.25,"L":144.125,"G":74.25,"H":131.625},"gt":[["Shell OD","7'-0 1/4\""],["Shell T","3/4\""],["End plate EP","1 1/4\""],["Overall length","12'-0 1/8\""],["G c-c, saddle bolt holes","6'-2 1/4\""],["H c-c, saddle bolt holes","10'-11 5/8\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"144.125 − 2 × 1.25","v":141.625,"a":"11'-9 5/8\"","s":"144.125 − 2 × 1.25 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (84.25 − .75)","v":262.3229865747,"a":"21'-10 5/16\"","s":"( 84.25 − .75 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"141.625 × 262.323 × .75 × 40.8 ÷ 144","v":7894.6922569003,"a":"7894.69","s":"( 144.125 − 2 × 1.25 ) × ( 84.25 − .75 ) × π × .75 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(141.625² + 262.323²)","v":298.1123779894,"a":"24'-10 1/8\"","s":"( 144.125 − 2 × 1.25 ) x² + ( ( 84.25 − .75 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 82.75² ÷ 4 ÷ 144","v":37.3476598003,"a":"37.35","s":"( 84.25 − 2 × .75 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"37.3477 × 1.25 × 40.8 × 2","v":3809.4612996349,"a":"3809.46","s":"( 84.25 − 2 × .75 ) x² × π ÷ 4 ÷ 144 × 1.25 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(74.25² + 131.625²)","v":151.1231389464,"a":"12'-7 1/8\"","s":"74.25 x² + 131.625 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"7894.6923 + 3809.4613","v":11704.1535565352,"a":"11704.15","s":"( 144.125 − 2 × 1.25 ) × ( 84.25 − .75 ) × π × .75 × 40.8 ÷ 144 + ( 84.25 − 2 × .75 ) x² × π ÷ 4 ÷ 144 × 1.25 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 82.75² ÷ 4 × 141.625 ÷ 1728","v":440.7801932686,"a":"440.78","s":"( 84.25 − 2 × .75 ) x² × π ÷ 4 × ( 144.125 − 2 × 1.25 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"440.7802 × 6.25","v":2754.8762079289,"a":"2754.88","s":"( 84.25 − 2 × .75 ) x² × π ÷ 4 × ( 144.125 − 2 × 1.25 ) ÷ 1728 × 6.25 ="}]},{"n":"IOF-A","kind":"tank","fit":"Outside flush","g":{"fit":"IOF","OD":36.25,"T":0.25,"EP":0.5,"L":68.75,"G":26.0,"H":54.375},"gt":[["Shell OD","3'-0 1/4\""],["Shell T","1/4\""],["End plate EP","1/2\""],["Overall length","5'-8 3/4\""],["G c-c, saddle bolt holes","2'-2\""],["H c-c, saddle bolt holes","4'-6 3/8\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"68.75 − 2 × .5","v":67.75,"a":"5'-7 3/4\"","s":"68.75 − 2 × .5 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (36.25 − .25)","v":113.0973355292,"a":"9'-5 1/8\"","s":"( 36.25 − .25 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"67.75 × 113.0973 × .25 × 40.8 ÷ 144","v":542.7494008158,"a":"542.75","s":"( 68.75 − 2 × .5 ) × ( 36.25 − .25 ) × π × .25 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(67.75² + 113.0973²)","v":131.8372853324,"a":"10'-11 13/16\"","s":"( 68.75 − 2 × .5 ) x² + ( ( 36.25 − .25 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 36.25² ÷ 4 ÷ 144","v":7.1670991256,"a":"7.17","s":"36.25 x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"7.1671 × .5 × 40.8 × 2","v":292.4176443253,"a":"292.42","s":"36.25 x² × π ÷ 4 ÷ 144 × .5 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(26² + 54.375²)","v":60.2713914308,"a":"5'-0 1/4\"","s":"26 x² + 54.375 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"542.7494 + 292.4176","v":835.1670451412,"a":"835.17","s":"( 68.75 − 2 × .5 ) × ( 36.25 − .25 ) × π × .25 × 40.8 ÷ 144 + 36.25 x² × π ÷ 4 ÷ 144 × .5 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 35.75² ÷ 4 × 67.75 ÷ 1728","v":39.355690364,"a":"39.36","s":"( 36.25 − 2 × .25 ) x² × π ÷ 4 × ( 68.75 − 2 × .5 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"39.3557 × 6.25","v":245.9730647752,"a":"245.97","s":"( 36.25 − 2 × .25 ) x² × π ÷ 4 × ( 68.75 − 2 × .5 ) ÷ 1728 × 6.25 ="}]},{"n":"IOF-B","kind":"tank","fit":"Outside flush","g":{"fit":"IOF","OD":61.875,"T":0.375,"EP":0.625,"L":79.125,"G":51.625,"H":64.75},"gt":[["Shell OD","5'-1 7/8\""],["Shell T","3/8\""],["End plate EP","5/8\""],["Overall length","6'-7 1/8\""],["G c-c, saddle bolt holes","4'-3 5/8\""],["H c-c, saddle bolt holes","5'-4 3/4\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"79.125 − 2 × .625","v":77.875,"a":"6'-5 7/8\"","s":"79.125 − 2 × .625 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (61.875 − .375)","v":193.2079481958,"a":"16'-1 3/16\"","s":"( 61.875 − .375 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"77.875 × 193.2079 × .375 × 40.8 ÷ 144","v":1598.6448276105,"a":"1598.64","s":"( 79.125 − 2 × .625 ) × ( 61.875 − .375 ) × π × .375 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(77.875² + 193.2079²)","v":208.3118500494,"a":"17'-4 5/16\"","s":"( 79.125 − 2 × .625 ) x² + ( ( 61.875 − .375 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 61.875² ÷ 4 ÷ 144","v":20.8813134751,"a":"20.88","s":"61.875 x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"20.8813 × .625 × 40.8 × 2","v":1064.9469872298,"a":"1064.95","s":"61.875 x² × π ÷ 4 ÷ 144 × .625 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(51.625² + 64.75²)","v":82.8112499906,"a":"6'-10 13/16\"","s":"51.625 x² + 64.75 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"1598.6448 + 1064.947","v":2663.5918148402,"a":"2663.59","s":"( 79.125 − 2 × .625 ) × ( 61.875 − .375 ) × π × .375 × 40.8 ÷ 144 + 61.875 x² × π ÷ 4 ÷ 144 × .625 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 61.125² ÷ 4 × 77.875 ÷ 1728","v":132.2458179673,"a":"132.25","s":"( 61.875 − 2 × .375 ) x² × π ÷ 4 × ( 79.125 − 2 × .625 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"132.2458 × 6.25","v":826.5363622958,"a":"826.54","s":"( 61.875 − 2 × .375 ) x² × π ÷ 4 × ( 79.125 − 2 × .625 ) ÷ 1728 × 6.25 ="}]},{"n":"IOF-C","kind":"tank","fit":"Outside flush","g":{"fit":"IOF","OD":88.8125,"T":0.5,"EP":0.75,"L":98.25,"G":78.5625,"H":83.875},"gt":[["Shell OD","7'-4 13/16\""],["Shell T","1/2\""],["End plate EP","3/4\""],["Overall length","8'-2 1/4\""],["G c-c, saddle bolt holes","6'-6 9/16\""],["H c-c, saddle bolt holes","6'-11 7/8\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"98.25 − 2 × .75","v":96.75,"a":"8'-0 3/4\"","s":"98.25 − 2 × .75 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (88.8125 − .5)","v":277.4419012201,"a":"23'-1 7/16\"","s":"( 88.8125 − .5 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"96.75 × 277.4419 × .5 × 40.8 ÷ 144","v":3802.6880585987,"a":"3802.69","s":"( 98.25 − 2 × .75 ) × ( 88.8125 − .5 ) × π × .5 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(96.75² + 277.4419²)","v":293.8274511557,"a":"24'-5 13/16\"","s":"( 98.25 − 2 × .75 ) x² + ( ( 88.8125 − .5 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 88.8125² ÷ 4 ÷ 144","v":43.0205125015,"a":"43.02","s":"88.8125 x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"43.0205 × .75 × 40.8 × 2","v":2632.8553650943,"a":"2632.86","s":"88.8125 x² × π ÷ 4 ÷ 144 × .75 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(78.5625² + 83.875²)","v":114.9220693829,"a":"9'-6 15/16\"","s":"78.5625 x² + 83.875 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"3802.6881 + 2632.8554","v":6435.543423693,"a":"6435.54","s":"( 98.25 − 2 × .75 ) × ( 88.8125 − .5 ) × π × .5 × 40.8 ÷ 144 + 88.8125 x² × π ÷ 4 ÷ 144 × .75 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 87.8125² ÷ 4 × 96.75 ÷ 1728","v":339.0859538194,"a":"339.09","s":"( 88.8125 − 2 × .5 ) x² × π ÷ 4 × ( 98.25 − 2 × .75 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"339.086 × 6.25","v":2119.2872113714,"a":"2119.29","s":"( 88.8125 − 2 × .5 ) x² × π ÷ 4 × ( 98.25 − 2 × .75 ) ÷ 1728 × 6.25 ="}]},{"n":"IOF-D","kind":"tank","fit":"Outside flush","g":{"fit":"IOF","OD":102.5,"T":0.625,"EP":0.875,"L":145.625,"G":92.25,"H":131.25},"gt":[["Shell OD","8'-6 1/2\""],["Shell T","5/8\""],["End plate EP","7/8\""],["Overall length","12'-1 5/8\""],["G c-c, saddle bolt holes","7'-8 1/4\""],["H c-c, saddle bolt holes","10'-11 1/4\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL − 2 × EP","n":"145.625 − 2 × .875","v":143.875,"a":"11'-11 7/8\"","s":"145.625 − 2 × .875 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (102.5 − .625)","v":320.0497515845,"a":"26'-8 1/16\"","s":"( 102.5 − .625 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"143.875 × 320.0498 × .625 × 40.8 ÷ 144","v":8154.1842307983,"a":"8154.18","s":"( 145.625 − 2 × .875 ) × ( 102.5 − .625 ) × π × .625 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(143.875² + 320.0498²)","v":350.9014948875,"a":"29'-2 7/8\"","s":"( 145.625 − 2 × .875 ) x² + ( ( 102.5 − .625 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 102.5² ÷ 4 ÷ 144","v":57.302704543,"a":"57.30","s":"102.5 x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"57.3027 × .875 × 40.8 × 2","v":4091.4131043714,"a":"4091.41","s":"102.5 x² × π ÷ 4 ÷ 144 × .875 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(92.25² + 131.25²)","v":160.426384987,"a":"13'-4 7/16\"","s":"92.25 x² + 131.25 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"8154.1842 + 4091.4131","v":12245.5973351698,"a":"12245.60","s":"( 145.625 − 2 × .875 ) × ( 102.5 − .625 ) × π × .625 × 40.8 ÷ 144 + 102.5 x² × π ÷ 4 ÷ 144 × .875 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 101.25² ÷ 4 × 143.875 ÷ 1728","v":670.3807632908,"a":"670.38","s":"( 102.5 − 2 × .625 ) x² × π ÷ 4 × ( 145.625 − 2 × .875 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"670.3808 × 6.25","v":4189.8797705674,"a":"4189.88","s":"( 102.5 − 2 × .625 ) x² × π ÷ 4 × ( 145.625 − 2 × .875 ) ÷ 1728 × 6.25 ="}]},{"n":"IIF-A","kind":"tank","fit":"Inside flush","g":{"fit":"IIF","OD":22.25,"T":0.25,"EP":0.375,"L":65.875,"G":14.0,"H":53.125},"gt":[["Shell OD","1'-10 1/4\""],["Shell T","1/4\""],["End plate EP","3/8\""],["Overall length","5'-5 7/8\""],["G c-c, saddle bolt holes","1'-2\""],["H c-c, saddle bolt holes","4'-5 1/8\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL","n":"65.875","v":65.875,"a":"5'-5 7/8\"","s":"65.875 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (22.25 − .25)","v":69.115038379,"a":"5'-9 1/8\"","s":"( 22.25 − .25 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"65.875 × 69.115 × .25 × 40.8 ÷ 144","v":322.5008483527,"a":"322.50","s":"65.875 × ( 22.25 − .25 ) × π × .25 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(65.875² + 69.115²)","v":95.4798625634,"a":"7'-11 1/2\"","s":"65.875 x² + ( ( 22.25 − .25 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 21.75² ÷ 4 ÷ 144","v":2.5801556852,"a":"2.58","s":"( 22.25 − 2 × .25 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"2.5802 × .375 × 40.8 × 2","v":78.9527639678,"a":"78.95","s":"( 22.25 − 2 × .25 ) x² × π ÷ 4 ÷ 144 × .375 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(14² + 53.125²)","v":54.9387442976,"a":"4'-6 15/16\"","s":"14 x² + 53.125 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"322.5008 + 78.9528","v":401.4536123206,"a":"401.45","s":"65.875 × ( 22.25 − .25 ) × π × .25 × 40.8 ÷ 144 + ( 22.25 − 2 × .25 ) x² × π ÷ 4 ÷ 144 × .375 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 21.75² ÷ 4 × 65.125 ÷ 1728","v":14.0027199167,"a":"14.00","s":"( 22.25 − 2 × .25 ) x² × π ÷ 4 × ( 65.875 − 2 × .375 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"14.0027 × 6.25","v":87.5169994793,"a":"87.52","s":"( 22.25 − 2 × .25 ) x² × π ÷ 4 × ( 65.875 − 2 × .375 ) ÷ 1728 × 6.25 ="}]},{"n":"IIF-B","kind":"tank","fit":"Inside flush","g":{"fit":"IIF","OD":30.125,"T":0.375,"EP":0.625,"L":74.5,"G":21.875,"H":61.75},"gt":[["Shell OD","2'-6 1/8\""],["Shell T","3/8\""],["End plate EP","5/8\""],["Overall length","6'-2 1/2\""],["G c-c, saddle bolt holes","1'-9 7/8\""],["H c-c, saddle bolt holes","5'-1 3/4\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL","n":"74.5","v":74.5,"a":"6'-2 1/2\"","s":"74.5 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (30.125 − .375)","v":93.4623814443,"a":"7'-9 7/16\"","s":"( 30.125 − .375 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"74.5 × 93.4624 × .375 × 40.8 ÷ 144","v":739.81316312,"a":"739.81","s":"74.5 × ( 30.125 − .375 ) × π × .375 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(74.5² + 93.4624²)","v":119.5218253929,"a":"9'-11 1/2\"","s":"74.5 x² + ( ( 30.125 − .375 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 29.375² ÷ 4 ÷ 144","v":4.7063382784,"a":"4.71","s":"( 30.125 − 2 × .375 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"4.7063 × .625 × 40.8 × 2","v":240.0232521978,"a":"240.02","s":"( 30.125 − 2 × .375 ) x² × π ÷ 4 ÷ 144 × .625 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(21.875² + 61.75²)","v":65.5101375743,"a":"5'-5 1/2\"","s":"21.875 x² + 61.75 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"739.8132 + 240.0233","v":979.8364153178,"a":"979.84","s":"74.5 × ( 30.125 − .375 ) × π × .375 × 40.8 ÷ 144 + ( 30.125 − 2 × .375 ) x² × π ÷ 4 ÷ 144 × .625 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 29.375² ÷ 4 × 73.25 ÷ 1728","v":28.728273241,"a":"28.73","s":"( 30.125 − 2 × .375 ) x² × π ÷ 4 × ( 74.5 − 2 × .625 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"28.7283 × 6.25","v":179.5517077562,"a":"179.55","s":"( 30.125 − 2 × .375 ) x² × π ÷ 4 × ( 74.5 − 2 × .625 ) ÷ 1728 × 6.25 ="}]},{"n":"IIF-C","kind":"tank","fit":"Inside flush","g":{"fit":"IIF","OD":42.625,"T":0.5,"EP":0.75,"L":99.5625,"G":34.375,"H":86.8125},"gt":[["Shell OD","3'-6 5/8\""],["Shell T","1/2\""],["End plate EP","3/4\""],["Overall length","8'-3 9/16\""],["G c-c, saddle bolt holes","2'-10 3/8\""],["H c-c, saddle bolt holes","7'-2 13/16\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL","n":"99.5625","v":99.5625,"a":"8'-3 9/16\"","s":"99.5625 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (42.625 − .5)","v":132.3395905325,"a":"11'-0 5/16\"","s":"( 42.625 − .5 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"99.5625 × 132.3396 × .5 × 40.8 ÷ 144","v":1866.6085683384,"a":"1866.61","s":"99.5625 × ( 42.625 − .5 ) × π × .5 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(99.5625² + 132.3396²)","v":165.6093554983,"a":"13'-9 5/8\"","s":"99.5625 x² + ( ( 42.625 − .5 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 41.625² ÷ 4 ÷ 144","v":9.4500886438,"a":"9.45","s":"( 42.625 − 2 × .5 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"9.4501 × .75 × 40.8 × 2","v":578.3454249987,"a":"578.35","s":"( 42.625 − 2 × .5 ) x² × π ÷ 4 ÷ 144 × .75 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(34.375² + 86.8125²)","v":93.3705027364,"a":"7'-9 3/8\"","s":"34.375 x² + 86.8125 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"1866.6086 + 578.3454","v":2444.9539933371,"a":"2444.95","s":"99.5625 × ( 42.625 − .5 ) × π × .5 × 40.8 ÷ 144 + ( 42.625 − 2 × .5 ) x² × π ÷ 4 ÷ 144 × .75 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 41.625² ÷ 4 × 98.0625 ÷ 1728","v":77.2249431358,"a":"77.22","s":"( 42.625 − 2 × .5 ) x² × π ÷ 4 × ( 99.5625 − 2 × .75 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"77.2249 × 6.25","v":482.6558945988,"a":"482.66","s":"( 42.625 − 2 × .5 ) x² × π ÷ 4 × ( 99.5625 − 2 × .75 ) ÷ 1728 × 6.25 ="}]},{"n":"IIF-D","kind":"tank","fit":"Inside flush","g":{"fit":"IIF","OD":95.375,"T":0.625,"EP":1.0,"L":127.25,"G":87.125,"H":114.5},"gt":[["Shell OD","7'-11 3/8\""],["Shell T","5/8\""],["End plate EP","1\""],["Overall length","10'-7 1/4\""],["G c-c, saddle bolt holes","7'-3 1/8\""],["H c-c, saddle bolt holes","9'-6 1/2\""]],"rows":[{"k":"A","w":"Shell plate width (shell length)","f":"A = OAL","n":"127.25","v":127.25,"a":"10'-7 1/4\"","s":"127.25 ="},{"k":"B","w":"Shell stretch-out","f":"B = π × (OD − T)","n":"π × (95.375 − .625)","v":297.6659039276,"a":"24'-9 11/16\"","s":"( 95.375 − .625 ) × π ="},{"k":"C","w":"Shell mass (lb)","f":"C = A × B × T × 40.8 ÷ 144","n":"127.25 × 297.6659 × .625 × 40.8 ÷ 144","v":6707.5600694943,"a":"6707.56","s":"127.25 × ( 95.375 − .625 ) × π × .625 × 40.8 ÷ 144 ="},{"k":"D","w":"Diagonal of the shell plate","f":"D = √(A² + B²)","n":"√(127.25² + 297.6659²)","v":323.724501484,"a":"26'-11 3/4\"","s":"127.25 x² + ( ( 95.375 − .625 ) × π ) x² = √x"},{"k":"E","w":"One end plate area (sq ft)","f":"E = π × Ø² ÷ 4 ÷ 144","n":"π × 94.125² ÷ 4 ÷ 144","v":48.3211618088,"a":"48.32","s":"( 95.375 − 2 × .625 ) x² × π ÷ 4 ÷ 144 ="},{"k":"F","w":"Both end plates, mass (lb)","f":"F = E × EP × 40.8 × 2","n":"48.3212 × 1 × 40.8 × 2","v":3943.0068035974,"a":"3943.01","s":"( 95.375 − 2 × .625 ) x² × π ÷ 4 ÷ 144 × 1 × 40.8 × 2 ="},{"k":"I","w":"Saddle bolt holes, diagonal check","f":"I = √(G² + H²)","n":"√(87.125² + 114.5²)","v":143.878475197,"a":"11'-11 7/8\"","s":"87.125 x² + 114.5 x² = √x"},{"k":"J","w":"Total tank mass (lb)","f":"J = C + F","n":"6707.5601 + 3943.0068","v":10650.5668730917,"a":"10650.57","s":"127.25 × ( 95.375 − .625 ) × π × .625 × 40.8 ÷ 144 + ( 95.375 − 2 × .625 ) x² × π ÷ 4 ÷ 144 × 1 × 40.8 × 2 ="},{"k":"K","w":"Volume (cu ft)","f":"K = π × ID² ÷ 4 × inside length ÷ 1728","n":"π × 94.125² ÷ 4 × 125.25 ÷ 1728","v":504.3521263793,"a":"504.35","s":"( 95.375 − 2 × .625 ) x² × π ÷ 4 × ( 127.25 − 2 × 1 ) ÷ 1728 ="},{"k":"L","w":"Capacity (gal)","f":"L = K × 6.25","n":"504.3521 × 6.25","v":3152.2007898704,"a":"3152.20","s":"( 95.375 − 2 × .625 ) x² × π ÷ 4 × ( 127.25 − 2 × 1 ) ÷ 1728 × 6.25 ="}]}]/* /PKG-DATA */;
  var PKG_UNIT = { C: 'lb', E: 'sq ft', F: 'lb', J: 'lb', K: 'cu ft', L: 'gal' };
  var PKG_KIND = { truss: 'Truss', radius: 'Formed plate', tank: 'Tank' };
  function pkgTask(r, fx, kind) {
    var list = PKG.filter(function (p) { return p.kind === kind; });
    var f = fx || { i: ri(r, 0, list.length - 1) };
    var p = list[f.i];
    var row = f.k ? p.rows.filter(function (x) { return x.k === f.k; })[0] : pick(r, p.rows);
    var len = /"$/.test(row.a), mm = / mm$/.test(row.a), v = row.v, answers, tail;
    var steps = ['Formula: ' + row.f + '.', 'Put in the numbers: ' + row.k + ' = ' + row.n + ' = ' + cd(v) + (mm ? ' mm.' : len ? '".' : '.')];
    if (len) {
      var pt = ftinParts(v), w = Math.floor(v - pt.ft * 12);
      answers = pt.ft ? [A({ label: 'Feet', unit: 'ft', value: pt.ft, kind: 'int' }), A({ label: 'Inches', unit: 'in', value: pt.in16 / 16, kind: 'frac', tol: 0.01 })]
        : [A({ label: row.k, unit: 'in', value: pt.in16 / 16, kind: 'frac', tol: 0.01 })];
      if (v >= 12) steps.push('Feet: ' + cd(v) + ' ÷ 12 = ' + cd(v / 12) + '. Keep ' + Math.floor(v / 12) + "'. Inches left: " + cd(v - Math.floor(v / 12) * 12) + '".');
      steps.push('Sixteenths: ' + key(v - Math.floor(v / 12) * 12 - w) + ' × 16 = ' + cd((v - Math.floor(v / 12) * 12 - w) * 16) + '. Round to the nearest whole sixteenth.');
      tail = ' to the nearest 1/16"';
    } else if (mm) {
      answers = [A({ label: row.k, unit: 'mm', value: v, dp: row.k === 'MR' ? 1 : 0, tol: row.k === 'MR' ? 0.05 : 0.5 })];
      tail = ' to the nearest ' + (row.k === 'MR' ? '0.1 mm' : 'mm');
    } else {
      answers = [A({ label: row.k, unit: PKG_UNIT[row.k] || '', value: v, dp: 2 })];
      tail = ' to 2 decimal places';
    }
    steps.push('Answer: ' + row.k + ' = ' + row.a + '.');
    var given = p.gt.map(function (g) { return g[0] + ' ' + g[1]; }).join(', ');
    var gv = {};
    p.gt.forEach(function (g) { gv[g[0]] = g[1]; });
    var fig = kind === 'tank' ? fg('tank', { label: 'Tank ' + p.n + ', ' + p.fit.toLowerCase(), L: 'OAL ' + gv['Overall length'], D: 'OD ' + gv['Shell OD'], c: p.fit + ' end plates. Find ' + row.k + ' = ?' })
      : kind === 'truss' ? fg('truss', { label: 'Half truss ' + p.n, A: 'A = ' + gv['A rise'], B: 'B = ' + gv['B run'], E: 'E = ' + gv['E web to peak'], wx: (p.g.B - p.g.E) / p.g.B, ask: row.k })
        : fg('bend', { label: 'Formed plate ' + p.n, T: 'T = ' + gv['Plate T'], R: 'IR = ' + gv['Inside radius'], a: 'OAL to A leg ' + gv['OAL, A leg'], c: 'OAL to C leg ' + gv['OAL, C leg'], ask: row.k });
    return {
      params: { i: f.i, k: row.k, g: p.g },
      q: PKG_KIND[kind] + ' ' + p.n + (p.fit ? ', ' + p.fit.toLowerCase() : '') + '. ' + given + '. Find ' + row.k + ', ' + row.w.charAt(0).toLowerCase() + row.w.slice(1) + ',' + tail + '.',
      answers: answers, steps: steps, keys: [K(row.k, row.s, v)], fig: fig
    };
  }

  /* ---------- modules and task generators ---------- */
  var MODULES = [
    {
      id: 'dfoot', title: 'Decimals of a foot', short: 'Feet and inches to decimal feet and back, nearest 1/16", decimal inches for machines',
      why: 'Calculators and machine screens work in decimals. Drawings and tapes work in feet, inches and sixteenths. You change from one to the other many times a day.',
      lesson: 2,
      examples: [{ task: 'm111', fx: { ft: 6, inch: 4, k: 14 } }, { task: 'm112', fx: { ft: 8, d4: 3542 } }],
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
      examples: [{ task: 'm121', fx: { d: 265 } }, { task: 'm123', fx: { ft: 4, inch: 6, k: 8 } }],
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
      examples: [{ task: 'm133', fx: { ID: 245, PL: 10 } }, { task: 'm134', fx: { OD16: 960, T16: 8 } }],
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
      examples: [{ task: 'm143', fx: { L: 2440, Wd: 1220, T: 10 } }, { task: 'm145', fx: { D: 600, T: 20 } }],
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
      examples: [{ task: 'm151', fx: { L: 8, Wd: 4, H: 3.5 } }, { task: 'm154', fx: { ID: 36, Li: 72 } }],
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
      examples: [{ task: 'm162', fx: { D: 168, L: 200, t: 22.5 } }, { task: 'm164', fx: { Dm: 219, Db: 114, H: 250, phi: 60 } }],
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
    },
    {
      id: 'pkg', title: 'Fab package: trusses, formed plate and tank fit-ups', short: 'One answer at a time from the package sheets: half trusses, radiused sections, tank weights and capacities',
      why: 'These are the Metal Fab package sheets. Every answer here matches the instructor keys. Work one answer, check it, then try the next.',
      lesson: 8,
      examples: [{ task: 'm171', fx: { i: 0, k: 'C' } }, { task: 'm173', fx: { i: 0, k: 'L' } }],
      tasks: [
        { id: 'm171', level: 2, title: 'Half truss: one answer', gen: function (r, fx) { return pkgTask(r, fx, 'truss'); } },
        { id: 'm172', level: 2, title: 'Formed plate: one section', gen: function (r, fx) { return pkgTask(r, fx, 'radius'); } },
        { id: 'm173', level: 3, title: 'Tank fit-up: one answer', gen: function (r, fx) { return pkgTask(r, fx, 'tank'); } }
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
