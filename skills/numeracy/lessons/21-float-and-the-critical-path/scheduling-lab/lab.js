'use strict';
const {baseline,calculate} = Scheduling;
const $ = id => document.getElementById(id);
const fields = new Map();
for (const task of baseline) {
  const row = document.createElement('tr');
  row.innerHTML = `<th scope="row">${task.id}</th><td>${task.name}</td><td><label class="sr-only" for="duration-${task.id}">${task.id} ${task.name} duration in working days</label><input id="duration-${task.id}" type="number" min="1" max="20" step="1" required inputmode="numeric" value="${task.duration}"></td><td>${task.pred.join(', ') || '—'}</td>`;
  $('inputs').append(row); fields.set(task.id,row.querySelector('input'));
}
function invalidate() {$('results').hidden=true; $('error').textContent='';}
for (const field of fields.values()) field.addEventListener('input',() => {invalidate(); $('case-label').textContent='Case: Your own durations'; $('prediction').value='';});
const cases={baseline:{label:'Original baseline'},B2:{label:'B takes 2 extra days',id:'B',extra:2},C3:{label:'C takes 3 extra days',id:'C',extra:3},C4:{label:'C takes 4 extra days',id:'C',extra:4}};
function choose(key) {
  const change=cases[key];
  for (const task of baseline) fields.get(task.id).value=task.duration+(task.id===change.id?change.extra:0);
  $('case-label').textContent='Case: '+change.label;
  $('prediction').value=''; invalidate(); $('prediction').focus();
}
document.querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.case)));
$('reset').addEventListener('click',()=>choose('baseline'));
$('prediction').addEventListener('input',invalidate);
const explanations={
  baseline:'The finish is 12. A → B → D → E → F is critical. C has 3 days of total and free float: it finishes at 5 while E cannot start until D finishes at 8.',
  B2:'The finish moves from 12 to 14. B is on the critical path, so its 2 extra days move D, E and F 2 days later. The critical path is still A → B → D → E → F.',
  C3:'The finish stays at 12. C uses all 3 days of its float and finishes at 8, at the same boundary as D. Both paths are now critical: A → B → D → E → F and A → C → E → F.',
  C4:'The finish moves from 12 to 13. C uses its 3 days of float and adds 1 more day. A → C → E → F is now critical. B and D each show 1 day of total float, shared along their path; B has 0 free float and D has 1.'
};
function matchingCase(tasks) {return Object.keys(cases).find(key=>tasks.every((t,i)=>t.duration===baseline[i].duration+(t.id===cases[key].id?cases[key].extra:0)));}
$('schedule-form').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    const tasks=baseline.map(t=>({...t,duration:Number(fields.get(t.id).value)}));
    const result=calculate(tasks), prediction=Number($('prediction').value);
    if (!$('prediction').value || !Number.isInteger(prediction) || prediction<1 || prediction>120) throw new Error('Enter a whole-number prediction from 1 to 120.');
    $('feedback').textContent=prediction===result.finish?`Your prediction of ${prediction} matches the finish.`:`You predicted ${prediction}. The calculated finish is ${result.finish}. Compare the paths to see why.`;
    $('input-record').textContent=`Entered durations: ${tasks.map(t=>t.id+' = '+t.duration).join(', ')} working days. Prediction: ${prediction}.`;
    const delta=result.finish-12;
    $('summary').textContent=`Baseline finish: 12 · Current finish: ${result.finish} · Change: ${delta===0?'no change':Math.abs(delta)+' working day'+(Math.abs(delta)===1?'':'s')+(delta>0?' later':' earlier')}`;
    $('explanation').textContent=explanations[matchingCase(tasks)] || `These are your own durations. The critical tasks are ${result.tasks.filter(t=>t.critical).map(t=>t.id).join(', ')}. Trace their links to identify the longest path or tied paths. Compare total float with free float before describing a safe delay.`;
    $('calculated').replaceChildren(); $('gantt').replaceChildren();
    const scale=Math.max(12,result.finish);
    const axis=document.createElement('p'); axis.className='axis'; axis.textContent=`Boundary 0 → ${scale} working days`; $('gantt').append(axis);
    for (const task of result.tasks) {
      const row=document.createElement('tr'); if(task.critical) row.className='critical-row';
      row.innerHTML=`<th scope="row">${task.id} ${task.name}</th>${['ES','EF','LS','LF','TF','FF'].map(k=>`<td>${task[k]}</td>`).join('')}<td>${task.critical?'Critical':'Has float'}</td>`; $('calculated').append(row);
      const ganttRow=document.createElement('div'); ganttRow.className='gantt-row';
      const label=document.createElement('span'); label.className='gantt-label'; label.textContent=`${task.id} · ${task.ES}–${task.EF} · ${task.critical?'Critical':'Has float'}`;
      const track=document.createElement('div'); track.className='track'; track.setAttribute('aria-hidden','true');
      const marker=document.createElement('span'); marker.className='baseline-marker'; marker.style.left=(12/scale*100)+'%';
      const bar=document.createElement('span'); bar.className='bar'+(task.critical?' critical':''); bar.style.left=(task.ES/scale*100)+'%'; bar.style.width=(task.duration/scale*100)+'%';
      track.append(bar,marker); ganttRow.append(label,track); $('gantt').append(ganttRow);
    }
    $('results').hidden=false; $('result-title').focus();
  } catch(error) {$('error').textContent=error.message; $('results').hidden=true;}
});
$('print').addEventListener('click',()=>window.print());
