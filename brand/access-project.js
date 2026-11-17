/* Connect learning pages to the installed project tools. */
(() => {
  'use strict';

  const navigation = document.getElementById('access-studio');
  if (!navigation || location.origin !== 'http://127.0.0.1:4180') return;

  async function connectTools() {
    const response = await fetch('/health.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;
    const health = await response.json();
    if (health.service !== 'access-is4s-folder-intranet' || health.apps !== 17 ||
        !/^[a-f0-9]{64}$/.test(health.installation)) return;

    const destination = new URL('/workspace/', location.origin);
    destination.searchParams.set('skill', navigation.dataset.skill || 'digital');
    destination.searchParams.set('app', navigation.dataset.application || 'wordcraft');
    navigation.querySelector('[data-tools-link]').href = destination.href;
    navigation.hidden = false;
    document.body.classList.add('access-tools-active');
  }

  void connectTools().catch(() => {});
})();
