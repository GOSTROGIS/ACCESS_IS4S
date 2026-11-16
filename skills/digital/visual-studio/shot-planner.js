import {clamp, fitViewportToBounds} from './vendor/viewport-geometry.js';

const STORAGE_KEY = 'access-is4s-shot-planner-v1';
const IMAGE_CHOICES = {
  scene: {label:'Wide view of the learning day',path:'assets/learning-day.png',alt:'AI-generated illustration of adults discussing a birdhouse prototype in a training room.'},
  detail: {label:'Birdhouse prototype close-up',path:'assets/prototype-detail.png',alt:'AI-generated illustration of a birdhouse prototype and pencil sketch on a workshop bench.'},
};
const FRAME_CHOICES = {
  landscape:{label:'Landscape · 16:9',width:1280,height:720},
  portrait:{label:'Portrait · 9:16',width:720,height:1280},
  square:{label:'Square · 1:1',width:1080,height:1080},
};
const DEFAULTS = {version:1,source:'scene',aspect:'landscape',mode:'fit',zoom:100,focus:50,grid:true};
let mountCount=0;
const escapeXML = text => String(text).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));

function validSettings(value) {
  if(!value || value.version!==1 || !Object.hasOwn(IMAGE_CHOICES,value.source) || !Object.hasOwn(FRAME_CHOICES,value.aspect) || !['fit','fill'].includes(value.mode) || !Number.isInteger(value.zoom) || value.zoom<100 || value.zoom>200 || !Number.isInteger(value.focus) || value.focus<0 || value.focus>100 || typeof value.grid!=='boolean') return null;
  return {version:1,source:value.source,aspect:value.aspect,mode:value.mode,zoom:value.zoom,focus:value.focus,grid:value.grid};
}

/**
 * IS4S exercise adapted from ArtCraft's composition/canvas workflows.
 * Whole-image fit uses the licensed ArtCraft helper. Fill/crop positioning,
 * user controls and exports are original IS4S code; no model API is called.
 */
