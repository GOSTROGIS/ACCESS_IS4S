/* Original, dependency-free critical path teaching model. */
(function (root) {
  'use strict';
  const baseline = [
    {id:'A',name:'Site setup',duration:2,pred:[]},
    {id:'B',name:'Frame',duration:4,pred:['A']},
    {id:'C',name:'Order materials',duration:3,pred:['A']},
    {id:'D',name:'Services',duration:2,pred:['B']},
    {id:'E',name:'Finish',duration:3,pred:['C','D']},
    {id:'F',name:'Inspection',duration:1,pred:['E']}
  ];
  baseline.forEach(t => {Object.freeze(t.pred); Object.freeze(t);}); Object.freeze(baseline);
  function calculate(input) {
    if (!Array.isArray(input) || !input.length) throw new Error('Add at least one task.');
    const tasks = input.map(t => ({...t,pred:[...t.pred],succ:[]}));
    const map = new Map(tasks.map(t => [t.id,t]));
    if (map.size !== tasks.length) throw new Error('Task IDs must be unique.');
    for (const t of tasks) {
      if (!Number.isInteger(t.duration) || t.duration < 1 || t.duration > 20) throw new Error('Durations must be whole working days from 1 to 20.');
      if (new Set(t.pred).size !== t.pred.length) throw new Error('A predecessor cannot be repeated.');
      for (const p of t.pred) {if (!map.has(p)) throw new Error('Unknown predecessor: '+p); map.get(p).succ.push(t.id);}
    }
    const ordered = [], pending = new Set(tasks.map(t => t.id));
    while (pending.size) {
      const ready = tasks.filter(t => pending.has(t.id) && t.pred.every(p => !pending.has(p)));
      if (!ready.length) throw new Error('Predecessors must not form a cycle.');
      for (const t of ready) {
        t.ES = Math.max(0,...t.pred.map(p => map.get(p).EF)); t.EF = t.ES+t.duration;
        ordered.push(t); pending.delete(t.id);
      }
    }
    const finish = Math.max(...tasks.map(t => t.EF));
    for (const t of [...ordered].reverse()) {
      t.LF = t.succ.length ? Math.min(...t.succ.map(s => map.get(s).LS)) : finish;
      t.LS = t.LF-t.duration; t.TF=t.LS-t.ES;
      t.FF = (t.succ.length ? Math.min(...t.succ.map(s => map.get(s).ES)) : finish)-t.EF;
      t.critical = t.TF === 0;
    }
    return {tasks,finish};
  }
  const api = {baseline,calculate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduling = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
