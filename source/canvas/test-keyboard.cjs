'use strict';
// Execute the shipped handler, rather than a second implementation of it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../../skills/numeracy/shape-canvas/index.html'), 'utf8');
const script = html.split('<script id="js-interact">')[1].split('</script>')[0];
const typing = script.slice(script.indexOf('  function typing('), script.indexOf('  function nudge('));
const handler = script.slice(script.indexOf('  function controlTarget('), script.indexOf('  function init()'));
assert.ok(typing && handler.includes('function key(e)'));
const calls = [];
const S = { sel: ['shape-1'], tool: 'select', presenter: false, z: 1 };
let popOpen = false;
const body = { tagName: 'BODY' };
const c = {
  S, GRID: 20, space: false, document: { body },
  SC: {
    P: { closePops() { if (!popOpen) return false; popOpen = false; calls.push('closePop'); return true; }, focusSizes() { calls.push('sizes'); }, closeDrawers() { calls.push('drawers'); } },
    A: Object.fromEntries(['undo', 'redo', 'duplicate', 'removeSel', 'page', 'toggleGrid', 'presenter'].map(k => [k, (...a) => calls.push([k, ...a])])),
    Cx: { group: () => calls.push('group'), openForSelection: () => calls.push('context') }
  },
  nudge: (x, y) => { calls.push(['nudge', x, y]); return true; },
  rotateSel: d => calls.push(['rotate', d]),
  setTool: t => calls.push(['tool', t]),
  select: ids => calls.push(['select', ...ids]),
  V: { fit: () => calls.push('fit'), zoomAt: n => calls.push(['zoom', n]) }
};
vm.createContext(c);
vm.runInContext(typing + handler + '\nthis.key = key;', c);
function run(key, target = body, extra = {}) {
  calls.length = 0;
  const e = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
  c.key(e);
  return e;
}
function control(selector, tagName = 'DIV') {
  return { tagName, closest(selectors) { return selectors.split(', ').includes(selector) ? this : null; } };
}
const controls = [
  control('button', 'BUTTON'), control('a[href]', 'A'), control('summary', 'SUMMARY'),
  ...['INPUT', 'TEXTAREA', 'SELECT'].map(tagName => ({ tagName })),
  { tagName: 'SPAN', isContentEditable: true },
  ...['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'textbox', 'combobox', 'listbox', 'option', 'treeitem'].map(r => control(`[role="${r}"]`)),
  // Events from nested icon/text elements still belong to their button/link.
  control('button', 'SPAN'), control('a[href]', 'svg')
];
for (const target of controls) {
  for (const key of ['Enter', ' ', 'ArrowRight', 'ArrowLeft', 'Delete', 'Backspace', 'PageDown', 'p', 'g', '+', 'Escape']) {
    const e = run(key, target);
    assert.deepEqual(calls, [], `${target.tagName}: ${key} must stay local`);
    assert.equal(e.defaultPrevented, false);
  }
  run('z', target, { ctrlKey: true });
  assert.deepEqual(calls, [], 'Do not hijack control undo');
}
// Simulate a tab that already handled ArrowRight before bubbling to window.
run('ArrowRight', body, { defaultPrevented: true });
assert.deepEqual(calls, []);
popOpen = true;
run('Escape', body, { defaultPrevented: true });
assert.equal(popOpen, true, 'Handled Escape must not close another layer');
assert.deepEqual(calls, []);
run('Escape', controls[0]);
assert.deepEqual(calls, ['closePop'], 'Unconsumed Escape still dismisses canvas popovers');
// SVG object role=img must not be mistaken for an interactive form control.
const shape = { tagName: 'g', closest() { return null; } };
assert.equal(run('ArrowRight', shape).defaultPrevented, true);
assert.deepEqual(calls, [['nudge', 2, 0]]);
run('ArrowUp', shape, { shiftKey: true });
assert.deepEqual(calls, [['nudge', 0, -20]]);
run('Enter', shape); assert.deepEqual(calls, ['sizes']);
run('Delete', shape); assert.deepEqual(calls, [['removeSel']]);
run('d', shape, { ctrlKey: true }); assert.deepEqual(calls, [['duplicate']]);
run('p', shape); assert.deepEqual(calls, [['tool', 'pen']]);
run('Escape', shape); assert.deepEqual(calls, [['select']]);
// The stage-specific object Enter handler remains in place and stops bubbling.
assert.match(script, /stage\.addEventListener\('keydown',[\s\S]*?contains\('obj'\)[\s\S]*?e\.stopPropagation\(\); SC\.P\.focusSizes\(\);/);
console.log('PASS: actual Canvas handler preserves native/widget keys and selected-object shortcuts; handled events and popup Escape tested.');
