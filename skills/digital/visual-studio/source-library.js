import {guides} from './learning-guides.js';

const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SKILLS = {digital:'Digital',reading:'Reading',writing:'Writing',numeracy:'Numeracy',communication:'Communication','creativity-innovation':'Creativity and innovation','problem-solving':'Problem solving',collaboration:'Collaboration',adaptability:'Adaptability'};

/** The library is an inventory and teaching adaptation, not an installed app launcher. */
export async function mountSourceLibrary(container) {
  container.innerHTML=`<div class="guide-workbench"><div class="controls"><label for="craft-guide">Choose a practice workflow</label><select id="craft-guide">${guides.map(g=>`<option value="${escape(g.id)}">${escape(g.title)}</option>`).join('')}</select><p class="muted">Adapted from inspected Artcraft documentation. Try the task here, then check the result in the tool you use.</p></div><div><h3 id="guide-title"></h3><p id="guide-goal"></p><div id="guide-steps" class="guide-steps" aria-label="Workflow steps"></div><div id="guide-current" class="guide-current" aria-live="polite"></div><p id="guide-exercise" class="try-this"></p><p class="muted" id="guide-source"></p></div></div><div class="library-heading"><div><h3>Find a tool for your task</h3><p>Source downloaded for review. These apps are not installed inside IS4S.</p></div><a class="secondary inventory-download" href="storytold-catalog.json" download>Download source inventory</a></div><div class="catalog-filters"><div><label for="tool-query">Search tools and source</label><input id="tool-query" type="search" placeholder="Try vector, video, spreadsheet…"></div><div><label for="tool-skill">Skill</label><select id="tool-skill"><option value="">All skills</option>${Object.entries(SKILLS).map(([slug,label])=>`<option value="${slug}">${escape(label)}</option>`).join('')}</select></div><label class="check"><input id="tool-support" type="checkbox"> Include libraries and research</label></div><p id="catalog-count" role="status">Loading the local source inventory…</p><div id="catalog-results" class="catalog-results"></div><p class="muted">Repository descriptions and download status are recorded at the inspected commits. Licensing and setup vary. Source availability does not mean an app runs in this browser or that its cloud models are free.</p>`;
  const byId=id=>container.querySelector(`#${id}`);
  let activeGuide=guides[0],activeStep=0;
  function renderGuide() {
    byId('guide-title').textContent=activeGuide.title;
    byId('guide-goal').textContent=activeGuide.goal;
    byId('guide-steps').innerHTML=activeGuide.steps.map((s,i)=>`<button type="button" data-guide-step="${i}" ${activeStep===i?'aria-current="step"':''}><span>${i+1}</span>${escape(s.title)}</button>`).join('');
    const step=activeGuide.steps[activeStep];
    byId('guide-current').innerHTML=`<h4>${escape(step.title)}</h4><p>${escape(step.action)}</p><p><strong>Check:</strong> ${escape(step.check)}</p>`;
    byId('guide-exercise').innerHTML=`<strong>Try it:</strong> ${escape(activeGuide.exercise)}`;
    byId('guide-source').innerHTML=`Adapted from <a href="${escape(activeGuide.source.url)}" target="_blank" rel="noopener noreferrer">${escape(activeGuide.source.repo)} · ${escape(activeGuide.source.path.split('/').pop())}</a>. <a href="vendor/ARTCRAFT-LICENSE-MIT.txt">MIT licence</a>. Source wording and tool claims have been rewritten as things to test, not guarantees.`;
  }
  byId('craft-guide').addEventListener('change',event=>{activeGuide=guides.find(g=>g.id===event.target.value);activeStep=0;renderGuide();});
  byId('guide-steps').addEventListener('click',event=>{const button=event.target.closest('[data-guide-step]');if(!button)return;activeStep=Number(button.dataset.guideStep);renderGuide();byId('guide-steps').querySelector(`[data-guide-step="${activeStep}"]`).focus();});
  renderGuide();
  try {
    const response=await fetch(new URL('./storytold-catalog.json',import.meta.url));
    if(!response.ok) throw Error('Inventory could not be loaded.');
    const catalog=await response.json();
    function renderCatalog() {
      const query=byId('tool-query').value.toLowerCase().trim(),skill=byId('tool-skill').value;
      const support=byId('tool-support').checked;
      const matches=catalog.apps.filter(app=>(support||['creative','documents'].includes(app.category)||(app.category==='technical'&&app.skills.length>0))&&(!skill||app.skills.includes(skill))&&(!query||[app.name,app.title,app.description,...app.skills].join(' ').toLowerCase().includes(query)));
      byId('catalog-count').textContent=`${matches.length} of ${catalog.total} repositories · inspected ${catalog.retrieved}`;
      byId('catalog-results').innerHTML=matches.length?matches.map(app=>`<article class="catalog-row"><div><h4><a href="${escape(app.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(app.title||app.name)}</a></h4><p>${escape(app.description||'Supporting source repository.')}</p><p class="catalog-skills">${escape(app.skills.map(s=>SKILLS[s]||s).join(' · ')||'Development and reference')}</p></div><details><summary>Source details</summary><dl><dt>Repository</dt><dd>${escape(app.name)}</dd><dt>Source status</dt><dd>${escape(app.status)}</dd><dt>Runtime</dt><dd>${escape(app.runtime||'See the upstream repository')}</dd><dt>Licence</dt><dd>${escape(app.license||'Not established; review before reusing')}</dd><dt>Commit</dt><dd><code>${escape(app.commit||'No commit available')}</code></dd></dl></details></article>`).join(''):'<p>No repositories match. Try another skill or include libraries and research.</p>';
    }
    byId('tool-query').addEventListener('input',renderCatalog);byId('tool-skill').addEventListener('change',renderCatalog);byId('tool-support').addEventListener('change',renderCatalog);
    renderCatalog();
  } catch {byId('catalog-count').textContent='The local inventory could not be loaded. Reopen the full Digital pack using a local web server.';}
}
