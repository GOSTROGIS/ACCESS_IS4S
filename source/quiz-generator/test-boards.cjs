'use strict';
/* Build-time check for the game's skill boards (programs/carpentry/intake-142/Quizzes/boards/*.js).
   Each file must register one board that the game engine accepts with no skipped questions,
   so learners never see an "incomplete board" note. Run: node source/quiz-generator/test-boards.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '../../programs/carpentry/intake-142/Quizzes');
const engine = require(path.join(dir, 'jeopardy-engine.js'));
const SKILLS = ['reading', 'writing', 'numeracy', 'digital', 'problem-solving', 'communication', 'collaboration', 'adaptability', 'creativity-innovation'];
const settings = engine.normalizeSettings({});
const allIds = new Set();
let questions = 0;
for (const skill of SKILLS) {
  const file = path.join(dir, 'boards', skill + '.js');
  assert.ok(fs.existsSync(file), 'missing board file boards/' + skill + '.js');
  const win = { JEOPARDY_BOARDS: [] };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: win });
  assert.equal(win.JEOPARDY_BOARDS.length, 1, skill + ' must register exactly one board');
  const board = win.JEOPARDY_BOARDS[0], count = board.questions.length;
  assert.equal(board.id, 'SK-' + skill.toUpperCase(), skill + ' board id');
  assert.equal(board.skill, skill, skill + ' board skill key');
  const checked = engine.validateBoard(board);
  assert.ok(checked.ok, skill + ' board is not playable');
  assert.deepEqual(checked.problems, [], skill + ' has unreadable questions: ' + checked.problems.join(', '));
  assert.equal(board.questions.length, count, skill + ' lost questions in validation');
  for (const category of board.categories) {
    const levels = new Set(board.questions.filter(q => q.category === category).map(q => q.level));
    assert.ok(board.questions.filter(q => q.category === category).length >= 8, skill + ' / ' + category + ' needs at least 8 questions');
    for (const level of [1, 2, 3, 4, 5]) assert.ok(levels.has(level), skill + ' / ' + category + ' has no level ' + level + ' question');
  }
  for (const q of board.questions) {
    assert.ok(!allIds.has(q.id), 'duplicate question id ' + q.id); allIds.add(q.id);
    assert.ok(q.id.startsWith(board.id + '-'), q.id + ' should start with ' + board.id);
    assert.ok(q.reference, q.id + ' needs a reference');
    if (q.type === 'choice') assert.equal(new Set(q.choices).size, q.choices.length, q.id + ' has repeated choices');
    else assert.ok(!(q.answer !== Number(q.answer.toFixed(6)) && Math.abs(q.answer - Number(q.answer.toFixed(6))) < 1e-9), q.id + ' has floating-point noise');
    if (q.image) assert.ok(fs.existsSync(path.join(dir, q.image)) || fs.existsSync(path.join(dir, 'assets', q.image + '.png')), q.id + ' image is missing');
    questions++;
  }
  const a = engine.makeBoard(board, 'CHECK1', settings), b = engine.makeBoard(board, 'CHECK1', settings);
  assert.deepEqual(a, b, skill + ' board must deal the same way for the same seed');
  assert.equal(a.length, settings.columns * settings.rows, skill + ' should deal a full board');
}
console.log('PASS: ' + SKILLS.length + ' skill boards, ' + questions + ' questions.');
