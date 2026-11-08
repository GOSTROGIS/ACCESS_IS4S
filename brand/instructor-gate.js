/* ACCESS IS4S instructor code lock.
 *
 * Instructor guides, answer keys and teaching tools ask for a 3-digit code before they show.
 * The code is not stored in plain text: the page compares a SHA-256 hash of
 * "access-is4s-instructor:" plus the code. Once the right code is entered, every instructor
 * page opens for the rest of the browser session (this tab and its history).
 *
 * This is a deterrent on a static website, not real access control. The files themselves
 * are still public in the repository and can be opened by anyone who knows where to look.
 *
 * Use on a page:   <script src="../brand/instructor-gate.js" data-gate="page"></script> in <head>
 * Use in an app:   ACCESSInstructorGate.request(() => openTheTool())
 *
 * To change the code, replace CODE_HASH with the SHA-256 of "access-is4s-instructor:NNN".
 */
(function () {
  'use strict';
  if (window.ACCESSInstructorGate) return;

  var CODE_LENGTH = 3;
  var CODE_HASH = 'e6fff51f292a88024eb78275a8ea313dc1cccff8e23b72ae8bfa539e51ba014f';
  var PREFIX = 'access-is4s-instructor:';
  var STORAGE_KEY = 'access-is4s-instructor-unlocked';
  var doc = document;
  var me = doc.currentScript;
  var gatePage = !!(me && me.getAttribute('data-gate') === 'page');
  var memoryUnlocked = false;

  function readUnlocked() {
    try { return window.sessionStorage.getItem(STORAGE_KEY) === '1' || memoryUnlocked; } catch (err) { return memoryUnlocked; }
  }
  function writeUnlocked(on) {
    memoryUnlocked = on;
    try { on ? window.sessionStorage.setItem(STORAGE_KEY, '1') : window.sessionStorage.removeItem(STORAGE_KEY); } catch (err) { /* storage blocked: lasts for this page only */ }
  }

  /* SHA-256. Web Crypto is used when the page is served over https. The small fallback below
     covers pages opened straight from a downloaded copy (file://), where Web Crypto is missing. */
  function sha256Fallback(str) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = Array.prototype.slice.call(new TextEncoder().encode(str));
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? 0 : (bitLen >>> (s * 8)) & 0xff);
    for (var off = 0; off < bytes.length; off += 64) {
      var w = new Array(64);
      for (var i = 0; i < 16; i++) {
        w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
        var s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  function sha256(str) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.resolve(sha256Fallback(str));
    return subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }, function () { return sha256Fallback(str); });
  }

  function checkCode(code) {
    if (typeof code !== 'string' || code.length !== CODE_LENGTH || !/^\d+$/.test(code)) return Promise.resolve(false);
    return sha256(PREFIX + code).then(function (hex) { return hex === CODE_HASH; });
  }

  /* Styles use the site's colour tokens, with fallbacks for pages that do not load brand/site.css. */
  var STYLE = [
    'html.ig-locked body>*:not(.ig-host){display:none!important}',
    'html.ig-locked body{min-height:100vh;min-height:100dvh;background:var(--bg,#F7F4F1)}',
    '.ig-host{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb,var(--ink,#1A1512) 55%,transparent);font-family:var(--font-body,"IBM Plex Sans","Segoe UI",Arial,sans-serif)}',
    'html.ig-locked .ig-host{background:var(--bg,#F7F4F1)}',
    '.ig-card{width:min(360px,100%);background:var(--surface,#FFFFFF);color:var(--ink,#1A1512);border:1px solid var(--line,#E5E0DA);border-top:6px solid var(--red,#D2181F);border-radius:12px;padding:22px 22px 18px;box-shadow:0 18px 50px color-mix(in srgb,var(--ink,#1A1512) 25%,transparent)}',
    '.ig-card h2{margin:0 0 6px;font-family:var(--font-display,"Archivo",Arial,sans-serif);font-size:20px;color:var(--red-text,#B5141B)}',
    '.ig-card p{margin:0 0 14px;color:var(--muted,#625D58);font-size:14px;line-height:1.45}',
    '.ig-dials{display:flex;gap:12px;justify-content:center;margin:4px 0 12px}',
    '.ig-dial{display:flex;flex-direction:column;align-items:center;gap:4px}',
    '.ig-dial button{width:48px;height:30px;border-radius:8px;border:1px solid var(--line-strong,#CFC8C0);background:var(--gold-tint,#FFF8E6);color:var(--ink,#1A1512);font-size:15px;cursor:pointer}',
    '.ig-dial input{width:48px;height:56px;text-align:center;font:700 28px/1 ui-monospace,Consolas,monospace;border:2px solid var(--ink,#1A1512);border-radius:10px;background:var(--surface,#FFFFFF);color:var(--ink,#1A1512)}',
    '.ig-dial input:focus,.ig-card button:focus-visible{outline:3px solid var(--focus,#C60016);outline-offset:2px}',
    '.ig-msg{min-height:20px;margin:0 0 8px;text-align:center;color:var(--red-text,#B5141B);font-size:14px;font-weight:600}',
    '.ig-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}',
    '.ig-actions button{padding:9px 16px;border-radius:8px;border:1px solid var(--line-strong,#CFC8C0);background:var(--surface,#FFFFFF);color:var(--ink,#1A1512);font-weight:600;font-size:15px;cursor:pointer}',
    '.ig-actions button[type=submit]{background:#B5141B;border-color:#B5141B;color:#FFFFFF}',
    '.ig-card.ig-shake{animation:ig-shake .35s}',
    '@keyframes ig-shake{25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-4px)}}',
    '@media (prefers-reduced-motion:reduce){.ig-card.ig-shake{animation:none}}',
    '.ig-pill{position:fixed;left:12px;bottom:12px;z-index:2147482000;padding:7px 12px;border-radius:999px;border:1px solid var(--line-strong,#CFC8C0);background:var(--surface,#FFFFFF);color:var(--ink,#1A1512);font:600 13px/1.2 var(--font-body,"Segoe UI",Arial,sans-serif);cursor:pointer;box-shadow:0 2px 10px color-mix(in srgb,var(--ink,#1A1512) 18%,transparent)}',
    '@media print{.ig-pill,.ig-host{display:none!important}html.ig-locked body>*{display:none!important}}'
  ].join('\n');

  function addStyle() {
    if (doc.getElementById('ig-style')) return;
    var st = doc.createElement('style');
    st.id = 'ig-style';
    st.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(st);
  }

  var waiting = [];
  var host = null;

  function finishUnlock() {
    doc.documentElement.classList.remove('ig-locked');
    if (host) { host.remove(); host = null; }
    var run = waiting; waiting = [];
    run.forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
    if (gatePage) addPill();
  }

  function el(tag, attrs, text) {
    var n = doc.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }

  function openDialog(opts) {
    opts = opts || {};
    addStyle();
    if (host) { var first = host.querySelector('input'); if (first) first.focus(); return; }
    host = el('div', { 'class': 'ig-host' });
    var card = el('div', { 'class': 'ig-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ig-title', 'aria-describedby': 'ig-desc' });
    card.appendChild(el('h2', { id: 'ig-title' }, 'Instructor access'));
    card.appendChild(el('p', { id: 'ig-desc' }, opts.message || 'This page is for instructors. Enter the ' + CODE_LENGTH + '-digit instructor code to open it.'));
    var form = el('form', { novalidate: '' });
    card.appendChild(form);
    var dials = el('div', { 'class': 'ig-dials' });
    var inputs = [];
    for (var i = 0; i < CODE_LENGTH; i++) {
      (function (i) {
        var d = el('div', { 'class': 'ig-dial' });
        var up = el('button', { type: 'button', 'aria-label': 'Digit ' + (i + 1) + ' up', tabindex: '-1' }, '▲');
        var inp = el('input', { inputmode: 'numeric', maxlength: '1', autocomplete: 'off', 'aria-label': 'Digit ' + (i + 1) + ' of ' + CODE_LENGTH, value: '' });
        var down = el('button', { type: 'button', 'aria-label': 'Digit ' + (i + 1) + ' down', tabindex: '-1' }, '▼');
        function step(n) { var v = parseInt(inp.value || '0', 10); inp.value = String((v + n + 10) % 10); inp.focus(); }
        up.addEventListener('click', function () { step(1); });
        down.addEventListener('click', function () { step(-1); });
        inp.addEventListener('input', function () {
          inp.value = inp.value.replace(/\D/g, '').slice(-1);
          if (inp.value && inputs[i + 1]) inputs[i + 1].focus();
        });
        inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Backspace' && !inp.value && inputs[i - 1]) inputs[i - 1].focus();
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); step(1); }
          else if (ev.key === 'ArrowDown') { ev.preventDefault(); step(-1); }
        });
        inp.addEventListener('paste', function (ev) {
          var t = ((ev.clipboardData && ev.clipboardData.getData('text')) || '').replace(/\D/g, '');
          if (t.length >= CODE_LENGTH) { ev.preventDefault(); inputs.forEach(function (x, j) { x.value = t[j]; }); inputs[CODE_LENGTH - 1].focus(); }
        });
        d.appendChild(up); d.appendChild(inp); d.appendChild(down);
        dials.appendChild(d); inputs.push(inp);
      })(i);
    }
    form.appendChild(dials);
    var msg = el('p', { 'class': 'ig-msg', role: 'status', 'aria-live': 'polite' });
    form.appendChild(msg);
    var actions = el('div', { 'class': 'ig-actions' });
    var back = el('button', { type: 'button' }, opts.cancelLabel || (gatePage ? 'Go back' : 'Cancel'));
    var ok = el('button', { type: 'submit' }, 'Unlock');
    actions.appendChild(back); actions.appendChild(ok);
    form.appendChild(actions);
    back.addEventListener('click', function () {
      if (gatePage && doc.documentElement.classList.contains('ig-locked')) {
        if (window.history.length > 1) window.history.back();
        else window.location.href = (me && me.src) ? new URL('../index.html', me.src).href : '/';
        return;
      }
      waiting = [];
      host.remove(); host = null;
      if (opts.onCancel) opts.onCancel();
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var code = inputs.map(function (x) { return x.value; }).join('');
      checkCode(code).then(function (good) {
        if (good) { writeUnlocked(true); finishUnlock(); return; }
        msg.textContent = code.length < CODE_LENGTH ? 'Enter all ' + CODE_LENGTH + ' digits.' : 'That code is not right. Try again.';
        card.classList.remove('ig-shake'); void card.offsetWidth; card.classList.add('ig-shake');
        inputs.forEach(function (x) { x.value = ''; });
        inputs[0].focus();
      });
    });
    host.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !(gatePage && doc.documentElement.classList.contains('ig-locked'))) back.click();
    });
    host.appendChild(card);
    doc.body.appendChild(host);
    inputs[0].focus();
  }

  function addPill() {
    if (doc.querySelector('.ig-pill')) return;
    var pill = el('button', { type: 'button', 'class': 'ig-pill', title: 'Lock instructor pages again on this device' }, '🔓 Instructor: lock');
    pill.addEventListener('click', function () { api.lock(); window.location.reload(); });
    doc.body.appendChild(pill);
  }

  function whenBody(fn) {
    if (doc.body) fn(); else doc.addEventListener('DOMContentLoaded', fn);
  }

  var api = {
    isUnlocked: readUnlocked,
    checkCode: checkCode,
    /* Run fn now if unlocked, otherwise ask for the code first. */
    request: function (fn, opts) {
      if (readUnlocked()) { if (fn) fn(); return true; }
      if (fn) waiting.push(fn);
      whenBody(function () { openDialog(opts); });
      return false;
    },
    lock: function () { writeUnlocked(false); }
  };
  window.ACCESSInstructorGate = api;

  if (gatePage) {
    addStyle();
    if (readUnlocked()) {
      whenBody(addPill);
    } else {
      doc.documentElement.classList.add('ig-locked');
      whenBody(function () { openDialog(); });
    }
  }
})();
