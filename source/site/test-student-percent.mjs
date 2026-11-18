import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fractionAnswer, percentageHelp } from '../../assistant/public/percent.mjs';

test('answers the question first, with the learner’s own quantities', () => {
  for (const [question, first] of [
    ['can you help me find the percentage of 1/5? im really confused. :(', '1/5 is 20%.'],
    ['Convert 3/8 to a percentage.', '3/8 is 37.5%.'],
    ['what percent is 11 out of 8?', '11/8 is 137.5%.'],
    ['How do I convert 0/7 into a percent?', '0/7 is 0%.'],
    ['-1/3 as a percentage', '-1/3 is approximately -33.3333%.'],
    ['1/0 as a percent', '1/0 has no percentage because division by zero is undefined.'],
  ]) assert.equal(fractionAnswer(question)?.split('\n')[0], first, question);
  assert.match(fractionAnswer('and 3/4?', true), /^3\/4 is 75%\./);
});

test('gives the method without revealing the value when the learner asks for a hint', () => {
  const hint = fractionAnswer('Give me only a hint for 1/5 as a percentage');
  assert.match(hint, /dividing 1 by 5/);
  assert.doesNotMatch(hint, /20/);
});

test('recalculates a reported equation from the fraction, including a quoted wrong result', () => {
  const correct = '1/5 is 20%.';
  for (const question of [
    'it said 1/5 as a percentage is 1/5\\*100% = 100%',
    '1/5 × 100% = 100%. Is that right?',
    'Is 1/5 as a percentage 100%?',
    'What percentage is one fifth?',
    'Can you convert one fifth into a percentage?',
  ]) {
    const answer = fractionAnswer(question);
    assert.equal(answer?.split('\n')[0], correct, question);
    assert.match(answer, /1 ÷ 5 = 0\.2/);
    assert.match(answer, /0\.2 × 100 = 20/);
  }
  assert.match(fractionAnswer('The tutor said 100%. Is that right?', correct), /^1\/5 is 20%\./);
  assert.match(fractionAnswer('Why multiply by 100?', correct), /out of 100/i);
  assert.match(fractionAnswer('it said 3/8 as a percentage is 3/8*100% = 100%'), /^3\/8 is 37\.5%\./);
  assert.equal(fractionAnswer('1/5 + 3/8 as a percentage is 100%'), null);
  assert.equal(fractionAnswer('1/5 as a percentage is 3/8*100% = 100%'), null);
});

test('leaves unrelated or ambiguous problems to the model', () => {
  for (const question of ['What is 20% of 1/5?',
    '1/5 of 50 as a percentage', '1/3 as a percent rounded to one decimal place',
    'What percentage of 1/5 is 1/10?', 'what about 3/4?', 'The shift starts on 1/5.']) {
    assert.equal(fractionAnswer(question), null, question);
  }
});

test('separates multiple conversions, an explicitly requested sum, and a relative percentage', () => {
  const both = percentageHelp('What are 1/5 and 1/3 as percentages?');
  assert.match(both, /^1\/5 is 20%\.\n1\/3 is approximately 33\.3333%\./);
  assert.doesNotMatch(both, /total|sum|50%|53\./i);
  assert.match(percentageHelp('Add 1/5 and 1/3 as a percentage'), /approximately 53\.3333%/);
  assert.match(percentageHelp('What percentage of 1/5 is 1/10?'), /1\/10 is 50% of 1\/5/);
  assert.match(percentageHelp('1/3 as a percent rounded to one decimal place'), /33\.3%/);
  const report = percentageHelp('1/5 as a percentage: 1/5 * 100% = 50%\n1/3 as a percentage: 1/3 * 100% = 33.33%');
  assert.match(report, /^1\/5 is 20%/);
  assert.match(report, /1\/3 is approximately 33\.3333%/);
  assert.doesNotMatch(report, /50%/);
  const copied = percentageHelp('1/5 as a percentage: 1/5 * 100% = 50%\n1/3 as a percentage: 1/3 * 100% = 33.33%\n\nI\'m having trouble with this one. I think I need to add a percentage to the first one to get the total.');
  assert.equal(copied, report);
  assert.equal(percentageHelp("Don't add 1/5 and 1/3. Give their percentages separately."), both);
  assert.equal(percentageHelp('Convert 1/5 and 1/3 to percentages without adding them.'), both);
  assert.match(percentageHelp('What is 1/5 × 17 minus 6 as a percentage?'), /^Which calculation/);
});
