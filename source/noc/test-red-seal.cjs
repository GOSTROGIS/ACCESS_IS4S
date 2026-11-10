'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../tools/noc');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nodes = {};
const node = id => nodes[id] ||= {innerHTML:'',textContent:'',value:'',hidden:false,events:{},addEventListener(e,fn){this.events[e]=fn;},querySelector(){return null;},focus(){}};
const cards = [...html.matchAll(/<li data-red-seal-name="([^"]+)" data-red-seal-code="(\d{5})">/g)].map(m=>({hidden:false,getAttribute:k=>k==='data-red-seal-name'?m[1]:m[2]}));
const window = {location:{search:'?q=Gasfitter%20Class%20A',href:'https://example.test/?q=Gasfitter%20Class%20A'},history:{replaceState(){}}};
const context = {window,document:{getElementById:node,querySelector:node,querySelectorAll:s=>s==='#red-seal-list > li'?cards:[],addEventListener(){}},URL,URLSearchParams,setTimeout,clearTimeout};
vm.createContext(context);
for (const file of ['noc-data.js','red-seal-data.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const source=fs.readFileSync(path.join(root,'noc.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.testSearch=search;window.testFilter=filterRedSeal;})();');
vm.runInContext(source,context);
const rows=window.RED_SEAL_DATA.trades, codes=new Set(window.NOC_DATA.units.map(u=>u[0]));
assert.equal(rows.length,54);
assert.equal(cards.length,54);
assert.equal(new Set(rows.map(r=>r.name)).size,54);
assert.equal(new Set(rows.map(r=>r.code)).size,41);
for(const r of rows){
 assert(codes.has(r.code),r.name+' has existing NOC group');
 assert.equal(window.testSearch(r.name).items[0].u.code,r.code,r.name+' ranks official mapping first');
 assert(html.includes('data-red-seal-name="'+r.name+'"'),r.name+' visible without JavaScript');
 assert(html.includes('href="'+r.url+'"'),r.name+' has official source');
 assert(r.jurisdictions.length>0);
 window.testFilter(r.name);
 assert.equal(cards.filter(c=>!c.hidden).length,1,r.name+' unique full-name filter');
}
for(const [q,n] of [['Gasfitter',2],['Ironworker',3],['Heavy Equipment Operator',3],['crane',2],['72302',2],['zzzzzzzz',0],['',54]]){
 window.testFilter(q); assert.equal(cards.filter(c=>!c.hidden).length,n,q+' filter count');
}
node('red-seal-filter').value='crane';node('red-seal-filter').events.input();
assert.equal(cards.filter(c=>!c.hidden).length,2);
node('red-seal-clear').events.click();assert.equal(cards.filter(c=>!c.hidden).length,54);
node('red-seal-filter').value='gasfitter';node('red-seal-filter').events.input();
node('red-seal-filter').events.keydown({key:'Escape'});assert.equal(cards.filter(c=>!c.hidden).length,54);
assert.match(node('results').innerHTML,/Red Seal trades linked to this NOC group/);
assert.match(node('red-seal-status').textContent,/54 of 54/);
assert.equal((node('occupation-directory').innerHTML.match(/data-code=/g)||[]).length,516);
console.log('PASS: all 54 official trade names map first to 41 existing NOC groups; 54 static cards and sources; variants, code filters, no match, clear and Escape; original 516-group directory preserved.');
