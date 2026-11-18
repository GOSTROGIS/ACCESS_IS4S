const ignored = new Set(('a an am and any are as at be between by can could did difference do does explain for from give had has have help how i im in into is it its me my of on or our please should some that the their them there these this those to use was we what when where which who why will with would you your').split(' '));

// For a definition the course gives explicitly, preserve its wording and the
// direction of the relationship (particularly important for quantities).
export function definedTerms(question, sources) {
  const term = '([a-z][a-z -]{0,50}?)';
  const compare = new RegExp('^(?:what is|what.s) the difference between ' + term + ' and ' + term + '[?.!]*$', 'i');
  const define = new RegExp('^(?:what is|what.s|define) (?:a |an |the )?' + term + '[?.!]*$', 'i');
  const match = compare.exec(question) || define.exec(question);
  if (!match) return null;
  for (const source of sources) {
    const sentences = source.text.match(/[^.!?]+[.!?](?=\s|$)/g) || [];
    const definitions = match.slice(1).map(name => {
      const starts = new RegExp('^(?:an? |the )?' + name.trim() + ' (?:is|are|means|refers to|stands for) ', 'i');
      return sentences.map(s => s.trim()).find(s => starts.test(s) && s.length <= 320);
    });
    if (definitions.every(Boolean)) return definitions.join(' ');
  }
  return null;
}
function terms(text) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(word => word.length > 1 && !ignored.has(word))
    .map(word => word.length > 4 ? word.replace(/(?:es|s)$/, '') : word));
}

// The model's context is small. Rank individual passages so it sees the matching
// explanation even when it appears near the end of a long learner chapter.
export function findPassages(rows, question, lessonPath) {
  const query = terms(question);
  const weights = new Map();
  for (const word of query) {
    const documents = rows.filter(row => row.text.toLowerCase().includes(word)).length;
    weights.set(word, Math.log(1 + rows.length / (1 + documents)));
  }
  const score = text => [...terms(text)].reduce((sum, word) => sum + (weights.get(word) || 0), 0);
  const candidates = [];
  for (const row of rows) {
    const current = row.url === lessonPath;
    const lines = row.text.split('\n').filter(line => line.length > 12);
    let best = 0, match = 0;
    for (let i = 0; i < lines.length; i++) {
      const n = score(lines[i]);
      if (n > match) { match = n; best = i; }
    }
    const titleMatch = score(row.title + ' ' + row.skill);
    if (!current && !titleMatch && !match) continue;
    candidates.push({title: row.title, url: row.url,
      text: lines.slice(best, best + 4).join(' ').slice(0, 550),
      rank: titleMatch * 2 + match + (current ? 2 : 0)});
  }
  return candidates.sort((a, b) => b.rank - a.rank).slice(0, 1);
}
