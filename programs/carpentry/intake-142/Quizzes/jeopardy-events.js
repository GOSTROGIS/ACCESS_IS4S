/* Build Your Score: secret tiles, pitfalls, random events and their trade art.
   Data only. The engine (jeopardy-engine.js) and the page read it.
   Art is inline SVG. It uses currentColor and the page's CSS custom properties, so it follows the theme. */
(function (root) {
  'use strict';
  const svg = body => '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">' + body + '</svg>';
  const ART = {
    hardhat: svg('<path d="M10 42h44v6H10z" fill="currentColor"/><path d="M14 42c0-11 8-19 18-19s18 8 18 19z" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M28 23h8v10h-8z" fill="currentColor"/><path d="M4 44h56" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
    star: svg('<path d="M10 42h44v6H10z" fill="currentColor"/><path d="M14 42c0-11 8-19 18-19s18 8 18 19z" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M32 6l3 7 7 .6-5.4 4.6 1.7 7L32 21.5 25.7 25l1.7-7L22 13.6l7-.6z" fill="var(--gold)" stroke="currentColor" stroke-width="1.5"/>'),
    coins: svg('<ellipse cx="24" cy="44" rx="16" ry="6" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><ellipse cx="24" cy="36" rx="16" ry="6" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><ellipse cx="40" cy="26" rx="16" ry="6" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M36 22l8 8M44 22l-8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    toolbox: svg('<rect x="8" y="26" width="48" height="26" rx="3" fill="var(--crimson)" stroke="currentColor" stroke-width="2"/><path d="M24 26v-8h16v8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 36h48" stroke="currentColor" stroke-width="2"/><rect x="28" y="33" width="8" height="7" fill="var(--gold)" stroke="currentColor" stroke-width="1.5"/>'),
    hazard: svg('<path d="M32 6l28 50H4z" fill="var(--gold)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M32 22v18" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="48" r="3" fill="currentColor"/>'),
    nail: svg('<path d="M14 10h20" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M24 12v20c0 6 4 9 12 10s14 4 14 12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M6 58h52" stroke="var(--line)" stroke-width="4"/>'),
    gavel: svg('<rect x="22" y="10" width="26" height="12" rx="2" transform="rotate(35 35 16)" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M28 26L10 50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M34 54h24" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),
    rework: svg('<path d="M48 22a18 18 0 1 0 4 16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M50 8v16H34" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    inspector: svg('<rect x="14" y="10" width="36" height="46" rx="3" fill="var(--paper)" stroke="currentColor" stroke-width="3"/><rect x="24" y="6" width="16" height="8" rx="2" fill="currentColor"/><path d="M21 28l5 5 9-10M21 44h22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    lumber: svg('<rect x="6" y="40" width="52" height="10" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><rect x="6" y="28" width="52" height="10" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M12 22h18" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4"/><path d="M40 10l14 14M54 10L40 24" stroke="var(--crimson)" stroke-width="4" stroke-linecap="round"/>'),
    clock: svg('<circle cx="32" cy="34" r="22" fill="var(--paper)" stroke="currentColor" stroke-width="4"/><path d="M32 20v14l10 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M24 6h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
    cone: svg('<path d="M26 8h12l12 44H14z" fill="var(--crimson)" stroke="currentColor" stroke-width="2"/><path d="M22 24h20l3 10H19z" fill="var(--paper)"/><rect x="6" y="50" width="52" height="8" rx="2" fill="currentColor"/>'),
    clipboard: svg('<rect x="12" y="10" width="40" height="48" rx="3" fill="var(--paper)" stroke="currentColor" stroke-width="3"/><rect x="24" y="6" width="16" height="8" rx="2" fill="currentColor"/><path d="M20 26h24M20 34h24M20 42h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M38 40l10 10" stroke="var(--crimson)" stroke-width="4" stroke-linecap="round"/>'),
    cheque: svg('<rect x="4" y="16" width="56" height="32" rx="3" fill="var(--paper)" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="32" r="8" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M34 26h18M34 34h18M34 42h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
    rain: svg('<path d="M18 36a10 10 0 0 1 2-20 14 14 0 0 1 26 4 8 8 0 0 1 0 16z" fill="var(--paper)" stroke="currentColor" stroke-width="3"/><path d="M22 44l-3 8M34 44l-3 8M46 44l-3 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
    swap: svg('<path d="M10 22h40M40 12l10 10-10 10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M54 44H14M24 34L14 44l10 10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    tape: svg('<rect x="6" y="18" width="34" height="34" rx="6" fill="var(--gold)" stroke="currentColor" stroke-width="3"/><circle cx="23" cy="35" r="8" fill="var(--paper)" stroke="currentColor" stroke-width="2"/><path d="M40 44h20v8H40z" fill="var(--gold)" stroke="currentColor" stroke-width="2"/><path d="M46 44v4M52 44v4M58 44v4" stroke="currentColor" stroke-width="2"/>'),
    level: svg('<rect x="4" y="24" width="56" height="16" rx="3" fill="var(--gold)" stroke="currentColor" stroke-width="3"/><rect x="24" y="28" width="16" height="8" rx="4" fill="var(--paper)" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/>'),
    saw: svg('<path d="M8 40l40-24 6 10-40 24z" fill="var(--paper)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 50l3-5 2 4 3-5 2 4 3-5 2 4 3-5 2 4 3-5 2 4 3-5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="46" y="8" width="14" height="18" rx="4" fill="var(--crimson)" stroke="currentColor" stroke-width="2"/>')
  };

  /* Secret tiles. kind 'bonus' or 'pitfall'. Hidden on the board until the tile opens. */
  const TILES = {
    foreman: { kind: 'bonus', title: "Foreman's Call", art: 'star', text: 'Wager before you see the question. A right answer adds the wager. A wrong answer takes it away.' },
    double: { kind: 'bonus', title: 'Double Pay', art: 'coins', text: 'This tile pays double its value.' },
    crib: { kind: 'bonus', title: 'Tool Crib', art: 'toolbox', text: 'Answer right to also win a tool token: Hint, 50/50 or Measure Twice.' },
    hazard: { kind: 'pitfall', title: 'Hidden Hazard', art: 'hazard', text: 'A wrong answer takes away the tile value.' },
    bentnail: { kind: 'pitfall', title: 'Bent Nail', art: 'nail', text: 'A wrong answer also costs your team its next turn.' },
    openbid: { kind: 'pitfall', title: 'Open Bid', art: 'gavel', text: 'After a wrong answer, the other teams may steal in turn for half the value.' },
    rework: { kind: 'pitfall', title: 'Rework', art: 'rework', text: 'A wrong answer sends this tile back to the board for later, at the same value.' }
  };

  /* Random events, rolled between turns. minTeams is the smallest team count. An event with minTeams 1 also runs in solo play. */
  const EVENTS = [
    { id: 'inspector', title: 'Inspector Visit', art: 'inspector', weight: 3, minTeams: 1,
      text: 'The next answer must include the unit.', effect: 'A right answer with the unit earns +100 for passing inspection. A wrong answer, or a missing unit, costs 100.' },
    { id: 'shortage', title: 'Material Shortage', art: 'lumber', weight: 3, minTeams: 1,
      text: 'A delivery is late.', effect: 'The highest open tile in one column is locked for the next 2 turns.' },
    { id: 'rush', title: 'Rush Job', art: 'clock', weight: 3, minTeams: 1,
      text: 'The client wants it today.', effect: 'The next question pays × 1.5. If the timer is on, it gets half the time.' },
    { id: 'standdown', title: 'Safety Stand-down', art: 'cone', weight: 2, minTeams: 1,
      text: 'Tools down. Everyone answers one quick question.', effect: 'Every team answers. Each right answer earns +100.' },
    { id: 'changeorder', title: 'Change Order', art: 'clipboard', weight: 2, minTeams: 1,
      text: 'The plans changed.', effect: 'Two open tiles swap their point values.' },
    { id: 'payday', title: 'Payday', art: 'cheque', weight: 2, minTeams: 2,
      text: 'The cheques came in.', effect: 'The team in last place gets +200.' },
    { id: 'weather', title: 'Weather Delay', art: 'rain', weight: 2, minTeams: 2,
      text: 'Rain stops work on site.', effect: 'The team up next loses this turn. Play moves to the following team.' },
    { id: 'crewswap', title: 'Crew Swap', art: 'swap', weight: 2, minTeams: 3,
      text: 'The foreman moves people around.', effect: 'The team that just played picks which team plays next.' },
    { id: 'measuretwice', title: 'Measure Twice', art: 'tape', weight: 2, minTeams: 1,
      text: 'Measure twice, cut once.', effect: 'The team up next gets one retry on a wrong number answer.' }
  ];

  const TOKENS = {
    hint: { title: 'Hint', text: 'Shows the first sentence of the worked method.' },
    fifty: { title: '50/50', text: 'Removes two wrong choices.' },
    retry: { title: 'Measure Twice', text: 'One more try after a wrong number answer.' }
  };

  const SPECIAL = {
    final: { title: 'Final Inspection', art: 'level' },
    tiebreak: { title: 'Closest Cut', art: 'saw' },
    stand: { title: 'Safety Stand-down', art: 'cone' }
  };

  const api = { ART, TILES, EVENTS, TOKENS, SPECIAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JeopardyEvents = api;
})(typeof window !== 'undefined' ? window : globalThis);
