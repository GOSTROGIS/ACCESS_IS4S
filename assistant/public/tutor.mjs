import { fractionAnswer } from './percent.mjs';
import { definedTerms, findPassages } from './retrieve.mjs';

const byId = id => document.getElementById(id);
const form = byId('ask'), input = byId('question'), status = byId('status');
const send = byId('send'), stop = byId('stop'), log = byId('conversation');
const root = new URL('../../', import.meta.url);
const lesson = new URL(location.href).searchParams.get('lesson');
const history = [];
let nextId = 0, active, worker, corpus, lastConversion = false;

function bubble(label, text, role) {
  const box = document.createElement('section'), heading = document.createElement('h2');
  const body = document.createElement('div');
  box.className = 'turn ' + role;
  heading.textContent = label;
  body.className = 'message';
  body.textContent = text;
  box.append(heading, body);
  log.append(box);
  return body;
}

function showSources(body, sources) {
  if (!sources.length) return;
  const details = document.createElement('details'), summary = document.createElement('summary');
  const list = document.createElement('ul');
  summary.textContent = 'Related ACCESS lessons';
  for (const source of sources) {
    const item = document.createElement('li'), link = document.createElement('a');
    link.href = new URL(source.url, root).href;
    link.textContent = source.title;
    item.append(link);
    list.append(item);
  }
  details.append(summary, list);
  body.after(details);
}

function finish(message) {
  active = null;
  status.textContent = message;
  send.disabled = false;
  stop.hidden = true;
  input.readOnly = false;
}

function remember(question, answer) {
  history.push({role: 'user', content: question}, {role: 'assistant', content: answer});
  if (history.length > 6) history.splice(0, 2);
}

function discardWorker() {
  worker?.terminate();
  worker = undefined;
}

function fail(message) {
  if (!active) return;
  active.body.textContent = message;
  input.value = active.question;
  discardWorker();
  finish('You can edit your question and try again.');
}

function modelWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.mjs?v=2', import.meta.url), {type: 'module'});
  worker.onerror = () => fail('The language model could not start in this browser. Try a current browser with WebAssembly enabled.');
  worker.onmessage = ({data}) => {
    if (!active || data.id !== active.id) return;
    if (data.type === 'progress') {
      status.textContent = data.total && data.loaded < data.total ?
        'Loading the language model… ' + Math.floor(100 * data.loaded / data.total) + '%' : 'Preparing your answer…';
    } else if (data.type === 'token') {
      active.body.append(document.createTextNode(data.text));
      status.textContent = 'Writing the answer…';
    } else if (data.type === 'done') {
      if (!data.text?.trim()) return fail('The model returned an empty answer.');
      active.body.textContent = data.text;
      remember(active.question, data.text);
      showSources(active.body, active.sources);
      finish('Answer ready.');
    } else if (data.type === 'error') {
      fail(data.message || 'The model could not finish this answer.');
    }
  };
  return worker;
}

async function lessons() {
  if (!corpus) corpus = fetch(new URL('./lessons.json', import.meta.url)).then(async response => {
    if (!response.ok) throw new Error('Could not load the learner materials.');
    return (await response.json()).lessons;
  }).catch(error => { corpus = undefined; throw error; });
  return corpus;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || active) return;
  bubble('You', question, 'learner');
  const body = bubble('Learning guide', '', 'assistant');
  const id = ++nextId;
  active = {id, question, body, sources: []};
  input.value = '';
  const answer = fractionAnswer(question, lastConversion);
  lastConversion = answer !== null;
  if (answer) {
    body.textContent = answer;
    remember(question, answer);
    finish('Answer ready.');
    return;
  }
  send.disabled = true;
  stop.hidden = false;
  input.readOnly = true;
  status.textContent = 'Opening the learner materials…';
  try {
    const rows = await lessons();
    if (active?.id !== id) return;
    // A short follow-up can rely on the last turn. Don't mix an independent
    // question with a previous exercise that happened to use different numbers.
    const followup = /^(?:and\b|what about\b|how about\b|why[?.!]*$|explain that\b|tell me more\b)|\b(?:that answer|your answer|the previous|it again|those steps)\b/i.test(question);
    const previous = followup ? history.slice(-2) : [];
    const search = previous.length ? previous[0].content + ' ' + question : question;
    // A learner may supply a scenario and then ask about it. Mixing another
    // lesson's example into that scenario can substitute the wrong time or place.
    const givenCase = /[.!]\s+(?:who|what|when|where|which|how|why)\b/i.test(question);
    active.sources = givenCase ? [] : findPassages(rows, search, lesson);
    const definition = definedTerms(question, active.sources);
    if (definition) {
      body.textContent = definition;
      remember(question, definition);
      showSources(body, active.sources);
      finish('Answer ready.');
      return;
    }
    status.textContent = 'Loading the language model…';
    modelWorker().postMessage({type: 'ask', id, question, sources: active.sources, history:previous});
  } catch (error) {
    if (active?.id === id) fail(error.message || 'Could not open the assistant.');
  }
});
stop.addEventListener('click', () => {
  if (!active) return;
  discardWorker();
  if (!active.body.textContent) active.body.textContent = 'Stopped.';
  input.value = active.question;
  finish('Stopped. You can edit your question and ask again.');
  input.focus();
});
send.disabled = false;
