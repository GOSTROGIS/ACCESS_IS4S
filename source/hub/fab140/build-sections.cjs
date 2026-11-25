/* Builds the static parts of Modules 11 to 17 for the Fabrication page: the module sections with their worked
   examples, and the module index cards. Calculator screens are played on the TI-30Xa engine (source/calc2/ti30.js)
   and drawn with the hub's key chips (source/hub/conops/tikeys.js). Per-module links and notes come from presets.json.
   Usage: node build-sections.cjs   (prints JSON: { ids, sections, index }) */
'use strict';
var path = require('path');
var ROOT = path.resolve(__dirname, '..', '..');
var T = require(path.join(ROOT, 'calc2', 'ti30.js'));
global.TI30 = T;
var TK = require(path.join(ROOT, 'hub', 'conops', 'tikeys.js'));
var M = require('./mf140.js');
var DATA = require('./presets.json');

var FIRST = 11;
var GUIDE_ROOT = '../../../programs/metal-fabrication/intake-140/study-guides/';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function scHref(key) { return '../shape-canvas/#sc=' + Buffer.from(JSON.stringify(Object.assign({ v: 1 }, DATA.presets[key])), 'utf8').toString('base64url'); }
function row(href, label, text, help) {
  return '    <p class="sc-row"><a class="sc-link" href="' + href + '" target="_blank" rel="noopener" aria-label="' + esc(label) + ', in a new tab">' + text + '</a><span class="sc-help">' + help + '</span></p>\n';
}

function example(ex, j, count) {
  var inst = M.BY_ID[ex.task].gen(M.makeRng(1), ex.fx);
  /* the worked example's keys must show its answer on the calculator */
  inst.keys.forEach(function (k) {
    var c = new T.Calc();
    c.run(k.seq);
    if (Math.abs(c.value() - k.expect) > 1e-8 * Math.max(1, Math.abs(k.expect))) throw new Error(ex.task + ' example keys ' + k.seq);
  });
  var answers = inst.answers.map(function (a) {
    return '<p class="ex-answer">' + esc(a.label) + ': <strong class="fig">' + esc(a.display) + '</strong>' + (a.unit ? ' ' + esc(a.unit) : '') + '</p>';
  }).join('');
  return '  <div class="example">\n' +
    (inst.fig ? '  <figure class="paper">' + M.draw(inst.fig) + '</figure>\n' : '') +
    '  <div class="example-body">\n' +
    '    <h3 class="h-example">Worked example' + (count > 1 ? ' ' + j : '') + '</h3>\n' +
    '    <p class="ex-q">' + esc(inst.q) + '</p>\n' +
    '    <ol class="steps">' + inst.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>\n' +
    '    ' + answers + '\n' +
    '      ' + TK.html(inst.keys) + '\n' +
    '  </div>\n' +
    '</div>\n';
}

var sections = '', index = '';
M.MODULES.forEach(function (m, i) {
  var n = FIRST + i, d = DATA.modules[m.id];
  var worked = m.examples.map(function (ex, j) { return example(ex, j + 1, m.examples.length); }).join('');
  sections += '\n<section class="module" id="m-' + m.id + '" aria-labelledby="m-' + m.id + '-h">\n' +
    '  <header class="module-head">\n' +
    '    <p class="eyebrow">Module ' + n + '</p>\n' +
    '    <h2 id="m-' + m.id + '-h">' + esc(m.title) + '</h2>\n' +
    '    <p class="why">' + esc(m.why) + '</p>\n' +
    '    <p class="shop-note">' + esc(d.note) + '</p>\n' +
    row(scHref(d.sc), 'Open ' + d.scLabel + ' in Shape Canvas', 'Open in Shape Canvas', 'Opens the shape at these sizes on a new canvas page.') +
    row(GUIDE_ROOT + d.guide + '.html', 'Open the Intake 140 study guide for this lesson', d.guideText || 'Study guide with audio', d.guideHelp || 'Metal Fabricator Intake 140, lesson ' + m.lesson + '.') +
    '    <p class="shop-note"><strong>Watch out:</strong> ' + esc(d.watch) + '</p>\n' +
    '  </header>\n' + worked +
    '  <div class="practice-head"><h3>Practice</h3><p class="practice-count" data-module-count="' + m.id + '">' + m.tasks.length + ' tasks</p></div>\n' +
    '  <div class="task-grid" data-module="' + m.id + '"></div>\n' +
    '</section>\n';
  index += '<li><a class="idx-card" href="#m-' + m.id + '">\n' +
    '  <span class="idx-num">' + n + '</span>\n' +
    '  <span class="idx-text"><span class="idx-title">' + esc(m.title) + '</span><span class="idx-short">' + esc(m.short) + '</span>\n' +
    '  <span class="idx-prog"><span class="meter" aria-hidden="true"><span class="meter-fill" data-meter="' + m.id + '"></span></span><span class="idx-count" data-idx-count="' + m.id + '">0 of ' + m.tasks.length + ' solved</span></span></span>\n' +
    '</a></li>\n';
});
process.stdout.write(JSON.stringify({ ids: M.MODULES.map(function (m) { return m.id; }), sections: sections, index: index }));
