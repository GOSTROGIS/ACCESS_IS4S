'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'skills/numeracy/hub/index.html'), 'utf8');
assert.doesNotMatch(html, /ACCESSInstructorGate|instructor-gate\.js|needs the instructor code|LOCKED\[/);
const script = html.slice(html.indexOf('/* Shell navigation:'), html.indexOf('/* Hub frames:'));
function setup(hash = '', saved = '') {
  const nodes = {}, groups = [], tabs = [], lists = [], events = {}, data = { 'access-shell-tab-v1': saved };
  function node(id, attrs = {}) {
    return nodes[id] = { id, attrs, hidden: true, events: {}, getAttribute(k) { return this.attrs[k]; }, setAttribute(k,v) { this.attrs[k] = v; }, addEventListener(k,fn) { this.events[k] = fn; }, focus() {}, scrollIntoView() {}, querySelector() { return null; } };
  }
  for (const match of html.matchAll(/<button[^>]*class="hubnav-group"[^>]*id="([^"]+)"[^>]*aria-controls="([^"]+)"/g)) {
    const group = node(match[1], { 'aria-controls': match[2] }); groups.push(group);
    const sub = node(match[2], { 'aria-labelledby': match[1] });
    const list = { tabs: [], querySelectorAll() { return this.tabs; } }; lists.push(list); sub.querySelectorAll = () => list.tabs;
    const fragment = html.slice(html.indexOf('id="' + match[2] + '"')).split('</div>')[0];
    for (const m of fragment.matchAll(/<button[^>]*class="tab"[^>]*id="([^"]+)"[^>]*aria-controls="([^"]+)"/g)) {
      const tab = node(m[1], { 'aria-controls': m[2] }); node(m[2]); tab.closest = s => s === '.hubnav-sub' ? sub : list; tabs.push(tab); list.tabs.push(tab);
    }
  }
  const G = { document: { querySelectorAll(s) { return s === '.hubnav .tab' ? tabs : s === '.hubnav-group' ? groups : lists; }, querySelector() { return null; }, getElementById(id) { return nodes[id]; } }, location: { hash, origin: 'http://localhost' }, localStorage: { getItem(k) { return data[k]; }, setItem(k,v) { data[k]=v; } }, history: { replaceState(_,__,h) { G.location.hash = h; } }, addEventListener(k,fn) { events[k] = fn; } };
  vm.runInNewContext(script, { window: G });
  return { G, nodes, events };
}
for (const [hash, saved] of [['#exam',''], ['', 'exam']]) {
  const { G, nodes } = setup(hash, saved);
  assert.equal(G.HubNav.current(), 'exam'); assert.equal(nodes['p-exam'].hidden, false);
}
const { G, nodes, events } = setup('#shape');
nodes['g-instr'].events.click(); assert.equal(G.HubNav.current(), 'exam');
nodes['g-found'].events.click(); assert.equal(G.HubNav.current(), 'basics');
nodes['t-exam'].events.click(); assert.equal(G.HubNav.current(), 'exam');
G.HubNav.open('shape'); G.location.hash = '#exam'; events.hashchange(); assert.equal(G.HubNav.current(), 'exam');
G.HubNav.open('shape'); events.message({ data: { shell: 'tab', id: 'exam' } }); assert.equal(G.HubNav.current(), 'exam');
for (const p of ['skills/communication/teaching.html', 'skills/numeracy/answers.html']) assert.match(fs.readFileSync(path.join(root,p),'utf8'), /instructor-gate\.js["'] data-gate=["']page/);
console.log('PASS: fresh/saved Exam builder, group/tab clicks, hash/message navigation, no Hub gate, and preserved chapter gates');
