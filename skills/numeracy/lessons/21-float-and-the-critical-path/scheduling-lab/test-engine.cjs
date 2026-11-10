'use strict';
const assert=require('node:assert/strict');
const {baseline,calculate}=require('./engine.js');
const scenario=(id,extra)=>baseline.map(t=>({...t,duration:t.duration+(t.id===id?extra:0)}));
const values=t=>[t.ES,t.EF,t.LS,t.LF,t.TF,t.FF];
const original=calculate(baseline);
assert.equal(original.finish,12);
assert.deepEqual(original.tasks.map(values),[[0,2,0,2,0,0],[2,6,2,6,0,0],[2,5,5,8,3,3],[6,8,6,8,0,0],[8,11,8,11,0,0],[11,12,11,12,0,0]]);
for(const [id,extra,finish,critical] of [['B',2,14,'ABDEF'],['C',3,12,'ABCDEF'],['C',4,13,'ACEF']]){
 const r=calculate(scenario(id,extra));assert.equal(r.finish,finish);assert.equal(r.tasks.filter(t=>t.critical).map(t=>t.id).join(''),critical);
 for(const t of r.tasks){assert.equal(t.EF-t.ES,t.duration);assert.equal(t.LF-t.LS,t.duration);assert.equal(t.TF,t.LS-t.ES);assert.ok(t.FF>=0 && t.FF<=t.TF);}
}
const c4=calculate(scenario('C',4));assert.deepEqual(values(c4.tasks[1]),[2,6,3,7,1,0]);assert.deepEqual(values(c4.tasks[3]),[6,8,7,9,1,1]);
assert.deepEqual(calculate([...baseline].reverse()).tasks.find(t=>t.id==='C'),original.tasks.find(t=>t.id==='C'));
for (const duration of [0,-1,21,1.5,NaN,Infinity,'2']) assert.throws(()=>calculate([{id:'A',pred:[],duration}]),/whole/);
for(const duration of [1,20])assert.equal(calculate([{id:'A',pred:[],duration}]).finish,duration);
assert.throws(()=>calculate([]),/at least/);
assert.throws(()=>calculate([{id:'A',pred:['X'],duration:1}]),/Unknown/);
assert.throws(()=>calculate([{id:'A',pred:['A'],duration:1}]),/cycle/);
assert.throws(()=>calculate([{id:'A',pred:['B'],duration:1},{id:'B',pred:['A'],duration:1}]),/cycle/);
assert.throws(()=>calculate([baseline[0],baseline[0]]),/unique/);
assert.throws(()=>calculate([{id:'A',pred:[],duration:1},{id:'B',pred:['A','A'],duration:1}]),/repeated/);
const parallel=calculate([{id:'A',pred:[],duration:2},{id:'B',pred:[],duration:4}]);assert.deepEqual(values(parallel.tasks[0]),[0,2,2,4,2,2]);
assert.equal(calculate(baseline.map(t=>({...t,duration:20}))).finish,100);
assert.equal(calculate(baseline.map(t=>({...t,duration:1}))).finish,5);
assert.equal(calculate(baseline).finish,12);assert.deepEqual(baseline.map(t=>t.duration),[2,4,3,2,3,1]);
console.log('PASS: baseline, delay cases, boundaries, float invariants, topology, invalid inputs and baseline immutability.');
// Paper lesson extension: one crew sequences B and C using an added FS link.
assert.equal(calculate(baseline.map(t=>({...t,pred:t.id==='C'?[...t.pred,'B']:t.pred}))).finish,13);
assert.equal(calculate(baseline.map(t=>({...t,pred:t.id==='B'?[...t.pred,'C']:t.pred}))).finish,15);
// Paper lesson extension: crash options start from delayed B = 6 days.
const crash=overrides=>calculate(baseline.map(t=>({...t,duration:overrides[t.id]??(t.id==='B'?6:t.duration)}))).finish;
assert.equal(crash({}),14);
assert.equal(crash({B:5}),13);
assert.equal(crash({B:5,E:2}),12);
assert.equal(crash({E:2}),13);
assert.equal(crash({C:2}),14);
assert.equal(crash({B:5,D:1}),12);
console.log('PASS: Task 10 crew sequencing and Task 11 crash alternatives.');
