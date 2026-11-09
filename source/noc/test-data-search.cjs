'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../tools/noc');
const elements = {};
const element = id => elements[id] ||= {innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector(){return null;}};
const context = {
  window:{ location:{search:'?q=cook',href:'https://example.test/?q=cook'},history:{replaceState(){}} },
  document:{getElementById:element,querySelector:element,querySelectorAll(){return [];},addEventListener(){}},
  URL,URLSearchParams,setTimeout,clearTimeout
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'noc-data.js'),'utf8'),context);
// Expose the real private search at the closure boundary, without modifying production code.
const script = fs.readFileSync(path.join(root,'noc.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.testSearch = search;})();');
vm.runInContext(script,context);
const data = context.window.NOC_DATA;
assert.equal(data.units.length,516);
assert.equal(new Set(data.units.map(u=>u[0])).size,516);
assert.equal(data.units.reduce((n,u)=>n+u[4].length,0),27935);
const directory = element('occupation-directory').innerHTML;
assert.equal((directory.match(/<details/g)||[]).length,10);
const codes = Array.from(directory.matchAll(/data-code="(\d{5})"/g),m=>m[1]);
assert.equal(codes.length,516);
assert.equal(new Set(codes).size,516);
for(const u of data.units) {
  assert.ok(codes.includes(u[0]),u[0]+' in directory');
  assert.equal(context.window.testSearch(u[0]).items[0].u.code,u[0]);
}
for(const [query,code] of [['cook','63200'],['boilermaker','72103'],['roofer','73110'],['hairstylist','63210'],['baker','63202'],['landscape horticulturist','22114'],['cabinetmaker','72311'],['powerline technician','72203'],['électricien','72200'],['NOC 00010','00010']]) {
  assert.ok(context.window.testSearch(query).items.some(x=>x.u.code===code),query+' should find '+code);
}
assert.match(element('results').innerHTML,/Cooks/);
assert.match(element('coverage-summary').textContent,/516.*27,935/);
assert.equal(context.window.testSearch('7').items.length,data.units.filter(u=>u[0][0]==='7').length);
assert.equal(context.window.testSearch('zzzzzzzzz').items.length,0);
console.log('PASS: runtime render, complete 516-group directory, all exact codes, 27,935 examples, 10 categories, cross-category trades, French, leading-zero codes, category prefix and no-match searches');
