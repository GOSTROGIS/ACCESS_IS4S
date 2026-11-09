/* Shared by the quiz game (jeopardy-engine.js) and the printable generator (generator-engine.js, generator-app.js).
   Random helpers are bit-identical to the versions both tools used before, so published round and quiz codes still replay. */
(function (root) {
  'use strict';
  /* mulberry32. A number seed is used as an unsigned 32-bit value. A text seed is read as base 36. */
  function seeded(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : parseInt(String(seed), 36) >>> 0;
    return function () { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  /* Fisher-Yates on a copy. */
  function shuffle(items, random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  /* A fresh unsigned 32-bit seed from the platform's crypto source. */
  function freshSeed() {
    const c = root.crypto;
    if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }
  /* The same seed as a six-character base 36 round code. */
  function freshCode() { return freshSeed().toString(36).toUpperCase().padStart(6, '0'); }

  /* Lecture dates are calendar dates, so they are always shown in UTC to keep the same day everywhere. */
  const formats = {};
  function lectureDate(iso, withYear) {
    const key = withYear ? 'y' : 'n';
    formats[key] = formats[key] || new Intl.DateTimeFormat('en-CA', Object.assign({ month: 'short', day: 'numeric', timeZone: 'UTC' }, withYear ? { year: 'numeric' } : {}));
    return formats[key].format(new Date(iso + 'T12:00:00Z'));
  }

  const api = { seeded, shuffle, freshSeed, freshCode, lectureDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuizShared = api;
})(typeof window !== 'undefined' ? window : globalThis);
