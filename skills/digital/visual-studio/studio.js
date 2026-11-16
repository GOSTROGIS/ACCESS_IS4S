import {renderDiagram} from './diagram.js';
import {mountShotPlanner} from './shot-planner.js';
import {mountSourceLibrary} from './source-library.js';

const STORAGE = 'access-is4s-visual-studio-v1';
const $ = id => document.getElementById(id);
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const audiences = {learners:'new learners', facilitators:'facilitators', community:'community visitors'};
const media = {notice:'A visual notice', diagram:'A labelled diagram', video:'A short video'};
const layouts = {groups:'Small groups', rows:'Rows', horseshoe:'Horseshoe'};
const visualNames = {scene:'Illustrated setting', detail:'Prototype close-up', plan:'Your room diagram', notice:'Event notice'};
const defaults = () => ({version:1, audience:'learners',purpose:'Find the room and join the demonstration.',medium:'notice',layout:'groups',people:12,labels:true,dimensions:true,route:true,frames:[{visual:'scene',caption:'Welcome to Community Learning Day.',seconds:5},{visual:'plan',caption:'Find the entrance, then choose a seat facing the demonstration.',seconds:5},{visual:'notice',caption:'Training room A · Tuesday · 10:00–12:00.',seconds:5}],answers:{},reflection:''});
const STEPS = ['brief','diagram','shot','story','review','sources'];
const shotPlanner = mountShotPlanner($('shot-workshop'));
mountSourceLibrary($('source-library')).catch(()=>{$('source-library').textContent='The local tool library could not be opened. Check that the whole Digital pack is available.';});

// Only import the known schema. User content is always inserted as text or escaped.
function validate(raw) {
  if (!raw || raw.version !== 1 || !Object.hasOwn(audiences,raw.audience) || !Object.hasOwn(media,raw.medium) || !Object.hasOwn(layouts,raw.layout)) throw Error('This is not a supported IS4S studio project.');
  if (typeof raw.purpose !== 'string' || raw.purpose.length > 400 || typeof raw.reflection !== 'string' || raw.reflection.length > 1500 || ![8,12,16,24].includes(raw.people)) throw Error('The project contains invalid brief or room settings.');
  for (const key of ['labels','dimensions','route']) if(typeof raw[key] !== 'boolean') throw Error('The room options are invalid.');
  if (!Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > 6) throw Error('A storyboard needs 1–6 frames.');
  const frames = raw.frames.map(frame => {
    if(!frame || !Object.hasOwn(visualNames,frame.visual) || typeof frame.caption !== 'string' || frame.caption.length > 240 || !Number.isInteger(frame.seconds) || frame.seconds < 2 || frame.seconds > 20) throw Error('One of the storyboard frames is invalid.');
    return {visual:frame.visual,caption:frame.caption,seconds:frame.seconds};
  });
  const answers = {};
  const allowed = {capacity:['image','measured'],time:['brief','guess'],clarity:['polish','test']};
  for(const [key,values] of Object.entries(allowed)) if(values.includes(raw.answers?.[key])) answers[key]=raw.answers[key];
  return {version:1,audience:raw.audience,purpose:raw.purpose,medium:raw.medium,layout:raw.layout,people:raw.people,labels:raw.labels,dimensions:raw.dimensions,route:raw.route,frames,answers,reflection:raw.reflection,...(raw.shot===undefined?{}:{shot:shotPlanner.validate(raw.shot)})};
}

let state = defaults();
let initialMessage = 'Your work stays in this browser.';
try {
  const saved = localStorage.getItem(STORAGE);
  if(saved) {state=validate(JSON.parse(saved));initialMessage='Your previous studio work is restored.';}
} catch {initialMessage='Browser save unavailable or unreadable. Download your work to keep it.';}
let previewTimer = null;
let activeFrame = 0;
let playing = false;

