'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../../skills/digital/site-builder');
globalThis.window=globalThis;
for(const f of ['vendor/dimensions.js','vendor/parts.js','vendor/models-static.js','vendor/catalog.js','engine.js'])vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
const E=globalThis.LearnerSite,C=globalThis.MCSITECAT;
for(const id of E.palette){const s=C.specOf(id);assert.ok(s&&s.L>0&&s.W>0&&s.H>0&&s.source,id);const b=C.blockOf(id);assert.ok(b.parts.length>0&&!b.refusal,id);}
const a={uid:'O1',asset:'container-20ft',x:0,y:0,rotation:0,start:0,end:4},b={...a,uid:'O2',asset:'site-cabin',x:1,start:2,end:8};
assert.equal(C.specOf(a.asset).L,6.058);assert.equal(E.conflicts([a,b]).length,1);assert.equal(E.conflicts([a,b])[0].start,2);assert.equal(E.conflicts([a,b])[0].end,4);assert.equal(E.conflicts([a,b],4).length,0);assert.equal(E.conflicts([a,{...b,start:4}]).length,0);assert.equal(E.conflicts([a,{...b,x:12}]).length,0);assert.equal(E.active(a,0),true);assert.equal(E.active(a,4),false);
const w=C.specOf(a.asset).W;assert.equal(E.overlap(a,{...a,y:w}),false);assert.equal(E.overlap(a,{...a,y:w-.01}),true);assert.equal(E.overlap(a,{...a,x:5,rotation:0}),true);assert.equal(E.overlap(a,{...a,x:5,rotation:90}),false);
for(const bad of [{...a,x:NaN},{...a,x:Infinity},{...a,start:5,end:4},{...a,rotation:360},{...a,asset:'tower-crane'},{...a,uid:'<script>'},{...a,x:'1'}])assert.throws(()=>E.validate({version:1,objects:[bad]}));
assert.throws(()=>E.validate({version:1,objects:[a,a]}));assert.throws(()=>E.validate({version:2,objects:[]}));assert.deepEqual(E.validate(JSON.parse(JSON.stringify({version:1,objects:[a,b]}))),{version:1,objects:[a,b]});
console.log('PASS: all eight upstream generators and sources, known-answer spatial/time cases, validation and round trip');
// Build actual 3D geometry without WebGL. Materials use the upstream fallback here;
// this does not substitute for browser/texture/rendering verification.
for(const f of ['vendor/three.min.js','vendor/site3d.js'])vm.runInThisContext(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
for(const id of E.palette){const group=MCSITE3D.blockGroup(C.instance(id,{uid:id}),{rings:false});assert.ok(group&&group.children.length>0,id);let meshes=0;group.traverse(o=>{if(o.isMesh){meshes++;const a=o.geometry.attributes.position;for(const v of a.array)assert.ok(Number.isFinite(v),id+' finite vertex');}});assert.ok(meshes>0,id);}
console.log('PASS: actual Three.js scene geometry for all 8 objects has finite vertices (no WebGL rendering claim)');
