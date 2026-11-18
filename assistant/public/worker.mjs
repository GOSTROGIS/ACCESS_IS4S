import { Wllama } from './vendor/wllama.mjs?v=2.3.7';
import { definedTerms } from './retrieve.mjs';

const modelFile = new URL('./vendor/SmolLM2-135M-Instruct-Q4_0.gguf', import.meta.url);
const wasmFile = new URL('./vendor/wllama.wasm?v=2.3.7', import.meta.url);
const modelBytes = 91893088;
const modelDigest = 'bcc3af2849ad6095af57e9b5cd43775256efdc66e306acb529172f92d0c04b03';
const cacheName = 'access-learning-model-' + modelDigest;
const contextSize = 2048;
const maxAnswerTokens = 144;
let model;
let busy = false;

async function modelBlob(send) {
  // Cache only the public model. A learner's question and answer stay in memory.
  const cache = await self.caches?.open(cacheName).catch(() => undefined);
  const cached = await cache?.match(modelFile.href);
  const response = cached || await fetch(modelFile, {credentials:'omit'});
  if (!response.ok || !response.body) throw Error('Could not download the learning model. Please try again.');
  const bytes = new Uint8Array(modelBytes);
  const reader = response.body.getReader();
  let loaded = 0;
  let lastUpdate = 0;
  send({type:'progress', loaded, total:modelBytes});
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    if (loaded + value.length > bytes.length) {
      await reader.cancel();
      throw Error('The learning model is larger than expected. Please reload the page.');
    }
    bytes.set(value, loaded);
    loaded += value.length;
    if (loaded - lastUpdate >= 1024 * 1024 || loaded === modelBytes) {
      send({type:'progress', loaded, total:modelBytes});
      lastUpdate = loaded;
    }
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (loaded !== modelBytes || Array.from(digest, v => v.toString(16).padStart(2, '0')).join('') !== modelDigest) {
    await cache?.delete(modelFile.href);
    throw Error('The downloaded model failed verification. Please try again.');
  }
  const blob = new Blob([bytes]);
  if (cache && !cached) await cache.put(modelFile.href, new Response(blob)).catch(() => {});
  return blob;
}

async function getModel(send) {
  if (model) return model;
  const weights = await modelBlob(send);
  const engine = new Wllama({'single-thread/wllama.wasm': wasmFile.href}, {suppressNativeLog:true});
  try {
    await engine.loadModel([weights], {n_threads:1, n_ctx:contextSize, n_batch:128, seed:37});
  } catch (error) {
    await engine.exit().catch(() => {});
    throw error;
  }
  model = engine;
  return model;
}

function plain(value, limit) {
  return typeof value === 'string' ? value.replace(/<\|[^|]{0,48}\|>/g, '').trim().slice(0,limit) : '';
}

