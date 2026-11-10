(function(){
'use strict';
const $=id=>document.getElementById(id),E=window.LearnerSite,C=window.MCSITECAT;
let plan={version:1,objects:[]},selected=null,serial=0,angle=0;
const fields=['x','y','rotation','start','end'];
function node(tag,text,parent){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;}
function say(text){$('status').textContent=text;}
E.palette.forEach(id=>{const o=node('option',C.label(id),$('asset'));o.value=id;});
let renderer,scene,camera,models;
const templates=new Map();
try{
 renderer=MCSITE3D.makeRenderer($('three'),{dpr:1});scene=new THREE.Scene();scene.background=new THREE.Color('#eff3ed');camera=new THREE.PerspectiveCamera(42,1,.1,250);camera.up.set(0,0,1);models=new THREE.Group();scene.add(models);scene.add(new THREE.AmbientLight(0xffffff,1.2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(10,-20,40);scene.add(light);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(44,44),new THREE.MeshStandardMaterial({color:0xd9e2d3}));ground.position.z=-.03;scene.add(ground);
}catch(err){renderer=null;$('three').hidden=true;$('turn').disabled=true;$('view-status').textContent='3D is unavailable on this device. Use the fully functional top view and object table.';}
function select(uid){selected=uid;const o=plan.objects.find(x=>x.uid===uid);$('selected').textContent=o?uid+' · '+C.label(o.asset):'Add or select an object.';fields.forEach(k=>{$(k).value=o?o[k]:'';$(k).disabled=!o;});$('remove').disabled=!o;render();}
function sv(tag,attrs,parent){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.append(n);return n;}
function render3d(active){if(!renderer)return;
 // Cache one actual upstream model per palette asset; instances share immutable geometry.
 models.clear();
 active.forEach(o=>{if(!templates.has(o.asset))templates.set(o.asset,MCSITE3D.blockGroup(C.instance(o.asset,{uid:o.asset}),{rings:false}));const template=templates.get(o.asset);if(template){const group=template.clone(true);group.position.set(o.x,o.y,0);group.rotation.z=o.rotation*Math.PI/180;models.add(group);}});
 const canvas=$('three'),w=Math.max(240,canvas.clientWidth),h=canvas.clientHeight||360;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(Math.cos(angle)*46,Math.sin(angle)*46-18,36);camera.lookAt(0,0,0);camera.updateProjectionMatrix();renderer.render(scene,camera);
}
function render(){const h=Number($('hour').value);$('hour-value').value=h.toFixed(1);const visible=plan.objects.filter(o=>E.active(o,h)),at=E.conflicts(plan.objects,h),bad=new Set(at.flatMap(c=>[c.a,c.b]));
 $('objects').replaceChildren();plan.objects.forEach(o=>{const b=node('button',o.uid+' · '+C.label(o.asset),$('objects'));b.type='button';b.setAttribute('aria-pressed',String(o.uid===selected));b.onclick=()=>select(o.uid);});
 $('plan').replaceChildren();for(let i=-20;i<=20;i+=5){sv('line',{x1:i,x2:i,y1:-20,y2:20,stroke:'#c4cfc6','stroke-width':.08},$('plan'));sv('line',{x1:-20,x2:20,y1:i,y2:i,stroke:'#c4cfc6','stroke-width':.08},$('plan'));}
 visible.forEach(o=>{const poly=sv('polygon',{points:E.corners(o).map(([x,y])=>x+','+(-y)).join(' '),fill:o.uid===selected?'#edc76c':'#9bbdab',stroke:bad.has(o.uid)?'#b42722':'#244f41','stroke-width':.16},$('plan'));sv('title',{},poly).textContent=o.uid+' '+C.label(o.asset);const t=sv('text',{x:o.x,y:-o.y,'font-size':.85,'text-anchor':'middle',fill:'#101f18'},$('plan'));t.textContent=o.uid;});
 $('conflicts').replaceChildren();const all=E.conflicts(plan.objects);if(!all.length)node('li','No overall footprint overlaps found during shared hours. Other hazards are not checked.',$('conflicts'));all.forEach(c=>node('li',`${c.a} and ${c.b}: overlap from hour ${c.start} until ${c.end}${bad.has(c.a)&&bad.has(c.b)&&h>=c.start&&h<c.end?' (active now)':''}.`,$('conflicts')));
 $('table').replaceChildren();plan.objects.forEach(o=>{const tr=node('tr',undefined,$('table'));[o.uid,C.label(o.asset),`${o.x} / ${o.y}`,o.rotation+'°',`${o.start} to ${o.end}`].forEach(t=>node('td',t,tr));});
 $('sources').replaceChildren();[...new Set(plan.objects.map(o=>o.asset))].forEach(id=>{const s=C.specOf(id);node('p',`${C.label(id)}: ${s.L} m long × ${s.W} m wide × ${s.H} m high. State: ${s.state||'not stated'}. Configuration: ${s.configuration||'not stated'}. Source: ${s.source}`,$('sources'));});
 try{render3d(visible);}catch(err){renderer=null;$('three').hidden=true;$('turn').disabled=true;$('view-status').textContent='3D could not render. Your plan is still available in the top view and table.';}
}
$('add').onclick=()=>{if(plan.objects.length>=24){say('Maximum 24 objects. Remove one before adding another.');return;}let uid;do{uid='O'+(++serial);}while(plan.objects.some(o=>o.uid===uid));const o={uid,asset:$('asset').value,x:0,y:0,rotation:0,start:0,end:8};plan.objects.push(o);select(uid);say('Object added at the centre. Set its position and times, then apply changes.');};
$('edit').onsubmit=event=>{event.preventDefault();if(!selected){say('Add or select an object first.');return;}try{const candidate={version:1,objects:plan.objects.map(o=>o.uid===selected?{...o,...Object.fromEntries(fields.map(k=>[k,Number($(k).value)]))}:o)};plan=E.validate(candidate);render();say('Changes applied. Check the whole-day overlap list.');}catch(e){say(e.message);}};
$('remove').onclick=()=>{plan.objects=plan.objects.filter(o=>o.uid!==selected);select(null);say('Object removed.');};
$('challenge').onclick=()=>{plan={version:1,objects:[{uid:'O1',asset:'container-20ft',x:0,y:0,rotation:0,start:0,end:4},{uid:'O2',asset:'site-cabin',x:1,y:0,rotation:0,start:2,end:8}]};$('hour').value=3;select('O2');say('Challenge loaded: inspect hours 2 to 4.');};
$('hour').oninput=render;$('turn').onclick=()=>{angle+=Math.PI/4;render();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='learner-site-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Plan export prepared. Choose a descriptive version name when saving.');};
$('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>50000)throw Error('This file is too large. Maximum 50 KB.');const candidate=E.validate(JSON.parse(await file.text()));plan=candidate;select(plan.objects[0]?.uid||null);say('Plan reopened. Review its positions, times and overlaps.');}catch(e){say('Plan not changed. '+e.message);}$('import').value='';};
window.addEventListener('resize',render);select(null);
})();