export function mountShotPlanner(container) {
  const instance=++mountCount;
  const prefix=`is4s-shot-${instance}`;
  let settings={...DEFAULTS};
  let storageAvailable=true;
  try {
    const previous=localStorage.getItem(STORAGE_KEY);
    if(previous) settings=validSettings(JSON.parse(previous)) || {...DEFAULTS};
  } catch {storageAvailable=false;}
  let disposed=false;
  let imageLoadToken=0;
  let naturalSize=null;
  let currentImageURL='';

  container.innerHTML=`<div class="section-heading"><p class="eyebrow">Digital + Communication + Creativity</p><h2>Choose what your audience sees.</h2><p>Compare a wide frame and a close crop. Keep the important detail in view.</p></div>
  <div class="workspace diagram-workspace shot-workspace">
    <div class="controls">
      <label for="${prefix}-source">Illustration</label><select id="${prefix}-source" data-shot-setting="source">${Object.entries(IMAGE_CHOICES).map(([key,image])=>`<option value="${key}">${image.label}</option>`).join('')}</select>
      <label for="${prefix}-aspect">Output frame</label><select id="${prefix}-aspect" data-shot-setting="aspect">${Object.entries(FRAME_CHOICES).map(([key,frame])=>`<option value="${key}">${frame.label}</option>`).join('')}</select>
      <label for="${prefix}-mode">Image placement</label><select id="${prefix}-mode" data-shot-setting="mode"><option value="fit">Fit whole image</option><option value="fill">Fill frame · crop edges</option></select>
      <label for="${prefix}-zoom">Zoom <output id="${prefix}-zoom-output">100%</output></label><input id="${prefix}-zoom" type="range" min="100" max="200" step="1" value="100" data-shot-setting="zoom">
      <label for="${prefix}-focus">Horizontal focal position <output id="${prefix}-focus-output">50%</output></label><input id="${prefix}-focus" type="range" min="0" max="100" step="1" value="50" data-shot-setting="focus">
      <label class="check"><input type="checkbox" data-shot-setting="grid" checked> Show thirds guide</label>
      <p class="try-this"><strong>Try it:</strong> fill a portrait frame, then move the focal position. Which learner or object disappears?</p>
    </div>
    <div class="shot-stage">
      <div data-shot-preview class="shot-preview" aria-busy="true"></div>
      <p data-shot-dimensions class="shot-dimensions"></p>
      <p data-shot-explanation class="muted"></p>
      <p data-shot-status class="muted" role="status">Loading the local illustration…</p>
    </div>
  </div>
  <div class="file-actions"><button type="button" data-shot-download="svg" class="primary" disabled>Download framed SVG</button><button type="button" data-shot-download="brief" class="secondary" disabled>Download shot brief</button><button type="button" data-shot-reset class="quiet">Reset framing</button></div>
  <p class="muted">This is a local framing exercise using generated illustrations. It does not generate a new image or video. The thirds guide is included in the SVG only when shown.</p>
  <details class="shot-credits"><summary>Source and credits</summary><p>Adapted from ArtCraft’s canvas and scene-composition workflows, with its viewport-fit math reused under the MIT licence. The IS4S controls, cropping exercise and images are separate additions.</p><p><a href="https://github.com/storytold/artcraft/blob/69f53c2f0358a91a5e35e5a7b3a91677320c3112/frontend/libs/markdown-content/src/lib/content/faq/3d-editor.md">Composition source</a> · <a href="https://github.com/storytold/artcraft/blob/69f53c2f0358a91a5e35e5a7b3a91677320c3112/frontend/libs/markdown-content/src/lib/content/faq/2d-canvas.md">Canvas source</a> · <a href="vendor/ARTCRAFT-LICENSE-MIT.txt">MIT licence</a> · <a href="vendor/ARTCRAFT-NOTICE.txt">Upstream notices</a></p></details>`;

  const select = selector => container.querySelector(selector);
  const status=select('[data-shot-status]');
  const controls=[...container.querySelectorAll('[data-shot-setting]')];
  const preview=select('[data-shot-preview]');

  function save() {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));storageAvailable=true;}
    catch {storageAvailable=false;}
    status.textContent=storageAvailable?'Framing saved in this browser. Download the SVG and brief to keep a copy.':'Browser save is unavailable. Download the SVG and brief to keep your framing.';
  }
  function syncControls() {
    controls.forEach(control=>{const key=control.dataset.shotSetting;if(key==='grid') control.checked=settings.grid;else control.value=settings[key];});
  }
  function geometry(options=settings,size=naturalSize) {
    const frame=FRAME_CHOICES[options.aspect];
    // ArtCraft's helper centers the complete source image in the output frame.
    const fitted=fitViewportToBounds({x:0,y:0,width:size.width,height:size.height},frame,0);
    // Fill-frame crop math is an IS4S addition, not an upstream ArtCraft crop routine.
    const base=options.mode==='fit'?fitted.zoom:Math.max(frame.width/size.width,frame.height/size.height);
    const scale=base*options.zoom/100;
    const width=size.width*scale,height=size.height*scale;
    const overflow=Math.max(width-frame.width,0);
    return {frame,width,height,x:overflow>0?-overflow*options.focus/100:(frame.width-width)/2,y:(frame.height-height)/2,scale,overflow};
  }
  function svg(imageHref,options=settings,size=naturalSize) {
    const {frame,width,height,x,y}=geometry(options,size);
    const id=`${prefix}-clip`;
    const grid=options.grid?`<g stroke="#FFBC00" stroke-width="${Math.max(frame.width,frame.height)/500}" opacity="0.9" fill="none"><path d="M${frame.width/3} 0V${frame.height}M${frame.width*2/3} 0V${frame.height}M0 ${frame.height/3}H${frame.width}M0 ${frame.height*2/3}H${frame.width}"/></g>`:'';
    const description=`${IMAGE_CHOICES[options.source].alt} ${FRAME_CHOICES[options.aspect].label}; ${options.mode==='fit'?'fit whole image':'fill frame with cropped edges'}; zoom ${options.zoom} percent; horizontal focal position ${options.focus} percent. This is a composition exercise, not documentary evidence.`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" role="img" aria-labelledby="${prefix}-title ${prefix}-description" style="display:block;width:100%;height:auto;max-height:680px"><title id="${prefix}-title">IS4S shot plan: ${escapeXML(FRAME_CHOICES[options.aspect].label)}</title><desc id="${prefix}-description">${escapeXML(description)}</desc><metadata>Original IS4S generated illustration. Viewport fit adapted from ArtCraft under MIT; see accompanying ARTCRAFT-LICENSE-MIT.txt. No ArtCraft trademarks or third-party media used.</metadata><defs><clipPath id="${id}"><rect width="${frame.width}" height="${frame.height}"/></clipPath></defs><rect width="${frame.width}" height="${frame.height}" fill="#E5E0DA"/><g clip-path="url(#${id})"><image href="${escapeXML(imageHref)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>${grid}</g></svg>`;
  }
  function render() {
    if(!naturalSize || disposed) return;
    const {frame,overflow}=geometry();
    preview.innerHTML=svg(currentImageURL);
    select('[data-shot-dimensions]').textContent=`${frame.width} × ${frame.height} pixels · ${FRAME_CHOICES[settings.aspect].label} · ${settings.zoom}% zoom`;
    const explanation=settings.mode==='fit'&&settings.zoom===100?'The complete image is visible. Empty bands appear when its shape differs from the frame.':settings.mode==='fill'?'The frame is filled. Content beyond its edges is cropped; compare what is lost.':'Zooming into a fitted image can crop its edges. Return to 100% to show the complete image.';
    select('[data-shot-explanation]').textContent=explanation+(overflow>0?' Move the focal position to choose which horizontal area stays visible.':' No horizontal crop is available at these settings; the focal position has no visible effect.');
    select(`#${prefix}-zoom-output`).textContent=`${settings.zoom}%`;
    select(`#${prefix}-focus-output`).textContent=`${settings.focus}%`;
    select(`[data-shot-setting="focus"]`).disabled=overflow<=0;
    container.querySelectorAll('[data-shot-download]').forEach(button=>button.disabled=false);
    preview.setAttribute('aria-busy','false');
  }
  async function loadImage() {
    const token=++imageLoadToken;
    naturalSize=null;preview.setAttribute('aria-busy','true');
    container.querySelectorAll('[data-shot-download]').forEach(button=>button.disabled=true);
    currentImageURL=new URL(IMAGE_CHOICES[settings.source].path,import.meta.url).href;
    const image=new Image();
    image.src=currentImageURL;
    try {
      await image.decode();
      if(disposed||token!==imageLoadToken)return;
      naturalSize={width:image.naturalWidth,height:image.naturalHeight};
      render();status.textContent=storageAvailable?'Change the frame and compare the result. Framing choices stay in this browser.':'Browser save is unavailable. Download your result to keep a copy.';
    } catch {
      if(disposed||token!==imageLoadToken)return;
      preview.replaceChildren();preview.setAttribute('aria-busy','false');status.textContent='The local illustration could not be loaded. Check that the complete Digital pack was extracted, then try another illustration.';
    }
  }
  function download(content,name,type) {
    const url=URL.createObjectURL(new Blob([content],{type}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function downloadSVG() {
    if(!naturalSize)return;
    const exportSettings={...settings},exportSize={...naturalSize},exportURL=currentImageURL;
    const button=select('[data-shot-download="svg"]');button.disabled=true;
    try {
      const response=await fetch(exportURL);
      if(!response.ok)throw Error('Illustration request failed.');
      const imageBlob=await response.blob();
      if(!imageBlob.type.startsWith('image/'))throw Error('Illustration response was not an image.');
      const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the illustration.'));reader.readAsDataURL(imageBlob);});
      if(disposed)return;
      download(svg(dataURL,exportSettings,exportSize),'is4s-framed-shot.svg','image/svg+xml;charset=utf-8');
      status.textContent='Downloaded a self-contained SVG with its illustration embedded. Open the file to check the result.';
    } catch {
      status.textContent='The SVG was not downloaded because the local illustration could not be read. Use the complete extracted pack with a local web server and try again.';
    } finally {if(!disposed)button.disabled=false;}
  }
  function downloadBrief() {
    if(!naturalSize)return;
    const frame=FRAME_CHOICES[settings.aspect];
    const brief=`IS4S shot brief\n\nSubject: ${IMAGE_CHOICES[settings.source].label}\nFrame: ${frame.label}, ${frame.width} x ${frame.height} pixels\nPlacement: ${settings.mode==='fit'?'fit whole image':'fill frame; crop edges'}\nZoom: ${settings.zoom}%\nHorizontal focal position: ${settings.focus}%\nThirds guide: ${settings.grid?'shown':'hidden'}\n\nPrompt planning: Show the fictional Community Learning Day birdhouse activity clearly. Keep the important people or prototype visible. Use this framing as a reference, then compare the result with your intended message.\n\nCheck: What has the crop removed? Does the audience still have the information it needs? Check generated details against your source facts. This exercise uses generated illustrations, not evidence of an actual event. It does not generate or export a video.\n\nSource workflows: ArtCraft 2D Canvas and 3D Editor FAQs, commit 69f53c2f0358a91a5e35e5a7b3a91677320c3112. Whole-image fit math adapted under MIT; source and notices accompany this studio.\n`;
    download(brief,'is4s-shot-brief.txt','text/plain;charset=utf-8');status.textContent='Downloaded the editable shot brief. The illustration remains labelled as generated.';
  }
  function onInput(event) {
    const key=event.target.dataset.shotSetting;if(!key)return;
    if(key==='grid')settings.grid=event.target.checked;
    else if(key==='zoom')settings.zoom=clamp(Math.round(Number(event.target.value)),100,200);
    else if(key==='focus')settings.focus=clamp(Math.round(Number(event.target.value)),0,100);
    else settings[key]=event.target.value;
    if(key==='source')loadImage();else render();
    save();
  }
  function validate(raw) {const result=validSettings(raw);if(!result)throw Error('The shot-framing settings are invalid.');return result;}
  function setState(raw) {const next=validate(raw);settings=next;syncControls();save();loadImage();}
  function reset() {setState(DEFAULTS);}
  container.addEventListener('input',onInput);
  select('[data-shot-download="svg"]').addEventListener('click',downloadSVG);
  select('[data-shot-download="brief"]').addEventListener('click',downloadBrief);
  select('[data-shot-reset]').addEventListener('click',reset);
  syncControls();loadImage();
  return {reset,getState:()=>({...settings}),validate,setState,destroy(){disposed=true;imageLoadToken++;container.removeEventListener('input',onInput);}};
}