function wantsHint(question) {
  return /\b(?:hints?\s+(?:only|please)|(?:a|one|some|another)\s+(?:hints?|clue)\b|(?:give|show|offer)\s+me\s+hints?\b|without\s+(?:giving|telling)\s+(?:me\s+)?the\s+answer)/i.test(question) &&
    !/\b(?:do not|don't|don’t|no longer)\s+(?:want|need|give me)\s+(?:a\s+)?(?:hints?|clue)\b/i.test(question);
}

function learnerPrompt(question, sources, history, requestedHint, comparison) {
  const rows = (Array.isArray(sources) ? sources.slice(0,2) : []).filter(Boolean);
  if (requestedHint) {
    // The tiny model will often repeat a solution that appears in its context.
    // Give it the topic and the learner's question so it can suggest a method.
    const topics = rows.map(row => plain(row.title,100)).filter(Boolean).join('; ');
    let skill = 'reading';
    let method = 'Scan the headings or labels for a keyword from the question, then read the sentence around it.';
    if (/\b(?:calculat\w*|fraction|percent|divide|multiply|formula)\b/i.test(question)) {
      skill = 'numeracy';
      method = 'List the given quantities with their units and identify the operation that connects them.';
    } else if (/\b(?:write|draft|revise|writing|rewrite)\b/i.test(question)) {
      skill = 'writing';
      method = 'Identify who will read the document and the main point they need to understand.';
    }
    return '<|im_start|>system\nGive exactly one practical '+skill+' hint without revealing the answer.<|im_end|>\n' +
      '<|im_start|>user\nSuggested '+skill+' method: '+method+'\nLesson: '+topics+'\nStudent: '+question+'<|im_end|>\n<|im_start|>assistant\n';
  }
  // For comparisons, ask the model to read the best-matching definition first.
  // A worked example of a different pair can distract this small model.
  if (rows.length && comparison) {
    const passage = plain(rows[0].text,1000);
    return '<|im_start|>system\nAnswer questions using only the given passage. For a comparison, explain each term in one sentence. Copy the definitions exactly. Do not write a formula.<|im_end|>\n' +
      '<|im_start|>user\nText:\n'+passage+'\n\nQuestion: '+question+'<|im_end|>\n<|im_start|>assistant\n';
  }
  const system = 'Answer the question directly in plain English. Use only the facts given in the passage. Copy names and numbers exactly. Keep your answer short. Do not guess.';
  const turns = (Array.isArray(history) ? history.slice(-2) : []).filter(turn =>
    turn && ['user','assistant'].includes(turn.role) && plain(turn.content,400));
  const passages = rows
    .map(source => [plain(source.title,100), plain(source.text,850)].filter(Boolean).join('\n')).filter(Boolean);
  const messages = [
    {role:'system',content:system},
    {role:'user',content:'Passage: To request a shift change, send your supervisor an email.\nQuestion: Who do I email to change shifts?'},
    {role:'assistant',content:'Email your supervisor.'},
    ...turns.map(turn => ({role:turn.role, content:plain(turn.content,400)}))
  ];
  const reference = passages.length ? 'Passage: '+passages.join('\n\n')+'\n' : '';
  messages.push({role:'user',content:reference+'Question: '+question});
  return messages.map(m=>'<|im_start|>'+m.role+'\n'+m.content+'<|im_end|>\n').join('')+'<|im_start|>assistant\n';
}

self.onmessage = async ({data}) => {
  if (!data || data.type !== 'ask') return;
  const send = message => self.postMessage({...message, id:data.id});
  if (busy) return send({type:'error',message:'Please wait for the current answer to finish.'});
  const question = plain(data.question,2000);
  if (!question) return send({type:'error',message:'Enter a learning question.'});
  busy = true;
  try {
    const hint = wantsHint(question);
    const sources = Array.isArray(data.sources) ? data.sources.filter(row => typeof row?.text === 'string') : [];
    const definition = !hint && definedTerms(question, sources);
    if (definition) return send({type:'done',text:definition});
    const comparison = !hint && /\b(?:compar(?:e|ing)|contrast|versus|vs|differences? between)\b/i.test(question) && !/\d/.test(question);
    if (comparison && !sources.length) {
      return send({type:'done',text:'I could not find a supporting passage. Which lesson or passage are you comparing?'});
    }
    const engine = await getModel(send);
    let prompt = learnerPrompt(question, sources, data.history, hint, comparison);
    if ((await engine.tokenize(prompt)).length + maxAnswerTokens + 2 > contextSize) {
      prompt = learnerPrompt(question, [], [], hint, false);
      if ((await engine.tokenize(prompt)).length + maxAnswerTokens + 2 > contextSize) {
        throw Error('Please shorten your question so it fits the learning model.');
      }
    }
    const decoder = new TextDecoder();
    const stop = new AbortController();
    const answer = await engine.createCompletion(prompt, {
      nPredict:hint ? 64 : maxAnswerTokens, sampling:{temp:0, penalty_repeat:1}, abortSignal:stop.signal,
      onNewToken(_token, bytes, currentText) {
        const text = decoder.decode(bytes, {stream:true});
        if (text && !comparison) send({type:'token',text});
        if (hint && /[.!?]\s*$/.test(currentText)) stop.abort();
      }
    });
    const remainder = decoder.decode();
    if (remainder && !comparison) send({type:'token',text:remainder});
    if (comparison) {
      // Verify extracted comparison sentences before displaying them. A small
      // model can reverse a relationship even with the correct lesson in view.
      const sentences = text => text.match(/[^.!?]+[.!?](?=\s|$)/g)?.map(s=>s.trim()) || [];
      const evidence = sentences(sources[0].text);
      const response = sentences(answer);
      if (response.length && response.join(' ') === answer.trim() && response.every(s=>evidence.includes(s))) {
        return send({type:'done',text:answer.trim()});
      }
      const quote = evidence.slice(0,2).join(' ');
      const text = 'I couldn’t verify a direct comparison in this lesson.' + (quote ? '\n\nFrom the lesson: “'+quote+'”' : '');
      return send({type:'done',text});
    }
    if (!answer.trim()) throw Error('The model returned an empty answer. Please rephrase the question.');
    send({type:'done',text:answer.trim()});
  } catch (error) {
    send({type:'error',message:error instanceof Error ? error.message : 'The learning model could not run in this browser.'});
  } finally { busy = false; }
};
