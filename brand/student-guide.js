/* ACCESS learner help. The public study guide reads only this published page. */
(() => {
  'use strict';
  const main = document.querySelector('main');
  const script = document.currentScript;
  if (!main || !script || document.getElementById('access-student-guide')) return;
  const base = new URL('../', script.src);
  const current = new URL(location.href);
  if (base.origin !== current.origin || !current.pathname.startsWith(base.pathname)) return;
  const relative = current.pathname.slice(base.pathname.length).replace(/(^|\/)$/, '$1index.html');
  const learnerPage = /^(?:index\.html|skills\/[a-z0-9-]+\/(?:lessons\/[a-z0-9-]+\/|ai-literacy\/)?(?:learner|index)\.html)$/;
  if (!learnerPage.test(relative)) return;
  const panel = document.createElement('details'); panel.id = 'access-student-guide';
  const summary = document.createElement('summary'); summary.textContent = 'Student learning guide';
  const instructions = document.createElement('p');
  instructions.textContent = 'Search this learner page for a word or topic, then try a short practice step.';
  const form = document.createElement('form');
  const label = document.createElement('label'); label.htmlFor = 'access-study-question'; label.textContent = 'What are you working on? ';
  const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'search'; input.maxLength = 240;
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Find help on this page';
  form.append(label,input,' ',submit);
  const result = document.createElement('div'); result.setAttribute('aria-live','polite');
  panel.append(summary,instructions,form,result);
  const lede = document.querySelector('.lede')?.textContent.trim() || '';
  const sections = Array.from(main.querySelectorAll('p,li,td,dd'))
    .filter(node => !node.closest('header,nav,footer,#downloads') && !node.querySelector('ul,ol,p,table'))
    .map(node => node.textContent.replace(/\s+/g,' ').trim()).filter(text => text.length >= 45 &&
      !/instructor code|teaching chapter|answer guidance|download .*zip/i.test(text));
  if (lede) sections.unshift(lede);
  const learnerLinks = Array.from(main.querySelectorAll('a[href]')).map(node => {
    const url = new URL(node.href);
    return {url, label:node.textContent.trim()};
  }).filter(({url,label})=>url.origin===base.origin && url.pathname.startsWith(base.pathname) &&
    learnerPage.test(url.pathname.slice(base.pathname.length).replace(/\/$/,'/index.html')) &&
    url.pathname !== current.pathname && label && !/instructor|answer|teaching/i.test(label));
  const terms = text => [...new Set((text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(t=>
    t.length > 2 && !['the','and','are','what','how','this','that','can','with','for','about','help'].includes(t)))];
  const score = (a,b) => a.filter(term=>b.includes(term)).length;
  function show(query) {
    const wanted = terms(query);
    const snippets = sections.map((text,i)=>({text,i,score:score(wanted,terms(text))})).sort((a,b)=>b.score-a.score || a.i-b.i);
    result.replaceChildren();
    function line(text) { const p = document.createElement('p'); p.textContent = text; result.append(p); }
    const isLesson = relative.endsWith('/learner.html');
    const found = snippets.find(s=>s.score>0);
    const selected = found?.text || (!wanted.length && snippets[0]?.text);
    if (selected) {
      line('From this page');
      const quote = document.createElement('blockquote');
      quote.textContent = selected.length > 680 ? selected.slice(0,675).replace(/\s+\S*$/,'')+'…' : selected;
      result.append(quote);
      line('Try one step: pick a detail from that passage. In your own words, say how you would use it in the task.');
    } else {
      line(wanted.length ? 'I couldn’t find those words on this page. Try a term from a heading, or open a related learner page below.' :
        'Choose a learner page or enter a word from your assignment.');
    }
    const choices = learnerLinks.map((link,i)=>({...link,i,score:score(wanted,terms(link.label+' '+link.url.pathname.replaceAll('-',' ')))}))
      .sort((a,b)=>b.score-a.score || a.i-b.i);
    const seen = new Set();
    for (const choice of choices) {
      if (seen.has(choice.url.href) || (isLesson && !choice.score) || seen.size===3) continue;
      const p = document.createElement('p'), a = document.createElement('a');
      a.href = choice.url.href; a.textContent = choice.label; p.append(a); result.append(p); seen.add(choice.url.href);
    }
  }
  form.addEventListener('submit', event=>{event.preventDefault(); show(input.value.trim());});
  panel.addEventListener('toggle',()=>{if(panel.open && !result.childElementCount)show('');});
  let chat;
  if (['127.0.0.1','localhost','[::1]'].includes(location.hostname)) {
    chat = new URL('http://127.0.0.1:11436/student/');
  } else {
    const configured = document.querySelector('meta[name="access-student-guide-url"]')?.content;
    if (configured) {
      try {
        const approved = new URL(configured);
        if (approved.protocol==='https:' && !approved.username && !approved.password) chat=approved;
      } catch { /* The study guide works without a hosted chat endpoint. */ }
    }
  }
  if (chat) {
    const assistant = main.querySelector('[data-assistant-link]');
    if (assistant) assistant.href = chat.href;
    const p = document.createElement('p'), a = document.createElement('a');
    if(relative !== 'index.html') chat.searchParams.set('lesson',relative);
    a.href=chat.href; a.rel='noopener noreferrer'; a.target='_blank'; a.textContent='Ask the student tutor';
    p.append(a); panel.append(p);
  }
  const anchor=main.querySelector('#hub-tools-help') || main.querySelector('#access-studio');
  if(anchor) anchor.after(panel); else main.prepend(panel);
})();
