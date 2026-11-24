/* Checks for the MF140 engine (Metal Fabricator Intake 140 modules).
   For every task and many seeds: answers are finite, each shown answer passes the checker, a wrong answer fails,
   every TI-30Xa key sequence runs on the emulator and shows the value it claims, and an independent recomputation
   from the parameters agrees with the engine. Run: node source/hub/fab140/test-mf140.cjs */
'use strict';
var path = require('path');
var T = require(path.join(__dirname, '..', '..', 'calc2', 'ti30.js'));
var M = require('./mf140.js');
var PI = Math.PI, D = PI / 180, fails = 0, checks = 0;
function bad(msg) { fails++; if (fails < 40) console.log('FAIL', msg); }
function near(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); }
function r16(x) { return Math.round(x * 16) / 16; }
/* independent answers, worked again from the parameters */
var IND = {
  m111: function (p) { return [p.ft + (p.inch + p.k / 16) / 12]; },
  m112: function (p) { var i = (p.d4 / 10000) * 12; return [p.ft, r16(i)]; },
  m113: function (p) { return [p.w + r16(p.d4 / 10000)]; },
  m114: function (p) { return [p.ft * 12 + p.inch + p.k / 16]; },
  m121: function (p) { return [PI * p.d]; },
  m122: function (p) { return [r16(PI * p.d16 / 16)]; },
  m123: function (p) { var c = PI * (p.ft * 12 + p.inch + p.k / 16), n = Math.round(c * 16); return [Math.floor(n / 192), (n % 192) / 16]; },
  m124: function (p) { return [2 * p.r3 / 1000, PI * 2 * p.r3 / 1000]; },
  m131: function (p) { return [p.ID + p.PL]; },
  m132: function (p) { return [(p.OD16 - p.T16) / 16]; },
  m133: function (p) { return [p.ID + p.PL, PI * (p.ID + p.PL)]; },
  m134: function (p) { var md = (p.OD16 - p.T16) / 16, n = Math.round(PI * md * 16); return [md, Math.floor(n / 192), (n % 192) / 16]; },
  m141: function (p) { return [PI * Math.pow(p.r16 / 16, 2)]; },
  m142: function (p) { return [PI * Math.pow(p.ft + (p.inch + p.k / 16) / 12, 2)]; },
  m143: function (p) { return [p.L * p.Wd * p.T * 7.85 / 1e6]; },
  m144: function (p) { return [p.L * p.Wd * (p.T16 / 16) * 40.8 / 144]; },
  m145: function (p) { return [PI * Math.pow(p.D / 2, 2) * p.T * 7.85 / 1e6]; },
  m146: function (p) { return [(p.lf * 12 + p.li + p.lk / 16) * (p.wf * 12 + p.wi + p.wk / 16) / 144 * (p.T16 / 16) * 40.8]; },
  m151: function (p) { return [p.L * p.Wd * p.H, p.L * p.Wd * p.H * 6.25]; },
  m152: function (p) { var v = p.L * p.Wd * p.H / 1728; return [v, v * 6.25]; },
  m153: function (p) { var v = p.L * p.Wd * p.H / 1e9; return [v, v * 1000]; },
  m154: function (p) { var v = PI * p.ID * p.ID / 4 * p.Li / 1728; return [v, v * 6.25]; },
  m161: function (p) { return [PI * p.D, PI * p.D / 12]; },
  m162: function (p) { var k = p.D / 2 * Math.tan(p.t * D); return [p.L - k, p.L + k]; },
  m163: function (p) { return [p.L - p.D / 2 * Math.tan(p.t * D) * Math.cos((p.n - 1) * 30 * D)]; },
  m164: function (p) { var y = p.Db / 2 * Math.sin(p.phi * D); return [p.H - Math.sqrt(p.Dm * p.Dm / 4 - y * y)]; }
};
M.MODULES.forEach(function (m) {
  m.tasks.forEach(function (t) {
    if (!IND[t.id]) bad('no independent check for ' + t.id);
    for (var seed = 1; seed <= 400; seed++) {
      var inst = t.gen(M.makeRng(seed * 7919 + 13));
      var ind = IND[t.id] ? IND[t.id](inst.params) : [];
      inst.answers.forEach(function (a, i) {
        checks++;
        if (!isFinite(a.value)) bad(t.id + ' seed ' + seed + ' answer not finite');
        if (!M.checkOne(a, a.display).ok) bad(t.id + ' seed ' + seed + ' display "' + a.display + '" not accepted for ' + a.value);
        if (M.checkOne(a, String(a.value + Math.max(1, Math.abs(a.value) * 0.02))).ok) bad(t.id + ' seed ' + seed + ' wrong answer accepted');
        if (ind[i] != null && !near(a.value, ind[i], 1e-9)) bad(t.id + ' seed ' + seed + ' answer ' + i + ' ' + a.value + ' vs ' + ind[i]);
        if (a.kind === 'frac' && Math.abs(a.value * 16 - Math.round(a.value * 16)) > 1e-9) bad(t.id + ' fraction answer not in sixteenths');
        if (a.kind === 'frac' && t.id !== 'm113' && a.label.indexOf('nches') > 0 && a.value >= 12) bad(t.id + ' inches ≥ 12');
      });
      (inst.keys || []).forEach(function (k) {
        checks++;
        var c = new T.Calc(), d;
        try { d = c.run(k.seq); } catch (e) { bad(t.id + ' keys "' + k.seq + '": ' + e.message); return; }
        if (d.error) { bad(t.id + ' keys error "' + k.seq + '"'); return; }
        if (!near(c.value(), k.expect, 1e-8)) bad(t.id + ' seed ' + seed + ' keys "' + k.seq + '" show ' + c.value() + ', expect ' + k.expect);
      });
      if (!inst.steps.length || !inst.q) bad(t.id + ' empty question or steps');
      if (inst.fig) {
        var svg = M.draw(inst.fig);
        if (!/^<svg/.test(svg)) bad(t.id + ' no drawing');
        /* the drawing must not give the answer away */
        inst.answers.forEach(function (a) { if (a.display.length > 2 && svg.indexOf('>' + a.display + ' ' + a.unit) >= 0) bad(t.id + ' drawing shows the answer ' + a.display); });
      }
    }
  });
});
console.log(checks + ' checks, ' + fails + ' failures');
process.exit(fails ? 1 : 0);
