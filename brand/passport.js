/* ACCESS IS4S practice passport for the home page.
 * Reads the stars that brand/practice.js saves in this browser (localStorage key is4s-practice-v1)
 * and fills in one stamp per skill. It loads no exercise banks, so the home page stays light.
 * Markup:  <div data-px-passport="reading:Reading:12,writing:Writing:9"></div>  (skill:name:set count)
 */
(function () {
  'use strict';
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  function saved() {
    try { var d = JSON.parse(window.localStorage.getItem('is4s-practice-v1') || '{}'); return (d && d.sets) || {}; } catch (err) { return {}; }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function draw(host) {
    var sets = saved(), list = el('ul', 'passport-list'), total = 0;
    host.getAttribute('data-px-passport').split(',').filter(Boolean).forEach(function (entry) {
      var bits = entry.split(':'), slug = bits[0], max = 3 * (+bits[2] || 0), got = 0;
      Object.keys(sets).forEach(function (id) { if (id.indexOf(slug + '.') === 0) got += sets[id].stars || 0; });
      total += got;
      var li = el('li', 'stamp' + (got ? ' on' : '')), a = el('a'), stars = el('span', 'stamp-stars'), bar = el('span', 'stamp-bar'), fillBar = el('span');
      a.href = 'skills/' + slug + '/practice/index.html';
      stars.innerHTML = STAR;
      stars.appendChild(document.createTextNode(' ' + got + (max ? ' / ' + max : '') + ' stars'));
      bar.setAttribute('aria-hidden', 'true');
      fillBar.style.width = (max ? Math.round(100 * got / max) : 0) + '%';
      bar.appendChild(fillBar);
      a.appendChild(el('span', 'stamp-name', bits[1] || slug)); a.appendChild(stars); a.appendChild(bar);
      li.appendChild(a); list.appendChild(li);
    });
    host.innerHTML = '';
    host.appendChild(el('p', 'passport-note', total ? 'You have ' + total + ' practice stars on this browser.' : 'Earn stars in any practice arcade and your stamps fill in here. Progress stays on this browser.'));
    host.appendChild(list);
  }
  function drawAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-px-passport]'), draw); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', drawAll);
  else drawAll();
})();