function save() {
  try {localStorage.setItem(STORAGE,JSON.stringify(state));$('save-status').textContent='Saved in this browser. Download a copy to keep it.';}
  catch {$('save-status').textContent='Browser save unavailable. Download your project to keep your work.';}
}
function download(content, filename, type) {
  const blob = new Blob([content],{type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('file-status').textContent=`Downloaded ${filename}. Open it to check your saved work.`;
}
function projectDownload() {download(JSON.stringify({...state,shot:shotPlanner.getState()},null,2),'is4s-visual-studio.json','application/json');}
function briefText() {
  const needs = {learners:'Use welcoming, plain language. Show where to go and what happens next.',facilitators:'Make the sequence and room arrangement clear. Confirm supplies and check the real space.',community:'Explain what visitors will see, where to arrive and whom to ask for help.'};
  const checks = {notice:'Keep the time and place readable. Give images a useful text alternative.',diagram:'Label the entry, seating and demonstration. Check measurements before making a real plan.',video:'Keep one idea in each frame. Include captions and an equivalent text version.'};
  const goal = state.purpose.trim() || '[add the action you want people to take]';
  return {title:`${media[state.medium]} for ${audiences[state.audience]}`,text:`Create ${media[state.medium].toLowerCase()} for ${audiences[state.audience]}. The goal: ${goal}${/[.!?]$/.test(goal)?'':'.'} Use the fictional Community Learning Day: Tuesday, 10:00–12:00, Training room A, with a birdhouse demonstration. ${needs[state.audience]}`,check:checks[state.medium]};
}
function renderBrief() {
  const brief=briefText();
  $('brief-output-title').textContent=brief.title;$('brief-output-text').textContent=brief.text;$('brief-output-check').textContent=brief.check;
}
function renderRoom() {
  $('room-diagram').innerHTML=renderDiagram(state);
  $('diagram-summary').textContent=`${state.people} learners · ${layouts[state.layout]} · ${state.dimensions?'Example dimensions shown':'Dimensions hidden'}`;
}
function noticeSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" role="img" aria-label="Fictional Community Learning Day notice: Tuesday, 10 to 12, Training room A"><rect width="600" height="400" fill="#F7F4F1"/><rect x="0" y="0" width="14" height="400" fill="#FFBC00"/><text x="48" y="68" fill="#B5141B" font-family="Arial,sans-serif" font-size="18" font-weight="bold">ACCESS IS4S · PRACTICE NOTICE</text><text x="48" y="144" fill="#1A1512" font-family="Arial,sans-serif" font-size="46" font-weight="bold">Community</text><text x="48" y="197" fill="#1A1512" font-family="Arial,sans-serif" font-size="46" font-weight="bold">Learning Day</text><path d="M48 228H552" stroke="#D8CDBA"/><text x="48" y="274" fill="#1A1512" font-family="Arial,sans-serif" font-size="26">Tuesday · 10:00–12:00</text><text x="48" y="319" fill="#1A1512" font-family="Arial,sans-serif" font-size="26">Training room A</text><text x="48" y="366" fill="#625D58" font-family="Arial,sans-serif" font-size="17">Fictional classroom event</text></svg>`;
}
function visualHTML(visual) {
  if(visual==='scene') return '<img src="assets/learning-day.png" alt="Generated illustration of a fictional learning day in a training room.">';
  if(visual==='detail') return '<img src="assets/prototype-detail.png" alt="AI-generated close-up illustration of a wooden birdhouse prototype and pencil sketch. Not a construction plan.">';
  if(visual==='plan') return renderDiagram(state);
  return noticeSVG();
}
function renderTiming() {
  const total=state.frames.reduce((sum,f)=>sum+f.seconds,0);
  $('story-total').textContent=`${total} seconds`;
  $('frame-count').textContent=`· ${state.frames.length} ${state.frames.length===1?'frame':'frames'}`;
  $('timeline').innerHTML=state.frames.map((f,i)=>`<span style="flex:${f.seconds}" aria-hidden="true">${i+1} · ${f.seconds}s</span>`).join('');
  $('timeline').setAttribute('aria-label',`Storyboard: ${state.frames.map((f,i)=>`frame ${i+1}, ${f.seconds} seconds`).join('; ')}. Total ${total} seconds.`);
  $('add-frame').disabled=state.frames.length>=6;
}
function renderFrames() {
  $('story-frames').innerHTML=state.frames.map((frame,i)=>`<article class="story-frame" data-index="${i}"><div class="frame-heading"><h3>Frame ${i+1}</h3><button type="button" class="quiet" data-action="remove" ${state.frames.length===1?'disabled':''} aria-label="Remove frame ${i+1}">Remove</button></div><div class="frame-visual">${visualHTML(frame.visual)}</div><label for="visual-${i}">Visual</label><select id="visual-${i}" data-field="visual">${Object.entries(visualNames).map(([value,label])=>`<option value="${value}" ${frame.visual===value?'selected':''}>${label}</option>`).join('')}</select><label for="caption-${i}">Caption</label><textarea id="caption-${i}" data-field="caption" rows="3" maxlength="240">${escape(frame.caption)}</textarea><label for="seconds-${i}">Time on screen</label><div class="frame-duration"><input id="seconds-${i}" type="number" min="2" max="20" step="1" data-field="seconds" value="${frame.seconds}"><span>seconds</span></div><div class="frame-actions"><button type="button" class="secondary" data-action="earlier" ${i===0?'disabled':''} aria-label="Move frame ${i+1} earlier">← Earlier</button><button type="button" class="secondary" data-action="later" ${i===state.frames.length-1?'disabled':''} aria-label="Move frame ${i+1} later">Later →</button></div></article>`).join('');
  renderTiming();
}
function stopPreview(hide=true) {
  clearTimeout(previewTimer);previewTimer=null;playing=false;
  $('play-story').textContent='Preview sequence';
  if(hide) $('preview').hidden=true;
}
function showFrame() {
  const frame=state.frames[activeFrame];
  $('preview-position').textContent=`Frame ${activeFrame+1} of ${state.frames.length} · ${frame.seconds} seconds`;
  $('preview-visual').innerHTML=visualHTML(frame.visual);$('preview-caption').textContent=frame.caption || '(No caption yet)';
  previewTimer=setTimeout(()=>{
    if(activeFrame+1<state.frames.length) {activeFrame++;showFrame();}
    else {stopPreview(false);$('preview-position').textContent='Sequence complete';}
  },frame.seconds*1000);
}
function showStep(step,focus=true) {
  if(!STEPS.includes(step)) return;
  stopPreview();
  for(const id of STEPS) $(id).hidden=id!==step;
  document.querySelectorAll('[data-step]').forEach(button=>{
    if(button.dataset.step===step) button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
  });
  if(step==='story') renderFrames();
  if(location.hash.slice(1)!==step) history.replaceState(null,'',`#${step}`);
  if(focus) {$('activity').focus();$('activity').scrollIntoView({block:'start',behavior:'instant'});}
}
function renderAll() {
  if(state.shot) {shotPlanner.setState(state.shot);delete state.shot;}
  for(const key of ['audience','purpose','medium','layout','people','reflection']) $(key).value=state[key];
  for(const key of ['labels','dimensions','route']) $(key).checked=state[key];
  $('review-form').reset();
  for(const [key,value] of Object.entries(state.answers)) document.querySelector(`input[name="${key}"][value="${value}"]`).checked=true;
  $('review-feedback').replaceChildren();renderBrief();renderRoom();renderFrames();
}

document.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>showStep(button.dataset.step)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>showStep(button.dataset.go)));
for(const key of ['audience','purpose','medium','layout','people','labels','dimensions','route','reflection']) {
  $(key).addEventListener('input',event=>{
    state[key]=['labels','dimensions','route'].includes(key)?event.target.checked:key==='people'?Number(event.target.value):event.target.value;
    renderBrief();renderRoom();save();
  });
}
$('download-brief').addEventListener('click',()=>{const b=briefText();download(`${b.title}\n\n${b.text}\n\nCheck: ${b.check}\n`,'is4s-message-brief.txt','text/plain;charset=utf-8');});
$('download-svg').addEventListener('click',()=>download(renderDiagram(state),'is4s-room-diagram.svg','image/svg+xml'));
$('save-project').addEventListener('click',projectDownload);$('download-project').addEventListener('click',projectDownload);
$('add-frame').addEventListener('click',()=>{
  if(state.frames.length>=6) return;
  stopPreview();state.frames.push({visual:'scene',caption:'',seconds:5});renderFrames();save();
  $(`caption-${state.frames.length-1}`).focus();
});
$('story-frames').addEventListener('input',event=>{
  const field=event.target.dataset.field;if(!field) return;
  const i=Number(event.target.closest('[data-index]').dataset.index);
  if(field==='seconds') {
    const value=Number(event.target.value);
    if(!Number.isInteger(value)||value<2||value>20) {event.target.setCustomValidity('Choose a whole number from 2 to 20.');return;}
    event.target.setCustomValidity('');state.frames[i].seconds=value;
  } else if(field==='caption') state.frames[i].caption=event.target.value;
  else if(Object.hasOwn(visualNames,event.target.value)) {
    state.frames[i].visual=event.target.value;
    event.target.closest('[data-index]').querySelector('.frame-visual').innerHTML=visualHTML(event.target.value);
  }
  stopPreview();renderTiming();save();
});
$('story-frames').addEventListener('change',event=>{
  if(event.target.dataset.field==='seconds') {
    const i=Number(event.target.closest('[data-index]').dataset.index);
    event.target.value=state.frames[i].seconds;event.target.setCustomValidity('');
  }
});
$('story-frames').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled) return;
  const i=Number(button.closest('[data-index]').dataset.index),action=button.dataset.action;
  stopPreview();
  if(action==='remove'&&state.frames.length>1) state.frames.splice(i,1);
  else {const target=action==='earlier'?i-1:i+1;if(target<0||target>=state.frames.length) return;[state.frames[i],state.frames[target]]=[state.frames[target],state.frames[i]];}
  renderFrames();save();
  const focusIndex=Math.max(0,Math.min(action==='earlier'?i-1:action==='later'?i+1:i,state.frames.length-1));
  $(`visual-${focusIndex}`).focus();
});
$('play-story').addEventListener('click',()=>{
  if(playing) {stopPreview();return;}
  playing=true;activeFrame=0;$('preview').hidden=false;$('play-story').textContent='Stop preview';showFrame();
  $('preview').scrollIntoView({block:'nearest',behavior:'instant'});
});
$('stop-story').addEventListener('click',()=>{stopPreview();$('play-story').focus();});
document.addEventListener('visibilitychange',()=>{if(document.hidden) stopPreview();});
const reviewKey={capacity:{answer:'measured',yes:'A real capacity decision needs measured evidence and the applicable requirements. This practice diagram cannot establish it.',no:'An invented image cannot establish safe capacity. Use a measured plan and the applicable requirements.'},time:{answer:'brief',yes:'The supplied case facts establish the time for this fictional activity.',no:'Image tools can invent signs and clocks. Check the supplied case facts.'},clarity:{answer:'test',yes:'Observe a learner using the explanation. Their questions show what needs revision.',no:'Polish does not establish understanding. Ask a learner to follow the explanation and observe the result.'}};
$('review-form').addEventListener('change',()=>{
  const form=new FormData($('review-form'));
  state.answers=Object.fromEntries(form.entries());$('review-feedback').replaceChildren();save();
});
$('review-form').addEventListener('submit',event=>{
  event.preventDefault();let correct=0;
  const feedback=Object.entries(reviewKey).map(([key,item],i)=>{
    const selected=state.answers[key],good=selected===item.answer;if(good) correct++;
    return `<p class="${good?'correct':''}"><strong>${i+1}. ${!selected?'Choose an answer.':good?'Supported.':'Look again.'}</strong> ${!selected?'Select the evidence you would use.':good?item.yes:item.no}</p>`;
  }).join('');
  $('review-feedback').innerHTML=`<p><strong>${correct} of 3 evidence choices supported.</strong> You can revise any choice and check again.</p>${feedback}`;
});
$('import-project').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file) return;
  try {
    if(file.size>50000) throw Error('Choose a studio project smaller than 50 KB.');
    const next=validate(JSON.parse(await file.text()));
    // Imports must not silently replace unsaved work: stage the validated file first.
    pendingImport=next;
    $('file-status').textContent='Project checked. Opening it will replace only this studio’s current work.';
    let button=$('confirm-import');
    if(!button) {button=document.createElement('button');button.id='confirm-import';button.type='button';button.className='secondary';button.textContent='Open checked project';$('file-status').after(button);button.addEventListener('click',()=>{if(!pendingImport)return;stopPreview();state=pendingImport;pendingImport=null;if(!state.shot)shotPlanner.reset();renderAll();save();showStep('brief',false);$('file-status').textContent='Project opened. Your editable work is restored.';button.remove();});}
    button.focus();
  } catch(error) {$('file-status').textContent=`Project was not opened. ${error.message}`;pendingImport=null;$('confirm-import')?.remove();}
  event.target.value='';
});
let pendingImport=null;
$('reset-request').addEventListener('click',()=>{$('reset-confirm').hidden=false;$('reset-cancel').focus();});
$('reset-cancel').addEventListener('click',()=>{$('reset-confirm').hidden=true;$('reset-request').focus();});
$('reset-confirmed').addEventListener('click',()=>{
  stopPreview();state=defaults();shotPlanner.reset();pendingImport=null;$('confirm-import')?.remove();renderAll();save();showStep('brief');$('reset-confirm').hidden=true;$('file-status').textContent='This studio has been reset. Other IS4S activities were kept.';
});
window.addEventListener('hashchange',()=>showStep(location.hash.slice(1)));
renderAll();showStep(STEPS.includes(location.hash.slice(1))?location.hash.slice(1):'brief',false);$('save-status').textContent=initialMessage;
