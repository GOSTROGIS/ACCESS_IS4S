import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {definedTerms, findPassages} from '../../assistant/public/retrieve.mjs';

const file = new URL('../../assistant/public/lessons.json', import.meta.url);
const {lessons} = JSON.parse(readFileSync(file, 'utf8'));

test('a shared incidental word cannot attach an unrelated lesson to a question', () => {
  // The SI prefix lesson talks about capital letters, not the capital of Canada.
  assert.deepEqual(findPassages(lessons, 'What is the capital of Canada?', null), []);
});

test('retrieval keeps the actionable instruction with the matching passage', () => {
  const question = 'How should I ask my supervisor to clarify a confusing instruction?';
  const [source] = findPassages(lessons, question, null);
  assert.match(source.url, /listen-and-repeat-back/);
  assert.match(source.text, /say it back/i);
  assert.match(source.text, /is that right\?/i);
});

test('both halves of a comparison come from the actual learner text', () => {
  const question = 'What is the difference between gross pay and net pay?';
  const sources = findPassages(lessons, question, null);
  assert.match(sources[0].url, /pay-stub/);
  assert.equal(definedTerms(question, sources),
    'Gross pay is what you earned before anything is taken off. Net pay is what lands in your bank account.');
});
